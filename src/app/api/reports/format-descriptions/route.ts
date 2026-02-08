/**
 * API endpoint для AI-форматирования описаний работ в актах.
 * POST /api/reports/format-descriptions
 */

import { NextRequest, NextResponse } from 'next/server';
import { TaskDataForAI } from '@/lib/services/contract-services';
import { fetchWithTimeout } from '@/lib/utils/fetch-with-timeout';
import { checkRateLimit, getRequesterKey, isRequestAuthorized } from '@/lib/api/request-guards';
import logger from '@/lib/logger';

const AI_PROVIDER = process.env.AI_PROVIDER || 'openai';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const AI_ROUTE_LIMIT = 20;
const AI_ROUTE_WINDOW_MS = 60_000;

interface FormatRequest {
  services: TaskDataForAI[];
  companyName: string;
  period: {
    month: number;
    year: number;
  };
}

interface FormattedService {
  serviceId: number;
  serviceName: string;
  formattedDescription: string;
  hours: number;
  employeesCount: number;
}

interface FormatResponse {
  formattedServices: FormattedService[];
  summary?: string;
}

interface AIFormattedItem {
  serviceId?: number;
  formattedDescription?: string;
}

const SYSTEM_PROMPT = `Ты профессиональный копирайтер для официальных документов в сфере информационной безопасности.
Твоя задача: преобразовать технические описания задач в профессиональные описания для актов выполненных работ.

Правила:
1. Пиши официально и по-деловому, но без канцелярской перегруженности.
2. Используй русский язык.
3. Делай акцент на результате, а не только на процессе.
4. Используй конкретику и цифры, если они есть в исходных данных.
5. Каждый пункт: 2-4 предложения.
6. Не выдумывай факты, которых нет во входных данных.
7. Начинай описания с глагола прошедшего времени: «Обеспечено», «Проведено», «Выполнено», «Осуществлено».

Верни строго JSON-массив:
[
  {
    "serviceId": 1,
    "formattedDescription": "Текст описания"
  }
]`;

async function callOpenAI(prompt: string): Promise<string> {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY не настроен');

  const response = await fetchWithTimeout(
    'https://api.openai.com/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        max_tokens: 3000,
        temperature: 0.7,
      }),
    },
    20000
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'OpenAI API error');
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || '';
}

async function callAnthropic(prompt: string): Promise<string> {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY не настроен');

  const response = await fetchWithTimeout(
    'https://api.anthropic.com/v1/messages',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 3000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      }),
    },
    20000
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Anthropic API error');
  }

  const data = await response.json();
  return data.content[0]?.text || '';
}

function generateFallbackDescription(service: TaskDataForAI): string {
  const { serviceName, taskCount, employees, taskDescriptions } = service;
  const lowered = serviceName.toLowerCase();

  let description = '';

  if (lowered.includes('мониторинг')) {
    description = `Обеспечен непрерывный мониторинг в рамках услуги "${serviceName.substring(0, 80)}..."`;
  } else if (lowered.includes('аудит') || lowered.includes('проверка')) {
    description = `Проведена проверка в рамках услуги "${serviceName.substring(0, 80)}..."`;
  } else if (lowered.includes('консультац')) {
    description = `Предоставлены консультации в рамках услуги "${serviceName.substring(0, 80)}..."`;
  } else if (lowered.includes('анализ')) {
    description = `Выполнен анализ в рамках услуги "${serviceName.substring(0, 80)}..."`;
  } else {
    description = `Выполнены работы в рамках услуги "${serviceName.substring(0, 80)}..."`;
  }

  description += ` Обработано ${taskCount} задач. Задействовано ${employees.length} специалистов.`;

  if (taskDescriptions.length > 0) {
    const shortDesc = taskDescriptions[0].substring(0, 100);
    if (shortDesc.length > 20) {
      description += ` ${shortDesc}${taskDescriptions[0].length > 100 ? '...' : '.'}`;
    }
  }

  return description;
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
        {
          status: 429,
          headers: {
            'Retry-After': String(rateLimit.retryAfterSec),
          },
        }
      );
    }

    const body: FormatRequest = await request.json();
    const { services, companyName, period } = body;

    if (!services || services.length === 0) {
      return NextResponse.json({ error: 'Отсутствуют данные по услугам' }, { status: 400 });
    }

    const monthNames = [
      'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
      'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
    ];
    const monthName = monthNames[period.month - 1] || `месяц ${period.month}`;

    const prompt = `Сформируй профессиональные описания выполненных работ для акта оказания услуг.

ЗАКАЗЧИК: ${companyName}
ПЕРИОД: ${monthName} ${period.year} года

ПЕРЕЧЕНЬ УСЛУГ И ВЫПОЛНЕННЫХ РАБОТ:
${services
  .map(
    (s, i) => `
${i + 1}. УСЛУГА: ${s.serviceName}
   Категория: ${s.categoryName}
   Количество задач: ${s.taskCount}
   Трудозатраты: ${s.totalHours.toFixed(1)} человеко-часов
   Исполнители: ${s.employees.join(', ') || 'не указано'}
   Описания задач:
   ${s.taskDescriptions.slice(0, 5).map(d => `- ${d}`).join('\n') || '- данные отсутствуют'}`
  )
  .join('\n')}

Верни JSON-массив. serviceId должен соответствовать индексу услуги (начиная с 0) или исходному serviceId.`;

    let formattedServices: FormattedService[] = [];

    try {
      let aiResponse: string;

      if (AI_PROVIDER === 'anthropic' && ANTHROPIC_API_KEY) {
        aiResponse = await callAnthropic(prompt);
      } else if (OPENAI_API_KEY) {
        aiResponse = await callOpenAI(prompt);
      } else {
        logger.log('[API/format-descriptions] AI не настроен, используем fallback');
        formattedServices = services.map((s) => ({
          serviceId: s.serviceId,
          serviceName: s.serviceName,
          formattedDescription: generateFallbackDescription(s),
          hours: s.totalHours,
          employeesCount: s.employees.length,
        }));

        return NextResponse.json({ formattedServices } as FormatResponse);
      }

      const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        formattedServices = services.map((s, index) => {
          const aiResult = (parsed as AIFormattedItem[]).find(
            (p) => p.serviceId === index || p.serviceId === s.serviceId
          );

          return {
            serviceId: s.serviceId,
            serviceName: s.serviceName,
            formattedDescription: aiResult?.formattedDescription || generateFallbackDescription(s),
            hours: s.totalHours,
            employeesCount: s.employees.length,
          };
        });
      } else {
        throw new Error('AI не вернул валидный JSON');
      }
    } catch (aiError: unknown) {
      logger.error('[API/format-descriptions] AI ошибка, используем fallback:', aiError);

      formattedServices = services.map((s) => ({
        serviceId: s.serviceId,
        serviceName: s.serviceName,
        formattedDescription: generateFallbackDescription(s),
        hours: s.totalHours,
        employeesCount: s.employees.length,
      }));
    }

    return NextResponse.json({ formattedServices } as FormatResponse);
  } catch (error: unknown) {
    logger.error('[API/format-descriptions] Ошибка:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Format error' },
      { status: 500 }
    );
  }
}

