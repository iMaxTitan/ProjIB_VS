/**
 * ElevenLabs Conversational AI клієнт.
 * Генерує signed URLs для сесій та отримує деталі розмов.
 */

import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { config } from '@/lib/shared/config';
import logger from '@/lib/shared/logger';

// ── Lazy singleton ────────────────────────────────────────────────────────────

let _client: InstanceType<typeof ElevenLabsClient> | null = null;

function getClient(): InstanceType<typeof ElevenLabsClient> {
  if (_client) return _client;
  if (!config.elevenlabs.apiKey) {
    throw new Error('ELEVENLABS_API_KEY not configured');
  }
  _client = new ElevenLabsClient({ apiKey: config.elevenlabs.apiKey });
  return _client;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Генерує signed URL для ініціалізації голосової сесії.
 * Клієнт (React) використовує цей URL для startSession().
 */
export async function getSignedUrl(
  agentId?: string,
): Promise<{ signedUrl: string }> {
  const client = getClient();
  const id = agentId ?? config.elevenlabs.agentId;
  if (!id) throw new Error('ELEVENLABS_AGENT_ID not configured');

  const result = await client.conversationalAi.conversations.getSignedUrl({
    agentId: id,
  });

  logger.info('[voice/el] signed URL generated for agent:', id);
  return { signedUrl: result.signedUrl };
}

/**
 * Отримує деталі завершеної розмови (тривалість, транскрипт).
 */
export async function getConversationDetails(
  conversationId: string,
): Promise<{
  durationSeconds: number;
  transcript: Array<{ role: string; message: string; timestamp?: number }>;
} | null> {
  try {
    const client = getClient();
    const conv = await client.conversationalAi.conversations.get(conversationId);

    const durationSeconds = conv.metadata?.callDurationSecs ?? 0;

    const transcript = (conv.transcript ?? []).map(t => ({
      role: String(t.role),
      message: t.message ?? '',
      timestamp: t.timeInCallSecs,
    }));

    return { durationSeconds, transcript };
  } catch (err) {
    logger.error('[voice/el] getConversationDetails error:', err);
    return null;
  }
}
