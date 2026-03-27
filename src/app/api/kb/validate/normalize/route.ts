/**
 * POST /api/kb/validate/normalize — AI-rewrite of a document to meet Document Guide v2.
 * Auth: chief or head. Rate limit: 5/min (heavy AI call ~30–180s).
 * Body: FormData { file: DOCX, checksJson: string, aiChecksJson: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/shared/logger';
import { parseDOCX, preprocessText } from '@/lib/kb/processor';
import { normalizeDocument } from '@/lib/kb/normalizer';
import type { ValidationResult } from '@/lib/kb/validator';
import { requireKbManager } from '../_auth';

const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60_000;
const MAX_FILE_SIZE = 20 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const auth = await requireKbManager(req, RATE_LIMIT, RATE_WINDOW_MS);
  if (!auth.ok) return auth.response;

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const checksJson = formData.get('checksJson') as string | null;
    const aiChecksJson = formData.get('aiChecksJson') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large (max 20MB)' }, { status: 413 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const parsed = await parseDOCX(buffer);
    const fullText = preprocessText(parsed.body);

    const validation: Pick<ValidationResult, 'checks' | 'aiAnalysis'> = {
      checks: checksJson ? JSON.parse(checksJson) : [],
      aiAnalysis: {
        overallScore: 'minor_fixes',
        summary: '',
        recommendations: [],
        aiChecks: aiChecksJson ? JSON.parse(aiChecksJson) : [],
        fixInstructions: [],
      },
    };

    const result = await normalizeDocument(fullText, file.name, validation);
    return NextResponse.json(result);

  } catch (error: unknown) {
    logger.error('[kb/validate/normalize/POST] Error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
