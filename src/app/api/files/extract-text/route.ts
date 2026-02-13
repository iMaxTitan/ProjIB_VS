import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getRequesterKey, getUserIdFromToken, isRequestAuthorized } from '@/lib/api/request-guards';
import { extractDocumentNumberFromText } from '@/lib/utils/document-number';
import logger from '@/lib/logger';

const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

export async function POST(request: NextRequest) {
  if (!isRequestAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rateLimitKey = getUserIdFromToken(request) || getRequesterKey(request);
  const { allowed, retryAfterSec } = checkRateLimit(rateLimitKey, RATE_LIMIT, RATE_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large (max 20MB)' }, { status: 413 });
    }

    const name = file.name.toLowerCase();
    if (!name.endsWith('.doc')) {
      return NextResponse.json({ error: 'Only .doc files accepted' }, { status: 400 });
    }

    logger.info('[FileExtract] Processing:', file.name, file.size, 'bytes');

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const WordExtractor = require('word-extractor');
    const extractor = new WordExtractor();
    const extracted = await extractor.extract(buffer);
    const text: string = extracted.getBody()?.trim() || '';

    logger.info('[FileExtract] Extracted', text.length, 'chars from', file.name);

    const documentNumber = text.length > 0 ? extractDocumentNumberFromText(text) : null;

    return NextResponse.json({ text, documentNumber });
  } catch (err: unknown) {
    logger.error('[FileExtract] Error:', err);
    return NextResponse.json({ error: 'Failed to extract text' }, { status: 500 });
  }
}
