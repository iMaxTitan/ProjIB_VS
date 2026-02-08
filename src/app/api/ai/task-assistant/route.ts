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

const SYSTEM_PROMPT = `Ты помощник для написания описаний рабочих задач в системе планирования ИБ.

Главное правило: генерируй одну задачу за раз.

Правила:
- Используй глагол в прошедшем времени.
- Формулируй конкретный и проверяемый результат.
- Держись темы услуги/работы и контекста плана.
- Возвращай только одну формулировку задачи в кавычках.

Когда просят "сгенерируй":
1. Учитывай услугу/работу и процесс как главный ориентир.
2. Учитывай последние задачи по этой услуге как стиль, но не копируй дословно.
3. Если есть релевантное событие Outlook, можно кратко упомянуть: "(встреча: ...)".

Когда просят "обработай" и есть текст документа (СЗ):
1. Найди номер СЗ (форматы: "Регистрационный № 123/2026", "СЗ-123/2026", "Служебная записка № 123").
2. Выдели суть выполненной работы.
3. Убери служебные фразы, реквизиты и подписи.
4. Не включай номер СЗ в описание задачи.
5. Сформулируй краткое описание (1-2 предложения).

Формат ответа при обработке документа:
📋 Номер СЗ: [номер или "не найден"]
"[описание задачи без номера СЗ]"

Отвечай кратко и на русском.`;

function mockResponse(messages: Message[], context?: RequestBody['context']): string {
    const lastMessage = messages[messages.length - 1]?.content || '';

    if (lastMessage.toLowerCase().includes('помоги') || lastMessage.toLowerCase().includes('опиши')) {
        if (context?.currentInput) {
            return `Вот улучшенная формулировка:\n\n"${context.currentInput.charAt(0).toUpperCase() + context.currentInput.slice(1)}"\n\nМожно уточнить:\n- Какой конкретный результат был достигнут?\n- Для какого проекта/клиента?`;
        }
        return 'Опишите кратко, что вы сделали, и я помогу сформулировать описание задачи. Например: "провел встречу по проекту X" или "подготовил отчет по процессу Y".';
    }

    if (context?.planHierarchy?.monthly?.service_name) {
        const planDesc = context.planHierarchy.monthly.service_name;
        return `На основе месячного плана "${planDesc}" могу предложить задачу:\n\n"Выполнил работу по направлению: ${planDesc.toLowerCase()}"\n\nХотите уточнить детали?`;
    }

    if (context?.planHierarchy?.weekly?.expected_result) {
        const planDesc = context.planHierarchy.weekly.expected_result;
        return `На основе плана "${planDesc.slice(0, 50)}..." могу предложить задачу:\n\n"Провел работы по достижению планового результата и подготовил материалы по исполнению"\n\nНужно сделать формулировку более конкретной?`;
    }

    // Пытаемся улучшить введенный текст
    const improved = lastMessage
        .replace(/^делал/i, 'Выполнил работу по')
        .replace(/^работал/i, 'Провел работу над')
        .replace(/^встреча/i, 'Провел встречу по теме');

    if (improved !== lastMessage) {
        return `Предлагаю такую формулировку:\n\n"${improved}"\n\nХотите что-то уточнить?`;
    }

    return `Понял. Опишите подробнее:\n- Что конкретно было сделано?\n- Какой результат получен?\n\nИли напишите ключевые слова, и я помогу сформулировать задачу.`;
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



