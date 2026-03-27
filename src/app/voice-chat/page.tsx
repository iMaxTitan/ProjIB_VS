'use client';

/**
 * /voice-chat — Сторінка голосового чату з AI-ботом.
 * Використовує ElevenLabs Conversational AI через @elevenlabs/react.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useConversation } from '@elevenlabs/react';
import { Mic, MicOff, Loader2, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/lib/shared/auth';
import { cn } from '@/lib/shared/utils';

type VoiceStatus = 'idle' | 'connecting' | 'connected' | 'error';

export default function VoiceChatPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const conversation = useConversation({
    onConnect: () => {
      setStatus('connected');
      setError(null);
    },
    onDisconnect: () => {
      setStatus('idle');
      setIsSpeaking(false);
    },
    onError: (message: string) => {
      setStatus('error');
      setError(message);
    },
    onModeChange: (mode: { mode: string }) => {
      setIsSpeaking(mode.mode === 'speaking');
    },
  });

  // Auth redirect
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [authLoading, user, router]);

  // Feature flag check
  const voiceEnabled = process.env.NEXT_PUBLIC_VOICE_BOT_ENABLED === 'true';

  const handleStart = useCallback(async () => {
    if (status === 'connecting' || status === 'connected') return;
    setStatus('connecting');
    setError(null);

    try {
      // 1. Мікрофон
      await navigator.mediaDevices.getUserMedia({ audio: true });

      // 2. Signed URL з нашого API
      const res = await fetch('/api/voice/signed-url', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const { signedUrl, userId: dbUserId } = await res.json();

      // 3. Старт сесії з user_id для логування
      await conversation.startSession({
        signedUrl,
        userId: dbUserId,
      });
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Не вдалося запустити');
    }
  }, [status, conversation]);

  const handleStop = useCallback(async () => {
    await conversation.endSession();
    setStatus('idle');
  }, [conversation]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!user) return null;

  if (!voiceEnabled) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-6">
        <p className="text-slate-500 text-lg">Голосовий бот наразі вимкнений.</p>
        <button
          onClick={() => router.push('/')}
          className="mt-4 text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
        >
          <ArrowLeft className="h-4 w-4" /> Повернутися
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-6">
      {/* Back button */}
      <button
        onClick={() => router.push('/')}
        className="absolute top-4 left-4 text-slate-500 hover:text-slate-700 flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="h-4 w-4" /> Назад
      </button>

      {/* Title */}
      <h1 className="text-2xl font-semibold text-slate-800 mb-2">
        Голосовий помічник
      </h1>
      <p className="text-slate-500 text-sm mb-8">
        Натисніть мікрофон і задайте питання голосом
      </p>

      {/* Main circle button */}
      <button
        onClick={status === 'connected' ? handleStop : handleStart}
        disabled={status === 'connecting'}
        className={cn(
          'relative w-32 h-32 rounded-full flex items-center justify-center transition-all duration-300',
          'focus:outline-none focus:ring-4 focus:ring-offset-2',
          status === 'idle' && 'bg-indigo-600 hover:bg-indigo-700 text-white focus:ring-indigo-300',
          status === 'connecting' && 'bg-slate-300 text-slate-500 cursor-wait',
          status === 'connected' && !isSpeaking && 'bg-emerald-600 hover:bg-emerald-700 text-white focus:ring-emerald-300',
          status === 'connected' && isSpeaking && 'bg-emerald-500 text-white focus:ring-emerald-300 animate-pulse',
          status === 'error' && 'bg-red-600 hover:bg-red-700 text-white focus:ring-red-300',
        )}
      >
        {status === 'connecting' ? (
          <Loader2 className="h-12 w-12 animate-spin" />
        ) : status === 'connected' ? (
          <MicOff className="h-12 w-12" />
        ) : (
          <Mic className="h-12 w-12" />
        )}

        {/* Пульсація при з'єднанні */}
        {status === 'connected' && (
          <span className="absolute inset-0 rounded-full border-4 border-emerald-400 animate-ping opacity-25" />
        )}
      </button>

      {/* Status text */}
      <p className={cn(
        'mt-6 text-sm font-medium',
        status === 'idle' && 'text-slate-500',
        status === 'connecting' && 'text-slate-400',
        status === 'connected' && !isSpeaking && 'text-emerald-600',
        status === 'connected' && isSpeaking && 'text-emerald-500',
        status === 'error' && 'text-red-600',
      )}>
        {status === 'idle' && 'Натисніть для початку'}
        {status === 'connecting' && 'Підключення...'}
        {status === 'connected' && !isSpeaking && '🎤 Слухаю вас...'}
        {status === 'connected' && isSpeaking && '🔊 Говорю...'}
        {status === 'error' && 'Помилка'}
      </p>

      {/* Error message */}
      {error && (
        <p className="mt-2 text-xs text-red-500 max-w-sm text-center">{error}</p>
      )}

      {/* Instructions */}
      <div className="mt-12 text-center text-slate-400 text-xs max-w-sm space-y-1">
        <p>Бот розуміє українську та російську мови</p>
        <p>Запитуйте про базу знань, плани, звіти, KPI</p>
      </div>
    </div>
  );
}
