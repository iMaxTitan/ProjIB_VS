/**
 * Сервис генерации AI-примечаний для квартального отчёта.
 * Собирает задачи из daily_tasks, обогащает контекстом процесса,
 * отправляет одним батчем в AI → получает лаконичные заключения на украинском.
 */

import { getReportClient } from './monthly-report.service';
import { generateAIText, hasConfiguredAIProvider } from '@/lib/ai/client';
import logger from '@/lib/logger';

// =============================================
// Types
// =============================================

export interface QuarterlyPlanTasksContext {
  quarterly_id: string;
  goal: string;
  expected_result: string;
  status: string;
  process_name: string;
  process_description: string;
  tasks: { description: string; spent_hours: number; task_date: string }[];
  total_hours: number;
  monthly_plans_count: number;
}

type QuarterlyPlanRow = {
  quarterly_id: string;
  goal: string | null;
  expected_result: string | null;
  status: string | null;
  process_id: string | null;
  processes?: { process_name?: string | null; description?: string | null }
    | { process_name?: string | null; description?: string | null }[]
    | null;
};

type MonthlyPlanRow = {
  monthly_plan_id: string;
  quarterly_id: string;
  status: string | null;
};

type DailyTaskRow = {
  monthly_plan_id: string;
  description: string | null;
  spent_hours: number | null;
  task_date: string | null;
};

// =============================================
// Data collection
// =============================================

/**
 * Собирает контекст задач для каждого квартального плана.
 * 3 запроса к БД: quarterly_plans → monthly_plans → daily_tasks.
 * Все задачи подаются полностью — модели (Haiku/gpt-4o-mini) дешёвые и имеют большой контекст.
 */
export async function collectTasksForQuarterlyPlans(
  quarterlyIds: string[]
): Promise<Map<string, QuarterlyPlanTasksContext>> {
  const result = new Map<string, QuarterlyPlanTasksContext>();
  if (quarterlyIds.length === 0) return result;

  const db = getReportClient();

  // 1. Quarterly plans + процесс
  const { data: qPlans, error: qErr } = await db
    .from('quarterly_plans')
    .select(`
      quarterly_id,
      goal,
      expected_result,
      status,
      process_id,
      processes (process_name, description)
    `)
    .in('quarterly_id', quarterlyIds);

  if (qErr) {
    logger.error('[QuarterlyNotes] Ошибка загрузки quarterly_plans:', qErr);
    return result;
  }

  const typedQPlans = (qPlans || []) as QuarterlyPlanRow[];

  // 2. Monthly plans (active/completed) для этих кварталов
  const { data: mPlans, error: mErr } = await db
    .from('monthly_plans')
    .select('monthly_plan_id, quarterly_id, status')
    .in('quarterly_id', quarterlyIds)
    .in('status', ['active', 'completed']);

  if (mErr) {
    logger.error('[QuarterlyNotes] Ошибка загрузки monthly_plans:', mErr);
    return result;
  }

  const typedMPlans = (mPlans || []) as MonthlyPlanRow[];
  const monthlyIds = typedMPlans.map(m => m.monthly_plan_id);

  // Маппинг monthly_plan_id → quarterly_id
  const monthlyToQuarterMap = new Map<string, string>();
  for (const m of typedMPlans) {
    monthlyToQuarterMap.set(m.monthly_plan_id, m.quarterly_id);
  }

  // Считаем кол-во monthly plans на квартал
  const monthlyCountMap = new Map<string, number>();
  for (const m of typedMPlans) {
    monthlyCountMap.set(m.quarterly_id, (monthlyCountMap.get(m.quarterly_id) || 0) + 1);
  }

  // 3. Daily tasks из этих monthly plans
  let typedTasks: DailyTaskRow[] = [];
  if (monthlyIds.length > 0) {
    const { data: tasks, error: tErr } = await db
      .from('daily_tasks')
      .select('monthly_plan_id, description, spent_hours, task_date')
      .in('monthly_plan_id', monthlyIds)
      .order('task_date', { ascending: false })
      .limit(10000);

    if (tErr) {
      logger.error('[QuarterlyNotes] Ошибка загрузки daily_tasks:', tErr);
    } else {
      typedTasks = (tasks || []) as DailyTaskRow[];
    }
  }

  // Группируем задачи по quarterly_id
  const tasksByQuarter = new Map<string, DailyTaskRow[]>();
  const hoursByQuarter = new Map<string, number>();

  for (const t of typedTasks) {
    const qId = monthlyToQuarterMap.get(t.monthly_plan_id);
    if (!qId) continue;

    // Часы
    hoursByQuarter.set(qId, (hoursByQuarter.get(qId) || 0) + (Number(t.spent_hours) || 0));

    // Задачи (с непустыми описаниями)
    if (!t.description?.trim()) continue;
    const arr = tasksByQuarter.get(qId) || [];
    arr.push(t);
    tasksByQuarter.set(qId, arr);
  }

  // Собираем контексты
  for (const qp of typedQPlans) {
    const proc = Array.isArray(qp.processes) ? qp.processes[0] : qp.processes;
    const tasks = tasksByQuarter.get(qp.quarterly_id) || [];

    result.set(qp.quarterly_id, {
      quarterly_id: qp.quarterly_id,
      goal: qp.goal || '',
      expected_result: qp.expected_result || '',
      status: qp.status || '',
      process_name: proc?.process_name || '',
      process_description: proc?.description || '',
      tasks: tasks.map(t => ({
        description: t.description || '',
        spent_hours: Number(t.spent_hours) || 0,
        task_date: t.task_date || '',
      })),
      total_hours: Math.round((hoursByQuarter.get(qp.quarterly_id) || 0) * 10) / 10,
      monthly_plans_count: monthlyCountMap.get(qp.quarterly_id) || 0,
    });
  }

  return result;
}

// =============================================
// AI generation
// =============================================

const SYSTEM_PROMPT = `Ти аналітик підрозділу інформаційної безпеки. Для кожного квартального завдання напиши розгорнуту примітку для офіційного звіту.

Правила:
1. Пиши українською мовою. 4-8 речень на кожне завдання.
2. Починай з дієслова минулого часу: "Забезпечено", "Проведено", "Виконано", "Здійснено", "Розроблено".
3. Базуйся на описах задач. Згадуй конкретні напрямки робіт, системи, документи, процедури з описів задач.
4. НЕ вказуй кількість задач, трудовитрати, години. Пиши тільки про суть виконаних робіт.
5. Якщо задач немає, але статус "completed" — розпиши на основі процесу, очікуваного результату та назви завдання.
6. Якщо задач немає і статус не "completed" — напиши що роботи тривають згідно з планом, вкажи напрямок з назви завдання.
7. Без markdown, списків, нумерації. Тільки суцільний текст у вигляді абзацу.
8. Стиль — офіційно-діловий, але конкретний. Уникай загальних фраз без деталей.

Поверни строго JSON-масив без markdown-обгортки:
[{"id": "uuid", "note": "текст"}]`;

/**
 * Генерирует AI-примечания для всех квартальных планов одним батч-запросом.
 * Возвращает Map<quarterly_id, note_text>.
 * При ошибке возвращает пустую Map (вызывающий код использует fallback).
 */
export async function generateAINotesForQuarterlyReport(
  contexts: QuarterlyPlanTasksContext[]
): Promise<Map<string, string>> {
  const notes = new Map<string, string>();

  if (contexts.length === 0 || !hasConfiguredAIProvider()) {
    return notes;
  }

  // Формируем user prompt
  const planBlocks = contexts.map((ctx, idx) => {
    const taskLines = ctx.tasks.length > 0
      ? ctx.tasks.map(t => `- ${t.description} (${t.spent_hours}г)`).join('\n')
      : 'Задачі відсутні';

    return [
      `=== Завдання ${idx + 1} ===`,
      `ID: ${ctx.quarterly_id}`,
      `Завдання: ${ctx.goal}`,
      `Процес ІБ: ${ctx.process_name}`,
      ctx.process_description ? `Опис процесу: ${ctx.process_description}` : '',
      `Очікуваний результат: ${ctx.expected_result}`,
      `Статус: ${ctx.status}`,
      ctx.tasks.length > 0 ? `Виконані задачі (${ctx.tasks.length}):` : '',
      taskLines,
      ctx.total_hours > 0 ? `Загальні трудовитрати: ${ctx.total_hours} год.` : '',
    ].filter(Boolean).join('\n');
  });

  const userPrompt = `Створи примітки для квартальних завдань:\n\n${planBlocks.join('\n\n')}`;

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

    // Парсим JSON из ответа
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      logger.error('[QuarterlyNotes] AI ответ не содержит JSON массив');
      return notes;
    }

    const parsed = JSON.parse(jsonMatch[0]) as { id: string; note: string }[];

    for (const item of parsed) {
      if (item.id && item.note) {
        notes.set(item.id, item.note.trim());
      }
    }

    logger.log(`[QuarterlyNotes] AI сгенерировал ${notes.size}/${contexts.length} примечаний`);
  } catch (error: unknown) {
    logger.error('[QuarterlyNotes] Ошибка AI генерации:', error);
  }

  return notes;
}

// =============================================
// Fallback
// =============================================

/**
 * Генерирует локальный fallback, если AI недоступен.
 */
export function generateFallbackNote(ctx: QuarterlyPlanTasksContext): string {
  if (ctx.tasks.length > 0) {
    const processLabel = ctx.process_name ? ` за напрямком «${ctx.process_name}»` : '';
    const sampleDescs = ctx.tasks
      .slice(0, 3)
      .map(t => t.description.slice(0, 100))
      .join('. ');
    return `Виконано роботи${processLabel}. ${sampleDescs}.`;
  }
  if (ctx.status === 'completed') {
    const goalLabel = ctx.goal ? ` Завдання: «${ctx.goal}».` : '';
    const processLabel = ctx.process_name ? ` Процес: «${ctx.process_name}».` : '';
    const resultLabel = ctx.expected_result ? ` Очікуваний результат досягнуто: ${ctx.expected_result}.` : '';
    return `Роботи виконано відповідно до плану.${goalLabel}${processLabel}${resultLabel}`;
  }
  if (ctx.status === 'active' || ctx.status === 'approved') {
    const goalLabel = ctx.goal ? ` за завданням «${ctx.goal}»` : '';
    return `Роботи тривають згідно з планом${goalLabel}.`;
  }
  return '—';
}
