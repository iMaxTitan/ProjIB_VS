import { createClient } from '@/lib/shared/postgrest-client';
import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/shared/logger';
import { config } from '@/lib/shared/config';
import {
  isRequestAuthorized,
  getDbUserId,
  checkRateLimit,
} from '@/lib/shared/api/request-guards';
import { ROLE_GROUPS, hasRole } from '@/lib/shared/auth/role-groups';
import { fetchWithTimeout } from '@/lib/shared/utils/fetch-with-timeout';

// ─── Rate limit config ───
const RATE_LIMIT_READ = 30;
const RATE_LIMIT_WRITE = 10;
const RATE_WINDOW_MS = 60_000;

const VALID_CATEGORIES = ['task_description', 'company_report_note'] as const;
type Category = (typeof VALID_CATEGORIES)[number];
const MAX_CONTENT_LENGTH = 2000;

// ─── Strip project references from etalon text ───
// Projects are dynamic — etalons should be generic templates.
// AI adds "в рамках проекту" dynamically from task context.
function stripProjectReferences(text: string): string {
  return text
    // «Проект» or "Проект" in various quote styles
    .replace(/\s*[Вв]\s+рамках\s+проект[уі]\s+[«"„].*?[»""]\s*/g, ' ')
    .replace(/\s*[Вв]\s+рамках\s+проект[уі]\s+\S+/g, ' ')
    // Clean up double spaces
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ─── DB service-role (lazy singleton) ───
let _db: ReturnType<typeof createClient> | null = null;
function getDb() {
  if (_db) return _db;
  const url = config.db.serverUrl;
  const key = config.db.serviceRoleKey;
  _db = createClient(url, key, { auth: { persistSession: false } });
  return _db;
}

// ─── OpenAI Embeddings ───
async function createEmbedding(text: string): Promise<number[]> {
  const apiKey = config.openai.apiKey;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

  const response = await fetchWithTimeout(
    'https://api.openai.com/v1/embeddings',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text,
      }),
    },
    10_000
  );

  if (!response.ok) {
    const errText = await response.text().catch(() => 'unknown');
    throw new Error(`OpenAI Embeddings API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const embedding: number[] = data?.data?.[0]?.embedding;
  if (!embedding || !Array.isArray(embedding)) {
    throw new Error('Invalid embedding response from OpenAI');
  }
  if (embedding.every((v) => v === 0)) {
    throw new Error('Zero embedding returned from OpenAI');
  }
  return embedding;
}

/**
 * GET /api/ai/embeddings
 * Query params: procedure_id, category, limit
 * Returns etalon examples for a procedure (without vector search — just filter)
 */
export async function GET(req: NextRequest) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = getDbUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  }

  const rateLimitKey = `embeddings-get:${userId}`;
  const rateLimit = checkRateLimit(rateLimitKey, RATE_LIMIT_READ, RATE_WINDOW_MS);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too Many Requests' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSec) } }
    );
  }

  const mode = req.nextUrl.searchParams.get('mode');

  // Mode: counts — aggregate etalon counts per procedure & category
  if (mode === 'counts') {
    try {
      const db = getDb();
      const { data, error } = await db.rpc('get_etalon_counts');
      if (error) throw error;
      return NextResponse.json(data || []);
    } catch (error: unknown) {
      logger.error('[ai/embeddings] GET counts error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }

  const procedureId = req.nextUrl.searchParams.get('procedure_id');
  const category = req.nextUrl.searchParams.get('category') || 'task_description';
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '5', 10), 20);

  if (!VALID_CATEGORIES.includes(category as Category)) {
    return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
  }

  try {
    const db = getDb();
    let query = db
      .from('ai_reference_examples')
      .select('id, content, procedure_id, category, source, created_at')
      .eq('category', category)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (procedureId) {
      query = query.eq('procedure_id', procedureId);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json(data || []);
  } catch (error: unknown) {
    logger.error('[ai/embeddings] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/ai/embeddings
 * Body: { content, category, procedure_id }
 * Creates an etalon with embedding. Only chief/head roles.
 */
export async function POST(req: NextRequest) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = getDbUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  }

  const rateLimitKey = `embeddings-post:${userId}`;
  const rateLimit = checkRateLimit(rateLimitKey, RATE_LIMIT_WRITE, RATE_WINDOW_MS);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too Many Requests' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSec) } }
    );
  }

  try {
    const body = await req.json();
    const { content, category, procedure_id, source } = body;

    // Validation
    if (!content || typeof content !== 'string' || content.length < 10 || content.length > MAX_CONTENT_LENGTH) {
      return NextResponse.json(
        { error: `Content required, 10-${MAX_CONTENT_LENGTH} chars` },
        { status: 400 }
      );
    }
    if (!VALID_CATEGORIES.includes(category as Category)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
    }

    // Check role: manual etalons — chief/head only, auto — any authenticated
    const db = getDb();
    const isAuto = source === 'auto';

    if (!isAuto) {
      const { data: userProfile } = await db
        .from('user_profiles')
        .select('role')
        .eq('user_id', userId)
        .single();

      const role = (userProfile as { role: string } | null)?.role;
      if (!role || !hasRole(role, ROLE_GROUPS.KB_MANAGERS)) {
        return NextResponse.json({ error: 'Forbidden: chief/head only' }, { status: 403 });
      }
    }

    // Strip project names — etalons must be project-agnostic
    const cleanedContent = stripProjectReferences(content);

    // Create embedding via OpenAI
    const embedding = await createEmbedding(cleanedContent);

    // Insert into DB
    const { data, error } = await db
      .from('ai_reference_examples')
      .insert({
        content: cleanedContent,
        category,
        procedure_id: procedure_id || null,
        embedding,
        approved_by: userId,
        source: source || 'manual',
      })
      .select('id, content, category, procedure_id, source, created_at')
      .single();

    if (error) throw error;

    return NextResponse.json(data, { status: 201 });
  } catch (error: unknown) {
    logger.error('[ai/embeddings] POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/ai/embeddings
 * Query param: id
 * Deletes an etalon. Only chief role.
 */
export async function DELETE(req: NextRequest) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = getDbUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  }

  const id = req.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 });
  }

  try {
    const db = getDb();

    // Check role: only chief can delete
    const { data: userProfile } = await db
      .from('user_profiles')
      .select('role')
      .eq('user_id', userId)
      .single();

    const role = (userProfile as { role: string } | null)?.role;
    if (!role || role !== 'chief') {
      return NextResponse.json({ error: 'Forbidden: chief only' }, { status: 403 });
    }

    const { error } = await db
      .from('ai_reference_examples')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    logger.error('[ai/embeddings] DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
