/**
 * POST /api/meetings/[meetingId]/summary
 * Body: { targetUserId: string, transcriptId: string }
 *
 * Fetches meeting transcript and generates AI summary using server ANTHROPIC_API_KEY.
 * targetUserId = DB user UUID. chief can pass any user; others must use own ID.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isRequestAuthorized, getDbUserId, checkRateLimit } from '@/lib/shared/api/request-guards';
import { config } from '@/lib/shared/config';
import { getServerDb } from '@/lib/shared/db-server';
import { getTranscriptText } from '@/lib/ops/graph/meetings';
import { generateAITextWithUsage } from '@/lib/shared/ai/client';
import logger from '@/lib/shared/logger';

const SUMMARY_SYSTEM_PROMPT = `Ти — аналітик нарад. Отримуєш транскрипт наради у форматі "Спікер: фраза" і складаєш стисле резюме.

Структура резюме (HTML):
<b>📋 Ключові теми</b>
<ul><li>тема 1</li><li>тема 2</li></ul>

<b>🗣️ Позиції учасників</b>
<ul><li><b>Прізвище І.О.</b>: що намагався донести, яку думку відстоював або яке питання порушував</li></ul>

<b>✅ Рішення та домовленості</b>
<ul><li>рішення 1</li></ul>

<b>📌 Action Items</b>
<ul><li>хто: що зробить</li></ul>

Правила:
- Відповідай мовою транскрипту (якщо суміш — українською)
- У "Позиції учасників" — по одному пункту на кожного активного учасника (не більше 2 речень)
- Якщо action items відсутні — не додавай цей блок
- Будь стислим: максимум 5-7 пунктів на блок
- Не додавай нічого зайвого — тільки те, що є в транскрипті`;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> },
) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const requestingUserId = getDbUserId(req);
  if (!requestingUserId) {
    return NextResponse.json({ error: 'Missing user ID' }, { status: 401 });
  }

  const rl = checkRateLimit(`meetings-summary:${requestingUserId}`, 5, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too Many Requests' }, { status: 429 });
  }

  const { meetingId } = await params;
  const body = await req.json() as { targetUserId?: string; transcriptId?: string };
  const { targetUserId: targetUserIdBody, transcriptId } = body;

  if (!transcriptId) {
    return NextResponse.json({ error: 'Missing transcriptId' }, { status: 400 });
  }

  try {
    const db = getServerDb();

    // Verify access
    const { data: requestingProfile } = await db
      .from('user_profiles')
      .select('role')
      .eq('user_id', requestingUserId)
      .single();

    if (!requestingProfile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const isChief = requestingProfile.role === 'chief';
    const effectiveUserId = (isChief && targetUserIdBody && targetUserIdBody !== requestingUserId)
      ? targetUserIdBody
      : requestingUserId;

    // Resolve AAD OID
    const { data: targetProfile } = await db
      .from('user_profiles')
      .select('teams_aad_oid')
      .eq('user_id', effectiveUserId)
      .single();

    const userOid = targetProfile?.teams_aad_oid;
    if (!userOid) {
      return NextResponse.json({ error: 'Teams not linked for this user' }, { status: 404 });
    }

    // Get transcript text
    const transcriptText = await getTranscriptText(userOid, meetingId, transcriptId);
    if (!transcriptText) {
      return NextResponse.json({ error: 'Transcript not available' }, { status: 404 });
    }

    // Truncate to ~12000 chars to stay within token limits
    const truncated = transcriptText.length > 12000
      ? transcriptText.slice(0, 12000) + '\n\n[транскрипт скорочено]'
      : transcriptText;

    const apiKey = config.anthropic.apiKey;
    if (!apiKey) {
      return NextResponse.json({ error: 'AI service not configured' }, { status: 503 });
    }

    const result = await generateAITextWithUsage({
      messages: [{ role: 'user', content: `Транскрипт наради:\n\n${truncated}` }],
      systemPrompt: SUMMARY_SYSTEM_PROMPT,
      maxTokens: 1200,
      temperature: 0.3,
      timeoutMs: 30_000,
      providerOverride: 'anthropic',
      apiKeyOverride: apiKey,
      anthropicModel: 'claude-3-haiku-20240307',
    });

    return NextResponse.json({ summary: result.text });
  } catch (err) {
    logger.error('[api/meetings/summary] Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
