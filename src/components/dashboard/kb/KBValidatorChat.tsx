'use client';

import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, ChevronDown, ChevronUp, Loader2, Send, Bot, User } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/shared/utils';
import type { ValidationResult } from '@/lib/kb/validator';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface Props {
  result: ValidationResult;
  fileName: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function KBValidatorChat({ result, fileName }: Props) {
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [chatError, setChatError] = useState('');
  const [expanded, setExpanded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (history.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [history]);

  const sendMessage = async () => {
    const q = input.trim();
    if (!q || loading) return;

    const userMsg: ChatMessage = { role: 'user', content: q };
    const newHistory = [...history, userMsg];
    setHistory(newHistory);
    setInput('');
    setLoading(true);
    setChatError('');

    try {
      const res = await fetch('/api/kb/validate/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preview: result.preview,
          fileName,
          question: q,
          history: history.slice(-10),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setChatError(data.error ?? 'Помилка');
        setHistory(prev => prev.slice(0, -1));
      } else {
        setHistory(prev => [...prev, { role: 'assistant', content: data.answer }]);
      }
    } catch {
      setChatError('Не вдалось зʼєднатись');
      setHistory(prev => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <button
        onClick={() => {
          setExpanded(v => !v);
          if (!expanded) setTimeout(() => inputRef.current?.focus(), 100);
        }}
        aria-expanded={expanded}
        aria-label={expanded ? 'Згорнути чат' : 'Розгорнути чат з AI'}
        className="w-full flex items-center justify-between px-4 py-3 border-b border-slate-100 hover:bg-slate-50 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-inset"
      >
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-indigo-500" aria-hidden="true" />
          <span className="text-sm font-semibold text-slate-800">Запитати AI про документ</span>
          {history.length > 0 && (
            <span className="text-xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full font-medium">
              {history.filter(m => m.role === 'user').length}
            </span>
          )}
        </div>
        {expanded
          ? <ChevronUp className="h-4 w-4 text-slate-400" aria-hidden="true" />
          : <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden="true" />
        }
      </button>

      {expanded && (
        <div className="flex flex-col">
          {/* Messages */}
          {history.length > 0 && (
            <div className="max-h-64 overflow-y-auto px-4 py-3 space-y-3">
              {history.map((msg, i) => (
                <div key={i} className={cn('flex gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                  {msg.role === 'assistant' && (
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center">
                      <Bot className="h-3.5 w-3.5 text-indigo-600" aria-hidden="true" />
                    </div>
                  )}
                  <div className={cn(
                    'max-w-[80%] text-sm px-3 py-2 rounded-xl',
                    msg.role === 'user'
                      ? 'bg-indigo-600 text-white rounded-br-sm'
                      : 'bg-slate-100 text-slate-800 rounded-bl-sm',
                  )}>
                    {msg.content}
                  </div>
                  {msg.role === 'user' && (
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center">
                      <User className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                    </div>
                  )}
                </div>
              ))}
              {loading && (
                <div className="flex gap-2 justify-start">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center">
                    <Bot className="h-3.5 w-3.5 text-indigo-600" aria-hidden="true" />
                  </div>
                  <div className="bg-slate-100 rounded-xl rounded-bl-sm px-3 py-2">
                    <Loader2 className="h-4 w-4 text-slate-400 animate-spin" aria-hidden="true" />
                  </div>
                </div>
              )}
              {chatError && (
                <p className="text-xs text-red-500 text-center">{chatError}</p>
              )}
              <div ref={bottomRef} />
            </div>
          )}

          {/* Empty state hint */}
          {history.length === 0 && (
            <div className="px-4 pt-3 pb-1">
              <p className="text-xs text-slate-400">
                Наприклад: «Що описує цей документ?», «Чи є тут процедура X?»
              </p>
            </div>
          )}

          {/* Input */}
          <div className="flex items-center gap-2 px-4 py-3 border-t border-slate-100">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder="Запитайте про документ…"
              aria-label="Введіть питання про документ"
              disabled={loading}
              className="flex-1 text-sm px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50"
            />
            <Button
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              aria-label="Надіслати питання"
              size="sm"
              className="gap-1.5"
            >
              {loading
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                : <Send className="h-3.5 w-3.5" aria-hidden="true" />
              }
              <span className="hidden sm:inline">Запит</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
