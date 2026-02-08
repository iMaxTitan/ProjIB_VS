import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getRequesterKey, isRequestAuthorized } from '@/lib/api/request-guards';
import { generateAIText, hasConfiguredAIProvider } from '@/lib/ai/client';
import logger from '@/lib/logger';

const AI_ROUTE_LIMIT = 20;
const AI_ROUTE_WINDOW_MS = 60_000;

interface ActivityEvent {
  activity_id: string;
  event_type: 'task_created' | 'task_completed' | 'plan_created';
  event_time: string;
  user_id: string;
  user_name: string;
  department_name: string;
  event_description: string;
  spent_hours: number | null;
  plan_name: string;
  process_name: string | null;
}

interface ActivityStats {
  totalHours: number;
  totalTasks: number;
  activeUsers: number;
  totalUsers: number;
  todayHours: number;
  todayTasks: number;
}

interface AIContext {
  current: {
    hours: number;
    tasks: number;
    activeUsers: number;
    avgHoursPerTask: number;
    avgHoursPerUser: number;
  };
  previous: {
    hours: number;
    tasks: number;
    activeUsers: number;
    avgHoursPerTask: number;
    avgHoursPerUser: number;
  };
  changes: {
    hoursChange: number;
    tasksChange: number;
    usersChange: number;
    productivityChange: number;
  };
  topPerformers: {
    name: string;
    hours: number;
    tasks: number;
    department: string;
  }[];
  departmentStats: {
    name: string;
    hours: number;
    tasks: number;
    users: number;
  }[];
  periodInfo: {
    type: 'week' | 'month' | 'quarter' | 'year';
    daysBack: number;
    startDate: string;
    endDate: string;
  };
}

interface RequestBody {
  events: ActivityEvent[];
  stats: ActivityStats | null;
  context?: AIContext;
  userRole: string;
  daysBack: number;
}

interface AIAnalysis {
  summary: string;
  insights: { type: 'positive' | 'warning' | 'neutral'; text: string }[];
  topPerformers: string[];
  concerns: string[];
}

const SYSTEM_PROMPT = `Ты аналитик активности команды информационной безопасности.
Верни СТРОГО JSON формата:
{
  "summary": "краткий вывод с трендом",
  "insights": [{"type":"positive|warning|neutral","text":"..."}],
  "topPerformers": ["..."],
  "concerns": ["..."]
}
Требования:
- Пиши кратко и предметно, на русском.
- Указывай тренды в процентах, если есть данные сравнения.
- Не добавляй markdown и пояснения вне JSON.`;

function mockAnalysis(events: ActivityEvent[], stats: ActivityStats | null, context?: AIContext): AIAnalysis {
  const userStats: Record<string, { hours: number; tasks: number; name: string; dept: string }> = {};

  for (const e of events) {
    if (!userStats[e.user_id]) {
      userStats[e.user_id] = { hours: 0, tasks: 0, name: e.user_name, dept: e.department_name };
    }
    userStats[e.user_id].tasks += 1;
    userStats[e.user_id].hours += e.spent_hours || 0;
  }

  const users = Object.values(userStats);
  const avgHours = users.length > 0 ? users.reduce((s, u) => s + u.hours, 0) / users.length : 0;
  const top = (context?.topPerformers || [])
    .slice(0, 5)
    .map(p => `${p.name} (${p.department}): ${p.hours}ч, ${p.tasks} задач`);

  const topFallback = users
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 5)
    .map(u => `${u.name} (${u.dept}): ${u.hours.toFixed(1)}ч, ${u.tasks} задач`);

  const insights: AIAnalysis['insights'] = [];
  if (context) {
    const c = context.changes;
    if (c.hoursChange >= 10) insights.push({ type: 'positive', text: `Рост часов: +${c.hoursChange}% к прошлому периоду` });
    if (c.hoursChange <= -10) insights.push({ type: 'warning', text: `Падение часов: ${c.hoursChange}% к прошлому периоду` });
    if (c.tasksChange >= 10) insights.push({ type: 'positive', text: `Рост количества задач: +${c.tasksChange}%` });
    if (c.tasksChange <= -10) insights.push({ type: 'warning', text: `Снижение количества задач: ${c.tasksChange}%` });
    if (c.usersChange <= -15) insights.push({ type: 'warning', text: `Снижение числа активных сотрудников: ${c.usersChange}%` });
  }

  if (stats && stats.activeUsers < Math.ceil(stats.totalUsers * 0.7)) {
    insights.push({ type: 'warning', text: `Активны ${stats.activeUsers} из ${stats.totalUsers} сотрудников` });
  }

  const vague = events.filter(e => e.event_description.trim().length < 20);
  const concerns: string[] = [];
  if (vague.length > Math.ceil(events.length * 0.3)) {
    concerns.push(`Много неконкретных описаний задач: ${vague.length}`);
  }

  const summary = stats
    ? `За период: ${stats.totalHours}ч, ${stats.totalTasks} задач, активны ${stats.activeUsers} из ${stats.totalUsers}. Средняя нагрузка: ${avgHours.toFixed(1)}ч/сотрудника.`
    : 'Недостаточно данных для детального анализа.';

  return {
    summary,
    insights,
    topPerformers: top.length > 0 ? top : topFallback,
    concerns,
  };
}

function normalizeAnalysis(input: unknown): AIAnalysis {
  const fallback: AIAnalysis = { summary: 'Недостаточно данных для анализа.', insights: [], topPerformers: [], concerns: [] };
  if (!input || typeof input !== 'object') return fallback;
  const c = input as Record<string, unknown>;

  const summary = typeof c.summary === 'string' ? c.summary : fallback.summary;
  const insights = Array.isArray(c.insights)
    ? c.insights
      .filter((x): x is { type: 'positive' | 'warning' | 'neutral'; text: string } => {
        if (!x || typeof x !== 'object') return false;
        const r = x as Record<string, unknown>;
        return (r.type === 'positive' || r.type === 'warning' || r.type === 'neutral') && typeof r.text === 'string';
      })
    : fallback.insights;
  const topPerformers = Array.isArray(c.topPerformers)
    ? c.topPerformers.filter((x): x is string => typeof x === 'string')
    : fallback.topPerformers;
  const concerns = Array.isArray(c.concerns)
    ? c.concerns.filter((x): x is string => typeof x === 'string')
    : fallback.concerns;

  return { summary, insights, topPerformers, concerns };
}

export async function POST(request: NextRequest) {
  try {
    if (!isRequestAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rateLimit = checkRateLimit(getRequesterKey(request), AI_ROUTE_LIMIT, AI_ROUTE_WINDOW_MS);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too Many Requests' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSec) } }
      );
    }

    const body: RequestBody = await request.json();
    const { events, stats, context, userRole, daysBack } = body;

    if (!events || events.length === 0) {
      return NextResponse.json({
        analysis: {
          summary: 'Нет данных для анализа за выбранный период.',
          insights: [],
          topPerformers: [],
          concerns: []
        }
      });
    }

    const periodType = context?.periodInfo?.type || (daysBack <= 7 ? 'week' : daysBack <= 31 ? 'month' : daysBack <= 100 ? 'quarter' : 'year');
    const periodName = periodType === 'week' ? 'неделю' : periodType === 'month' ? 'месяц' : periodType === 'quarter' ? 'квартал' : 'год';

    const contextBlock = context
      ? `
Сравнение с прошлым периодом:
- Часы: ${context.current.hours} vs ${context.previous.hours} (${context.changes.hoursChange}%)
- Задачи: ${context.current.tasks} vs ${context.previous.tasks} (${context.changes.tasksChange}%)
- Активные сотрудники: ${context.current.activeUsers} vs ${context.previous.activeUsers} (${context.changes.usersChange}%)
- Часы/задача: ${context.current.avgHoursPerTask} vs ${context.previous.avgHoursPerTask} (${context.changes.productivityChange}%)

Отделы:
${context.departmentStats.map(d => `- ${d.name}: ${d.hours}ч, ${d.tasks} задач, ${d.users} чел`).join('\n')}

Топ исполнителей:
${context.topPerformers.map((p, i) => `${i + 1}. ${p.name} (${p.department}): ${p.hours}ч, ${p.tasks} задач`).join('\n')}`
      : '';

    const sampleEvents = events.slice(0, 30).map(e =>
      `- ${e.user_name} [${e.department_name}] ${e.spent_hours || 0}ч: ${e.event_description}`
    ).join('\n');

    const prompt = `Проанализируй активность команды ИБ за ${periodName}.
Период: ${context?.periodInfo?.startDate || ''} - ${context?.periodInfo?.endDate || ''}
Роль запросившего: ${userRole}

Общая статистика:
- Всего часов: ${stats?.totalHours || 0}
- Всего задач: ${stats?.totalTasks || 0}
- Активных сотрудников: ${stats?.activeUsers || 0} из ${stats?.totalUsers || 0}
- Сегодня: ${stats?.todayHours || 0}ч, ${stats?.todayTasks || 0} задач
${contextBlock}

Примеры событий:
${sampleEvents}`;

    let analysis: AIAnalysis;

    try {
      let aiResponse: string;
      if (!hasConfiguredAIProvider()) {
        analysis = mockAnalysis(events, stats, context);
        return NextResponse.json({ analysis });
      }

      aiResponse = await generateAIText({
        systemPrompt: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 1000,
        temperature: 0.4,
        timeoutMs: 20_000,
        openAIModel: 'gpt-4o-mini',
        anthropicModel: 'claude-3-haiku-20240307',
      });

      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('AI не вернул JSON');
      }

      analysis = normalizeAnalysis(JSON.parse(jsonMatch[0]));
    } catch (aiError: unknown) {
      logger.error('AI error, using fallback:', aiError);
      analysis = mockAnalysis(events, stats, context);
    }

    return NextResponse.json({ analysis });
  } catch (error: unknown) {
    logger.error('Activity analysis error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Activity analysis error' },
      { status: 500 }
    );
  }
}
