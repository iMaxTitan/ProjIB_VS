/**
 * Audio transcription via OpenAI Whisper.
 * Used by channel adapters (Telegram, Teams) to convert voice → text.
 * Does NOT know about bot-core or HTTP transport.
 */
import { config } from '@/lib/shared/config';

const WHISPER_ENDPOINT = 'https://api.openai.com/v1/audio/transcriptions';
const WHISPER_MODEL = 'whisper-1';

/**
 * Transcribe audio buffer to text using OpenAI Whisper.
 * @param buffer   Raw audio data (OGG, MP3, MP4, WAV, WEBM, etc.)
 * @param filename Filename with extension — Whisper uses it to detect format
 * @param language ISO-639-1 hint (e.g. 'uk', 'ru', 'en'). Omit for auto-detect.
 */
export async function transcribeAudio(
  buffer: Buffer,
  filename: string,
  language?: string,
): Promise<string> {
  const apiKey = config.openai.apiKey;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

  const form = new FormData();
  form.append('model', WHISPER_MODEL);
  form.append('file', new Blob([buffer]), filename);
  form.append('response_format', 'text');
  if (language) form.append('language', language);

  const response = await fetch(WHISPER_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Whisper error ${response.status}: ${err}`);
  }

  const text = await response.text();
  return text.trim();
}
