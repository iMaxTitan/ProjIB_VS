import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, X, Loader2, Check, Wand2, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getErrorMessage } from '@/lib/utils/error-message';

interface Message {
    role: 'user' | 'assistant';
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
        measure_name: string;
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

interface AITaskAssistantProps {
    isOpen: boolean;
    onClose: () => void;
    onApplyText: (text: string) => void;
    onApplyDocumentNumber?: (number: string) => void;
    currentInput?: string;
    planHierarchy?: PlanHierarchy;
    existingTasks?: TaskHistory[];
    userHistory?: TaskHistory[];
    outlookEvents?: OutlookEvent[];
    departmentName?: string;
    processDescription?: string;
    companyNames?: string[];
    assignees?: Assignee[];
    documentText?: string;
}

export default function AITaskAssistant({
    isOpen,
    onClose,
    onApplyText,
    onApplyDocumentNumber,
    currentInput,
    planHierarchy,
    existingTasks,
    userHistory,
    outlookEvents,
    departmentName,
    processDescription,
    companyNames,
    assignees,
    documentText
}: AITaskAssistantProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Скролл к последнему сообщению
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Фокус на инпут при открытии
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 100);
            // Начальное приветствие с учетом контекста
            if (messages.length === 0) {
                let greeting = '';
                const hasContext = planHierarchy?.monthly || planHierarchy?.weekly || planHierarchy?.quarterly || planHierarchy?.annual;
                const hasOutlook = outlookEvents && outlookEvents.length > 0;
                const hasDocument = documentText && documentText.length > 0;

                if (hasDocument) {
                    // Есть текст из документа - предлагаем обработать
                    greeting = `📄 Вижу прикрепленный документ (${documentText.length} символов).\n\n`;
                    greeting += `Напишите "обработай" - извлеку суть и сформулирую описание задачи.`;
                } else if (currentInput) {
                    greeting = `Вижу, вы начали писать: "${currentInput}". Могу помочь улучшить формулировку.`;
                } else if (hasContext) {
                    greeting = `Привет!`;
                    if (planHierarchy?.monthly) {
                        greeting += ` Вижу мероприятие:\n📋 ${planHierarchy.monthly.measure_name}`;
                    }
                    greeting += `\n\nНапишите "сгенерируй" - предложу задачу`;
                    if (hasOutlook) {
                        greeting += ` и подберу событие из Outlook`;
                    }
                    greeting += `.`;
                } else {
                    greeting = 'Привет! Напишите "сгенерируй" или опишите, что сделали - помогу сформулировать.';
                }
                setMessages([{ role: 'assistant', content: greeting }]);
            }
        }
    }, [isOpen]);

    const sendMessage = async () => {
        if (!input.trim() || loading) return;

        const userMessage: Message = { role: 'user', content: input.trim() };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setLoading(true);

        try {
            const response = await fetch('/api/ai/task-assistant', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [...messages, userMessage],
                    context: {
                        currentInput,
                        planHierarchy,
                        existingTasks,
                        userHistory,
                        outlookEvents,
                        departmentName,
                        processDescription,
                        companyNames,
                        assignees,
                        documentText,
                    }
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Ошибка запроса');
            }

            // Заменяем последнее assistant-сообщение новым
            setMessages(prev => {
                const filtered = prev.filter(m => m.role !== 'assistant');
                return [...filtered, {
                    role: 'assistant',
                    content: data.response
                }];
            });
        } catch (error: unknown) {
            // Показываем сообщение об ошибке
            setMessages(prev => {
                const filtered = prev.filter(m => m.role !== 'assistant');
                return [...filtered, {
                    role: 'assistant',
                    content: `Ошибка: ${getErrorMessage(error)}. Попробуйте еще раз.`
                }];
            });
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    // Извлечь текст в кавычках из сообщения
    const extractQuotedText = (text: string): string | null => {
        const match = text.match(/"([^"]+)"/);
        return match ? match[1] : null;
    };

    // Извлечь номер СЗ из ответа AI
    const extractDocumentNumber = (text: string): string | null => {
        // Ищем формат "📋 Номер СЗ: ..." или "Номер СЗ: ..."
        const match = text.match(/(?:📋\s*)?Номер СЗ:\s*([^\n]+)/i);
        if (match) {
            const number = match[1].trim();
            // Проверяем, что это не "не найден"
            if (number.toLowerCase() !== 'не найден' && number.toLowerCase() !== 'не найдено') {
                return number;
            }
        }
        return null;
    };

    const applyFromMessage = (text: string) => {
        const quoted = extractQuotedText(text);
        if (quoted) {
            onApplyText(quoted);
            onClose();
        }
    };

    // Отправка сообщения напрямую (без показа в чате)
    const sendDirectMessage = async (text: string) => {
        if (loading) return;

        const userMessage: Message = { role: 'user', content: text };
        setLoading(true);

        try {
            const response = await fetch('/api/ai/task-assistant', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [...messages, userMessage],
                    context: {
                        currentInput,
                        planHierarchy,
                        existingTasks,
                        userHistory,
                        outlookEvents,
                        departmentName,
                        processDescription,
                        companyNames,
                        assignees,
                        documentText,
                    }
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Ошибка запроса');
            }

            // Заменяем последнее assistant-сообщение новым
            setMessages(prev => {
                const filtered = prev.filter(m => m.role !== 'assistant');
                return [...filtered, {
                    role: 'assistant',
                    content: data.response
                }];
            });
        } catch (error: unknown) {
            // Показываем сообщение об ошибке
            setMessages(prev => {
                const filtered = prev.filter(m => m.role !== 'assistant');
                return [...filtered, {
                    role: 'assistant',
                    content: `Ошибка: ${getErrorMessage(error)}. Попробуйте еще раз.`
                }];
            });
        } finally {
            setLoading(false);
        }
    };

    // Быстрая генерация по кнопке
    const handleGenerate = () => {
        sendDirectMessage('сгенерируй');
    };

    // Предложить другую задачу
    const handleNext = () => {
        sendDirectMessage('другую');
    };

    // Обработать текст из документа
    const handleProcessDocument = () => {
        sendDirectMessage('обработай текст из документа и сформулируй описание задачи');
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[80vh] animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b bg-gradient-to-r from-indigo-500 to-purple-500 rounded-t-2xl">
                    <div className="flex items-center gap-2 text-white">
                        <Sparkles className="h-5 w-5" />
                        <span className="font-semibold">AI Помощник</span>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-white/20 rounded-lg transition-colors text-white"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Messages - показываем только последний ответ */}
                <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center justify-center min-h-[300px]">
                    {messages.length > 0 && messages[messages.length - 1].role === 'assistant' && (
                        <div className="w-full space-y-4">
                            {/* Текст ответа */}
                            <div className="bg-gray-50 rounded-xl px-6 py-4 border border-gray-200">
                                <p className="whitespace-pre-wrap text-base text-gray-800 leading-relaxed">
                                    {messages[messages.length - 1].content}
                                </p>
                            </div>

                            {/* Кнопки действий */}
                            <div className="flex flex-col gap-3">
                                {/* Если есть задача в кавычках - показываем кнопку применения */}
                                {extractQuotedText(messages[messages.length - 1].content) && (
                                    <button
                                        onClick={() => applyFromMessage(messages[messages.length - 1].content)}
                                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-6 rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
                                    >
                                        <Check className="h-5 w-5" />
                                        Применить эту задачу
                                    </button>
                                )}

                                {/* Кнопка генерации другой задачи */}
                                {extractQuotedText(messages[messages.length - 1].content) ? (
                                    <button
                                        onClick={handleNext}
                                        disabled={loading}
                                        className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-3 px-6 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                    >
                                        <Wand2 className="h-5 w-5" />
                                        Сгенерировать другую задачу
                                    </button>
                                ) : (
                                    <>
                                        {/* Кнопка обработать документ */}
                                        {documentText && (
                                            <button
                                                onClick={handleProcessDocument}
                                                disabled={loading}
                                                className="w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold py-3 px-6 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                            >
                                                <FileText className="h-5 w-5" />
                                                Обработать документ
                                            </button>
                                        )}
                                        {/* Кнопка сгенерировать */}
                                        {!documentText && (
                                            <button
                                                onClick={handleGenerate}
                                                disabled={loading}
                                                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 px-6 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                            >
                                                <Wand2 className="h-5 w-5" />
                                                Сгенерировать задачу
                                            </button>
                                        )}
                                    </>
                                )}

                                {/* Кнопка применения номера СЗ */}
                                {extractDocumentNumber(messages[messages.length - 1].content) && onApplyDocumentNumber && (
                                    <button
                                        onClick={() => {
                                            const docNum = extractDocumentNumber(messages[messages.length - 1].content);
                                            if (docNum) onApplyDocumentNumber(docNum);
                                        }}
                                        className="w-full bg-amber-100 hover:bg-amber-200 text-amber-800 font-medium py-2 px-4 rounded-lg transition-all flex items-center justify-center gap-2 text-sm"
                                    >
                                        <FileText className="h-4 w-4" />
                                        Применить номер СЗ: {extractDocumentNumber(messages[messages.length - 1].content)}
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {loading && (
                        <div className="flex justify-start">
                            <div className="bg-gray-100 rounded-2xl rounded-bl-md px-4 py-3">
                                <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input - компактное поле для описания своей задачи */}
                <div className="p-3 border-t bg-gray-50">
                    <div className="flex gap-2">
                        <input
                            ref={inputRef}
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Или опишите свою задачу..."
                            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                            disabled={loading}
                        />
                        <button
                            onClick={() => {
                                const lastMsg = messages[messages.length - 1];
                                if (lastMsg?.role === 'assistant') {
                                    applyFromMessage(lastMsg.content);
                                }
                            }}
                            disabled={loading || !extractQuotedText(messages[messages.length - 1]?.content || '')}
                            title="Применить задачу"
                            className={cn(
                                "px-3 py-2 rounded-lg transition-all",
                                !loading && extractQuotedText(messages[messages.length - 1]?.content || '')
                                    ? "bg-green-500 text-white hover:bg-green-600"
                                    : "bg-gray-200 text-gray-400 cursor-not-allowed"
                            )}
                        >
                            <Check className="h-4 w-4" />
                        </button>
                        <button
                            onClick={handleGenerate}
                            disabled={loading}
                            title="Сгенерировать задачу"
                            className={cn(
                                "px-3 py-2 rounded-lg transition-all",
                                !loading
                                    ? "bg-purple-500 text-white hover:bg-purple-600"
                                    : "bg-gray-200 text-gray-400 cursor-not-allowed"
                            )}
                        >
                            <Wand2 className="h-4 w-4" />
                        </button>
                        <button
                            onClick={sendMessage}
                            disabled={!input.trim() || loading}
                            title="Отправить"
                            className={cn(
                                "px-3 py-2 rounded-lg transition-all",
                                input.trim() && !loading
                                    ? "bg-indigo-500 text-white hover:bg-indigo-600"
                                    : "bg-gray-200 text-gray-400 cursor-not-allowed"
                            )}
                        >
                            <Send className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

