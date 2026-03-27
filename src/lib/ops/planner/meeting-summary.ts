/**
 * Generate AI summary for a calendar meeting transcript.
 * Reuses Graph API helpers from meetings module + Anthropic AI client.
 */
import type { SupabaseClient } from '@/lib/shared/postgrest-client';
import { getGraphToken, graphGet, graphGetText } from '@/lib/ops/graph/client';
import { parseVTT, formatTranscriptAsText } from '@/lib/ops/graph/meetings';
import { generateAITextWithUsage } from '@/lib/shared/ai/client';
import { config } from '@/lib/shared/config';
import logger from '@/lib/shared/logger';
import { GRAPH_BASE as GRAPH } from './calendar-shared';
const MAX_TRANSCRIPT_CHARS = 12_000;

const SUMMARY_SYSTEM_PROMPT = `Ти — аналітик нарад. Отримуєш транскрипт наради у форматі "Спікер: фраза" і складаєш стисле резюме.

Структура резюме (HTML):
<b>Ключові теми</b>
<ul><li>тема 1</li><li>тема 2</li></ul>

<b>Позиції учасників</b>
<ul><li><b>Прізвище І.О.</b>: що намагався донести, яку думку відстоював або яке питання порушував</li></ul>

<b>Рішення та домовленості</b>
<ul><li>рішення 1</li></ul>

<b>Action Items</b>
<ul><li>хто: що зробить</li></ul>

Правила:
- Відповідай мовою транскрипту (якщо суміш — українською)
- У "Позиції учасників" — по одному пункту на кожного активного учасника (не більше 2 речень)
- Якщо action items відсутні — не додавай цей блок
- Будь стислим: максимум 5-7 пунктів на блок
- Не додавай нічого зайвого — тільки те, що є в транскрипті`;

// ─── Graph helpers ────────────────────────────────────────────────────────────

interface OnlineMeetingInfo { id: string }
interface TranscriptInfo { id: string }

async function getJoinUrl(token: string, userOid: string, eventId: string): Promise<string | null> {
  const url = `${GRAPH}/users/${userOid}/events/${encodeURIComponent(eventId)}?$select=onlineMeeting`;
  const res = await graphGet<{ onlineMeeting?: { joinUrl?: string } }>(token, url);
  return res.data?.onlineMeeting?.joinUrl ?? null;
}

async function getOnlineMeetingId(token: string, userOid: string, joinUrl: string): Promise<string | null> {
  const filter = `joinWebUrl eq '${joinUrl}'`;
  const url = `${GRAPH}/users/${userOid}/onlineMeetings?$filter=${encodeURIComponent(filter)}`;
  const res = await graphGet<{ value: OnlineMeetingInfo[] }>(token, url);
  return res.data?.value?.[0]?.id ?? null;
}

async function getTranscriptId(token: string, userOid: string, meetingId: string): Promise<string | null> {
  const url = `${GRAPH}/users/${userOid}/onlineMeetings/${encodeURIComponent(meetingId)}/transcripts`;
  const res = await graphGet<{ value: TranscriptInfo[] }>(token, url);
  return res.data?.value?.[0]?.id ?? null;
}

async function fetchTranscriptText(token: string, userOid: string, meetingId: string, transcriptId: string): Promise<string | null> {
  const url = `${GRAPH}/users/${userOid}/onlineMeetings/${encodeURIComponent(meetingId)}/transcripts/${encodeURIComponent(transcriptId)}/content?$format=text/vtt`;
  const res = await graphGetText(token, url);
  if (!res.ok) return null;
  const segments = parseVTT(res.text);
  return formatTranscriptAsText(segments);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function generateMeetingSummary(
  db: SupabaseClient,
  entryId: string,
  userOid: string,
): Promise<{ summary: string } | { error: string }> {
  // 1. Get entry
  const { data: entry } = await db.from('weekly_calendar_entries')
    .select('outlook_event_id, transcript_summary, ical_uid')
    .eq('id', entryId).single();

  if (!entry?.outlook_event_id) return { error: 'Entry not found' };
  if (entry.transcript_summary) return { summary: entry.transcript_summary };

  // 1b. Check shared meeting_cache for summary from another user
  if (entry.ical_uid) {
    const { data: cached } = await db.from('meeting_cache')
      .select('transcript_summary')
      .eq('ical_uid', entry.ical_uid)
      .maybeSingle();
    if (cached?.transcript_summary) {
      // Copy to per-user entry for fast access next time
      await db.from('weekly_calendar_entries')
        .update({ transcript_summary: cached.transcript_summary })
        .eq('id', entryId);
      return { summary: cached.transcript_summary };
    }
  }

  // 2. Graph chain: event → joinUrl → meetingId → transcriptId → VTT
  const token = await getGraphToken();
  if (!token) return { error: 'Graph auth failed' };

  const joinUrl = await getJoinUrl(token, userOid, entry.outlook_event_id);
  if (!joinUrl) return { error: 'Not an online meeting' };

  const meetingId = await getOnlineMeetingId(token, userOid, joinUrl);
  if (!meetingId) return { error: 'Online meeting not found' };

  const transcriptId = await getTranscriptId(token, userOid, meetingId);
  if (!transcriptId) return { error: 'Transcript not found' };

  const transcriptText = await fetchTranscriptText(token, userOid, meetingId, transcriptId);
  if (!transcriptText) return { error: 'Could not fetch transcript' };

  // 3. AI summary
  const apiKey = config.anthropic.apiKey;
  if (!apiKey) return { error: 'AI service not configured' };

  const truncated = transcriptText.length > MAX_TRANSCRIPT_CHARS
    ? transcriptText.slice(0, MAX_TRANSCRIPT_CHARS) + '\n\n[транскрипт скорочено]'
    : transcriptText;

  const result = await generateAITextWithUsage({
    messages: [{ role: 'user', content: `Транскрипт наради:\n\n${truncated}` }],
    systemPrompt: SUMMARY_SYSTEM_PROMPT,
    maxTokens: 1200,
    temperature: 0.3,
    timeoutMs: 30_000,
    providerOverride: 'anthropic',
    apiKeyOverride: apiKey,
    anthropicModel: 'claude-haiku-4-5-20251001',
  });

  logger.info(`[meeting-summary] Generated summary for entry ${entryId} (${result.usage?.prompt_tokens ?? '?'}+${result.usage?.completion_tokens ?? '?'} tokens)`);

  // 4. Save to per-user entry
  const { error } = await db.from('weekly_calendar_entries')
    .update({ transcript_summary: result.text })
    .eq('id', entryId);

  if (error) logger.error('[meeting-summary] Save error:', error);

  // 5. Save to shared meeting_cache (so other users get it instantly)
  if (entry.ical_uid) {
    const { error: cacheErr } = await db.from('meeting_cache')
      .upsert({
        ical_uid: entry.ical_uid,
        transcript_summary: result.text,
        generated_by: userOid,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'ical_uid' });
    if (cacheErr) logger.error('[meeting-summary] meeting_cache upsert error:', cacheErr);
    else logger.info(`[meeting-summary] Cached summary for ical_uid=${entry.ical_uid}`);
  }

  return { summary: result.text };
}
