/**
 * GET /api/kb/gap-analysis
 * Groups failed KB queries into topic clusters using GPT-4o-mini.
 * Chief only. Results cached 1h in memory.
 * DELETE — invalidate cache.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isRequestAuthorized, getDbUserId, checkRateLimit, getRequesterKey } from '@/lib/shared/api/request-guards';
import { getServerDb } from '@/lib/shared/db-server';
import { generateAIText } from '@/lib/shared/ai/client';
import { config } from '@/lib/shared/config';
import logger from '@/lib/shared/logger';

export interface GapTopic {
  topic: string;
  queries: string[];
  suggestion: string;
  count: number;
}

// In-memory cache (1h)
let cache: { data: GapTopic[]; builtAt: number; expiresAt: number } | null = null;

async function checkChiefRole(db: ReturnType<typeof getServerDb>, userId: string): Promise<boolean> {
  const { data } = await db.from('user_profiles').select('role').eq('user_id', userId).single();
  return data?.role === 'chief';
}

export async function GET(req: NextRequest) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = getDbUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Missing user ID' }, { status: 401 });
  }
  const rl = checkRateLimit(getRequesterKey(req), 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too Many Requests' }, { status: 429 });
  }

  const db = getServerDb();
  if (!await checkChiefRole(db, userId)) {
    return NextResponse.json({ error: 'Forbidden — chief only' }, { status: 403 });
  }

  // Return cache if fresh
  if (cache && cache.expiresAt > Date.now()) {
    return NextResponse.json({ topics: cache.data, cached: true, builtAt: cache.builtAt });
  }

  // Fetch failed queries (no chunks OR AI refused)
  const { data: failedLogs, error } = await db
    .from('kb_query_log')
    .select('query_original, query_translated, triage_label')
    .or('chunks_found.eq.0,ai_refused.eq.true')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    logger.error('[kb/gap-analysis] fetch error:', error);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }

  // Exclude manually triaged garbage/out_of_scope
  const meaningful = (failedLogs ?? []).filter(
    (l) => !['garbage', 'out_of_scope'].includes(l.triage_label ?? '')
  );

  if (meaningful.length === 0) {
    return NextResponse.json({ topics: [], cached: false, builtAt: Date.now() });
  }

  const queries = meaningful.map((l) => l.query_translated || l.query_original);

  if (!config.openai.apiKey) {
    return NextResponse.json({ error: 'OpenAI not configured' }, { status: 500 });
  }

  let topics: GapTopic[] = [];
  try {
    const prompt = `Ти аналітик бази знань. Згрупуй ці запити від користувачів, на які система не змогла відповісти, за темами.

Запити:
${queries.map((q, i) => `${i + 1}. ${q}`).join('\n')}

Поверни JSON масив (без markdown, тільки JSON):
[
  {
    "topic": "Коротка назва теми (2-5 слів)",
    "queries": ["запит 1", "запит 2"],
    "suggestion": "Назва документа, який варто додати в КБ",
    "count": 2
  }
]

Правила:
- Групуй схожі запити разом
- Унікальні запити — окрема група з count: 1
- Відповідай ТІЛЬКИ JSON масивом, без пояснень`;

    const text = await generateAIText({
      messages: [{ role: 'user', content: prompt }],
      openAIModel: 'gpt-4o-mini',
      maxTokens: 1200,
      temperature: 0.2,
      timeoutMs: 25_000,
    });

    const jsonStr = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    const parsed: GapTopic[] = JSON.parse(jsonStr);
    topics = parsed
      .map((t) => ({ ...t, count: t.queries?.length ?? t.count ?? 1 }))
      .sort((a, b) => b.count - a.count);
  } catch (e) {
    logger.error('[kb/gap-analysis] AI clustering error:', e);
    // Fallback: each query as its own topic
    topics = queries.slice(0, 15).map((q) => ({
      topic: q.slice(0, 60),
      queries: [q],
      suggestion: '',
      count: 1,
    }));
  }

  const builtAt = Date.now();
  cache = { data: topics, builtAt, expiresAt: builtAt + 3_600_000 };
  return NextResponse.json({ topics, cached: false, builtAt });
}

/** Invalidate cache (e.g. after new documents added) */
export async function DELETE(req: NextRequest) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  cache = null;
  return NextResponse.json({ ok: true });
}
