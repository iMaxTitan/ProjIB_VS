/**
 * Сервис генерации AI-примечаний для отчёта по предприятию.
 * Собирает задачи из daily_tasks, группирует по мероприятиям (measures),
 * отправляет одним батчем в AI → получает заключения на украинском.
 *
 * Паттерн аналогичен quarterly-notes.service.ts.
 */

import { getReportClient } from './monthly-report.service';
import { generateAIText, hasConfiguredAIProvider } from '@/lib/ai/client';
import { getInfrastructureForPeriod } from './infrastructure.service';
import { getCompanyShare } from '@/lib/utils/hour-distribution';
import logger from '@/lib/logger';
import type { HourDistributionType } from '@/types/infrastructure';

// =============================================
// Types
// =============================================

export interface CompanyMeasureTasksContext {
  measure_id: string;
  measure_name: string;
  service_prompt?: string;
  company_name: string;
  tasks: { description: string; spent_hours: number; task_date: string }[];
  total_hours: number;
  employees_count: number;
}

type MonthlyPlanRow = {
  monthly_plan_id: string;
  measure_id: string | null;
  distribution_type: string | null;
};

type PlanCompanyRow = { monthly_plan_id: string; company_id: string };

type MeasureRow = { measure_id: string; name: string | null; service_prompt: string | null };

type DailyTaskRow = {
  daily_task_id: string;
  monthly_plan_id: string;
  user_id: string | null;
  description: string | null;
  spent_hours: number | null;
  task_date: string | null;
};

// =============================================
// Data collection
// =============================================

/**
 * Собирает контекст задач по мероприятиям для конкретного предприятия.
 * Возвращает Map<measure_id, CompanyMeasureTasksContext>.
 */
export async function collectTasksForCompanyMeasures(
  companyId: string,
  measureIds: string[],
  year: number,
  month: number
): Promise<Map<string, CompanyMeasureTasksContext>> {
  const result = new Map<string, CompanyMeasureTasksContext>();
  if (measureIds.length === 0) return result;

  const db = getReportClient();

  // 1. Загружаем планы за период с measure_id
  const { data: plans, error: plansError } = await db
    .from('monthly_plans')
    .select('monthly_plan_id, measure_id, distribution_type')
    .eq('year', year)
    .eq('month', month)
    .in('measure_id', measureIds);

  if (plansError) {
    logger.error('[CompanyNotes] Ошибка загрузки monthly_plans:', plansError);
    return result;
  }

  const typedPlans = (plans || []) as MonthlyPlanRow[];
  if (typedPlans.length === 0) return result;

  const planIds = typedPlans.map(p => p.monthly_plan_id);

  // 2. Загружаем компании планов для расчёта доли
  const { data: planCompanies, error: pcError } = await db
    .from('monthly_plan_companies')
    .select('monthly_plan_id, company_id')
    .in('monthly_plan_id', planIds);

  if (pcError) {
    logger.error('[CompanyNotes] Ошибка загрузки monthly_plan_companies:', pcError);
    return result;
  }

  const typedPlanCompanies = (planCompanies || []) as PlanCompanyRow[];

  // Фильтруем планы, к которым привязана целевая компания
  const companyPlanIds = new Set(
    typedPlanCompanies
      .filter(r => r.company_id === companyId)
      .map(r => r.monthly_plan_id)
  );

  const companiesByPlan = new Map<string, string[]>();
  for (const row of typedPlanCompanies) {
    const list = companiesByPlan.get(row.monthly_plan_id) || [];
    list.push(row.company_id);
    companiesByPlan.set(row.monthly_plan_id, list);
  }

  // Загружаем инфру для расчёта долей (service-role клиент для RLS)
  const infraMap = await getInfrastructureForPeriod(year, month, db);

  // plan → (measureId, share)
  const planMeta = new Map<string, { measureId: string; share: number }>();
  for (const plan of typedPlans) {
    if (!companyPlanIds.has(plan.monthly_plan_id) || !plan.measure_id) continue;
    const planCompanyIds = companiesByPlan.get(plan.monthly_plan_id) || [companyId];
    const distType = (plan.distribution_type as HourDistributionType) || 'even';
    const share = getCompanyShare(companyId, planCompanyIds, infraMap, distType);
    planMeta.set(plan.monthly_plan_id, { measureId: plan.measure_id, share });
  }

  const relevantPlanIds = Array.from(planMeta.keys());
  if (relevantPlanIds.length === 0) return result;

  // 3. Загружаем задачи
  const { data: tasks, error: tasksError } = await db
    .from('daily_tasks')
    .select('daily_task_id, monthly_plan_id, user_id, description, spent_hours, task_date')
    .in('monthly_plan_id', relevantPlanIds)
    .order('task_date', { ascending: false })
    .limit(10000);

  if (tasksError) {
    logger.error('[CompanyNotes] Ошибка загрузки daily_tasks:', tasksError);
    return result;
  }

  const typedTasks = (tasks || []) as DailyTaskRow[];

  // 4. Загружаем названия и промты мероприятий
  const { data: measuresData } = await db
    .from('measures')
    .select('measure_id, name, service_prompt')
    .in('measure_id', measureIds);

  const measureNameMap = new Map<string, string>();
  const measurePromptMap = new Map<string, string>();
  for (const m of ((measuresData || []) as MeasureRow[])) {
    measureNameMap.set(m.measure_id, m.name || '');
    if (m.service_prompt) measurePromptMap.set(m.measure_id, m.service_prompt);
  }

  // 5. Название компании
  const { data: companyData } = await db
    .from('companies')
    .select('company_name')
    .eq('company_id', companyId)
    .single();
  const companyName = companyData?.company_name || '';

  // 6. Агрегация по measure_id
  const aggTasks = new Map<string, DailyTaskRow[]>();
  const aggHours = new Map<string, number>();
  const aggUsers = new Map<string, Set<string>>();

  for (const t of typedTasks) {
    const meta = planMeta.get(t.monthly_plan_id);
    if (!meta) continue;

    const { measureId, share } = meta;
    const adjustedHours = (Number(t.spent_hours) || 0) * share;

    aggHours.set(measureId, (aggHours.get(measureId) || 0) + adjustedHours);

    if (t.user_id) {
      const users = aggUsers.get(measureId) || new Set<string>();
      users.add(t.user_id);
      aggUsers.set(measureId, users);
    }

    if (t.description?.trim()) {
      const arr = aggTasks.get(measureId) || [];
      arr.push(t);
      aggTasks.set(measureId, arr);
    }
  }

  // 7. Собираем контексты
  for (const measureId of measureIds) {
    const tasks2 = aggTasks.get(measureId) || [];
    result.set(measureId, {
      measure_id: measureId,
      measure_name: measureNameMap.get(measureId) || '',
      service_prompt: measurePromptMap.get(measureId),
      company_name: companyName,
      tasks: tasks2.map(t => ({
        description: t.description || '',
        spent_hours: Math.round((Number(t.spent_hours) || 0) * 100) / 100,
        task_date: t.task_date || '',
      })),
      total_hours: Math.round((aggHours.get(measureId) || 0) * 100) / 100,
      employees_count: aggUsers.get(measureId)?.size || 0,
    });
  }

  return result;
}

// =============================================
// AI generation
// =============================================

const SYSTEM_PROMPT = `Ти аналітик підрозділу інформаційної безпеки. Для кожного заходу (мероприятия) в рамках підприємства напиши розгорнуту примітку для офіційного звіту.

Правила:
1. Пиши українською мовою. 4-8 речень на кожне мероприятие.
2. Починай з дієслова минулого часу: "Забезпечено", "Проведено", "Виконано", "Здійснено", "Розроблено".
3. Базуйся на описах задач. Згадуй конкретні напрямки робіт, системи, документи, процедури з описів задач.
4. НЕ вказуй кількість задач, трудовитрати, години. Пиши тільки про суть виконаних робіт.
5. Якщо задач немає — напиши що роботи тривають згідно з планом, вкажи напрямок з назви заходу.
6. Без markdown, списків, нумерації. Тільки суцільний текст у вигляді абзацу.
7. Стиль — офіційно-діловий, але конкретний. Уникай загальних фраз без деталей.

Поверни строго JSON-масив без markdown-обгортки:
[{"id": "measure_uuid", "note": "текст"}]`;

/**
 * Генерирует AI-примечания для мероприятий в отчёте по предприятию.
 * Возвращает Map<measure_id, note_text>.
 */
export async function generateAINotesForCompanyReport(
  contexts: CompanyMeasureTasksContext[]
): Promise<Map<string, string>> {
  const notes = new Map<string, string>();

  if (contexts.length === 0 || !hasConfiguredAIProvider()) {
    return notes;
  }

  const planBlocks = contexts.map((ctx, idx) => {
    const taskLines = ctx.tasks.length > 0
      ? ctx.tasks.map(t => `- ${t.description} (${t.spent_hours}г)`).join('\n')
      : 'Задачі відсутні';

    return [
      `=== Захід ${idx + 1} ===`,
      `ID: ${ctx.measure_id}`,
      `Захід: ${ctx.measure_name}`,
      `Підприємство: ${ctx.company_name}`,
      ctx.service_prompt ? `Інструкція: ${ctx.service_prompt}` : '',
      ctx.tasks.length > 0 ? `Виконані задачі (${ctx.tasks.length}):` : '',
      taskLines,
      ctx.total_hours > 0 ? `Загальні трудовитрати: ${ctx.total_hours} год.` : '',
    ].filter(Boolean).join('\n');
  });

  const userPrompt = `Створи примітки для заходів підприємства:\n\n${planBlocks.join('\n\n')}`;

  try {
    const response = await generateAIText({
      systemPrompt: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
      maxTokens: 4000,
      temperature: 0.3,
      timeoutMs: 30_000,
      anthropicModel: 'claude-3-haiku-20240307',
      openAIModel: 'gpt-4o-mini',
    });

    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      logger.error('[CompanyNotes] AI ответ не содержит JSON массив');
      return notes;
    }

    const parsed = JSON.parse(jsonMatch[0]) as { id: string; note: string }[];

    for (const item of parsed) {
      if (item.id && item.note) {
        notes.set(item.id, item.note.trim());
      }
    }

    logger.log(`[CompanyNotes] AI сгенерировал ${notes.size}/${contexts.length} примечаний`);
  } catch (error: unknown) {
    logger.error('[CompanyNotes] Ошибка AI генерации:', error);
  }

  return notes;
}

// =============================================
// Fallback
// =============================================

/**
 * Генерирует локальный fallback, если AI недоступен.
 */
export function generateFallbackNote(ctx: CompanyMeasureTasksContext): string {
  if (ctx.tasks.length > 0) {
    const measureLabel = ctx.measure_name ? ` за напрямком «${ctx.measure_name}»` : '';
    const sampleDescs = ctx.tasks
      .slice(0, 3)
      .map(t => t.description.slice(0, 100))
      .join('. ');
    return `Виконано роботи${measureLabel}. ${sampleDescs}.`;
  }
  return `Роботи тривають згідно з планом за напрямком «${ctx.measure_name || '—'}».`;
}
