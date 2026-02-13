import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getRequesterKey, isRequestAuthorized } from '@/lib/api/request-guards';
import { generateAIText, hasConfiguredAIProvider } from '@/lib/ai/client';
import logger from '@/lib/logger';

// Конфигурация для использования разных AI-провайдеров
const AI_ROUTE_LIMIT = 20;
const AI_ROUTE_WINDOW_MS = 60_000;

interface Message {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

interface TaskHistory {
    description: string;
    spent_hours: number;
    completed_at?: string;
}

interface PlanHierarchy {
    annual?: {
        goal: string;
        expected_result?: string;
        year: number;
    };
    quarterly?: {
        goal: string;
        expected_result?: string;
        quarter: number;
    };
    monthly?: {
        service_name: string;
        title?: string;
        month_number: number;
        year: number;
    };
    weekly?: {
        expected_result: string;
        planned_hours: number;
        week_number: number;
        date_range: string;
    };
}

interface OutlookEvent {
    subject: string;
    start: string;
    end: string;
    duration_hours: number;
}

interface Assignee {
    full_name: string;
    role?: string;
    qualifications?: string[];
}

interface RequestBody {
    messages: Message[];
    context?: {
        planHierarchy?: PlanHierarchy;   // Иерархия целей: год -> квартал -> месяц
        existingTasks?: TaskHistory[];   // Задачи текущего плана
        userHistory?: TaskHistory[];     // История задач пользователя
        currentInput?: string;
        outlookEvents?: OutlookEvent[];  // События из Outlook
        departmentName?: string;         // Название отдела пользователя
        processDescription?: string;     // Описание процесса
        companyNames?: string[];         // Предприятия плана
        assignees?: Assignee[];          // Исполнители плана с квалификациями
        documentText?: string;           // Текст из прикрепленного документа (СЗ)
    };
}

const SYSTEM_PROMPT = `Ти помічник для написання описів робочих задач у системі планування ІБ.

Головне правило: генеруй одну задачу за раз.

Правила:
- Використовуй дієслово в минулому часі.
- Формулюй конкретний і перевірюваний результат.
- Дотримуйся теми послуги/роботи та контексту плану.
- Поверни лише одне формулювання задачі в лапках.

Коли просять "згенеруй":
1. Враховуй послугу/роботу і процес як головний орієнтир.
2. Враховуй останні задачі за цією послугою як стиль, але не копіюй дослівно.
3. Якщо є релевантна подія Outlook, можна коротко згадати: "(зустріч: ...)".

Коли просять "опрацюй" і є текст документа (СЗ):
1. Знайди номер СЗ (формати: "Реєстраційний № 123/2026", "СЗ-123/2026", "Службова записка № 123").
2. Виділи суть виконаної роботи.
3. Прибери службові фрази, реквізити та підписи.
4. Не включай номер СЗ в опис задачі.
5. Сформулюй короткий опис (1-2 речення).

Формат відповіді при опрацюванні документа:
📋 Номер СЗ: [номер або "не знайдено"]
"[опис задачі без номера СЗ]"

Відповідай коротко і виключно українською мовою.`;

function mockResponse(messages: Message[], context?: RequestBody['context']): string {
    const lastMessage = messages[messages.length - 1]?.content || '';

    if (lastMessage.toLowerCase().includes('допоможи') || lastMessage.toLowerCase().includes('опиши')) {
        if (context?.currentInput) {
            return `Ось покращене формулювання:\n\n"${context.currentInput.charAt(0).toUpperCase() + context.currentInput.slice(1)}"\n\nМожна уточнити:\n- Якого конкретного результату досягнуто?\n- Для якого проєкту/клієнта?`;
        }
        return 'Опишіть коротко, що ви зробили, і я допоможу сформулювати опис задачі. Наприклад: "провів зустріч по проєкту X" або "підготував звіт по процесу Y".';
    }

    if (context?.planHierarchy?.monthly?.service_name) {
        const planDesc = context.planHierarchy.monthly.service_name;
        return `На основі місячного плану "${planDesc}" можу запропонувати задачу:\n\n"Виконав роботу за напрямом: ${planDesc.toLowerCase()}"\n\nБажаєте уточнити деталі?`;
    }

    if (context?.planHierarchy?.weekly?.expected_result) {
        const planDesc = context.planHierarchy.weekly.expected_result;
        return `На основі плану "${planDesc.slice(0, 50)}..." можу запропонувати задачу:\n\n"Провів роботи для досягнення планового результату та підготував матеріали щодо виконання"\n\nПотрібно зробити формулювання більш конкретним?`;
    }

    // Пытаемся улучшить введенный текст
    const improved = lastMessage
        .replace(/^робив/i, 'Виконав роботу за')
        .replace(/^працював/i, 'Провів роботу над')
        .replace(/^зустріч/i, 'Провів зустріч щодо');

    if (improved !== lastMessage) {
        return `Пропоную таке формулювання:\n\n"${improved}"\n\nБажаєте щось уточнити?`;
    }

    return `Зрозуміло. Опишіть детальніше:\n- Що конкретно було зроблено?\n- Який результат отримано?\n\nАбо напишіть ключові слова, і я допоможу сформулювати задачу.`;
}

export async function POST(request: NextRequest) {
    try {
        if (!isRequestAuthorized(request)) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
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

        const body: RequestBody = await request.json();
        const { messages, context } = body;

        if (!messages || messages.length === 0) {
            return NextResponse.json(
                { error: 'Сообщения не предоставлены' },
                { status: 400 }
            );
        }

        // Добавляем контекст в сообщение, если он передан
        const enrichedMessages = [...messages];
        if (context) {
            let contextMessage = '';

            // Отдел пользователя
            if (context.departmentName) {
                contextMessage += `\n\n[ОТДЕЛ ПОЛЬЗОВАТЕЛЯ]\n${context.departmentName}`;
            }

            // Процесс ИБ
            if (context.processDescription) {
                contextMessage += `\n\n[ПРОЦЕСС ИБ]\n${context.processDescription}`;
            }

            // Компании
            if (context.companyNames && context.companyNames.length > 0) {
                contextMessage += `\n\n[КОМПАНИИ]\n${context.companyNames.join(', ')}`;
            }

            // Исполнители с квалификациями
            if (context.assignees && context.assignees.length > 0) {
                const assigneesList = context.assignees.map(a => {
                    let info = `- ${a.full_name}`;
                    if (a.role) info += ` (${a.role})`;
                    if (a.qualifications && a.qualifications.length > 0) {
                        info += `: ${a.qualifications.join(', ')}`;
                    }
                    return info;
                }).join('\n');
                contextMessage += `\n\n[ИСПОЛНИТЕЛИ ПЛАНА]\n${assigneesList}`;
            }

            // Услуга/работа
            if (context.planHierarchy?.monthly) {
                const m = context.planHierarchy.monthly;
                contextMessage += `\n\n[УСЛУГА/РАБОТА]`;
                contextMessage += `\n📋 ${m.service_name}`;
            }

            if (context.existingTasks && context.existingTasks.length > 0) {
                const tasksList = context.existingTasks
                    .map(t => `- ${t.description} (${t.spent_hours}ч)`)
                    .join('\n');
                contextMessage += `\n\n[УЖЕ ДОБАВЛЕННЫЕ ЗАДАЧИ В ЭТОМ ПЛАНЕ]\n${tasksList}`;
            }

            if (context.outlookEvents && context.outlookEvents.length > 0) {
                const eventsList = context.outlookEvents
                    .map(e => `- ${e.subject} (${e.duration_hours}ч, ${e.start})`)
                    .join('\n');
                contextMessage += `\n\n[СОБЫТИЯ OUTLOOK ЗА НЕДЕЛЮ]\n${eventsList}`;
            }

            if (context.userHistory && context.userHistory.length > 0) {
                const historyList = context.userHistory
                    .slice(0, 30)
                    .map(t => `- ${t.description} (${t.spent_hours}ч)`)
                    .join('\n');
                contextMessage += `\n\n[ПОСЛЕДНИЕ ЗАДАЧИ ПО ЭТОЙ УСЛУГЕ - ИСПОЛЬЗУЙ КАК ПРИМЕРЫ]\n${historyList}`;
            }

            if (context.currentInput) {
                contextMessage += `\n\n[ТЕКУЩИЙ ВВОД]\n${context.currentInput}`;
            }

            // Текст из прикрепленного документа (СЗ)
            if (context.documentText) {
                // Ограничиваем длину текста для API
                const truncatedText = context.documentText.length > 3000
                    ? context.documentText.substring(0, 3000) + '...[текст обрезан]'
                    : context.documentText;
                contextMessage += `\n\n[ТЕКСТ ИЗ ПРИКРЕПЛЕННОГО ДОКУМЕНТА (СЗ)]\n${truncatedText}`;
            }

            if (contextMessage) {
                enrichedMessages[enrichedMessages.length - 1] = {
                    ...enrichedMessages[enrichedMessages.length - 1],
                    content: enrichedMessages[enrichedMessages.length - 1].content + contextMessage,
                };
            }
        }

        let response: string;

        // Проверяем наличие API-ключей
        if (hasConfiguredAIProvider()) {
            response = await generateAIText({
                systemPrompt: SYSTEM_PROMPT,
                messages: enrichedMessages,
                maxTokens: 500,
                temperature: 0.7,
                timeoutMs: 20_000,
                openAIModel: 'gpt-4o-mini',
                anthropicModel: 'claude-3-haiku-20240307',
            });
        } else {
            // Fallback демо-режим
            response = mockResponse(messages, context);
        }

        return NextResponse.json({ response });
    } catch (error: unknown) {
        logger.error('AI Assistant error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'AI assistant error' },
            { status: 500 }
        );
    }
}



