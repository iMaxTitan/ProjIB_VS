/**
 * POST /api/kb/validate — validate a document before indexing.
 * Returns ValidationResult with structural checks + AI analysis.
 * Auth: chief or head only. Rate limit: 10/min.
 */

import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/shared/logger';
import {
  isRequestAuthorized,
  getRequesterKey,
  getDbUserId,
  checkRateLimit,
} from '@/lib/shared/api/request-guards';
import { getServerDb } from '@/lib/shared/db-server';
import { validateDocument } from '@/lib/kb/validator';

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

function isSupportedFormat(mime: string, name: string): boolean {
  const lower = name.toLowerCase();
  return (
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mime === 'text/markdown' ||
    lower.endsWith('.docx') ||
    lower.endsWith('.md')
  );
}

export async function POST(req: NextRequest) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rateLimit = checkRateLimit(getRequesterKey(req), RATE_LIMIT, RATE_WINDOW_MS);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too Many Requests' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSec) } },
    );
  }

  const userId = getDbUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  }

  const db = getServerDb();
  const { data: profile } = await db
    .from('user_profiles')
    .select('role')
    .eq('user_id', userId)
    .single();

  if (!profile || !['chief', 'head'].includes(profile.role as string)) {
    return NextResponse.json(
      { error: 'Forbidden: only chief or head can validate documents' },
      { status: 403 },
    );
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large (max 20MB)' }, { status: 413 });
    }
    if (!isSupportedFormat(file.type, file.name)) {
      return NextResponse.json(
        { error: 'Підтримується тільки формат .docx (Microsoft Word) або .md (Markdown)' },
        { status: 400 },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = await validateDocument(buffer, file.type, file.name);
    return NextResponse.json(result);

  } catch (error: unknown) {
    logger.error('[kb/validate/POST] Error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
