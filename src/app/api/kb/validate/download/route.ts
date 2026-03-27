/**
 * POST /api/kb/validate/download — generate and download a normalized .docx.
 * Auth: chief or head. Rate limit: 20/min.
 * Body: { normalizedText: string, fileName: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/shared/logger';
import { buildNormalizedDocx } from '@/lib/kb/docx-builder';
import { requireKbManager } from '../_auth';

const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export async function POST(req: NextRequest) {
  const auth = await requireKbManager(req, RATE_LIMIT, RATE_WINDOW_MS);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const { normalizedText, fileName } = body as { normalizedText?: string; fileName?: string };

    if (!normalizedText || typeof normalizedText !== 'string') {
      return NextResponse.json({ error: 'Missing normalizedText' }, { status: 400 });
    }
    if (!fileName || typeof fileName !== 'string') {
      return NextResponse.json({ error: 'Missing fileName' }, { status: 400 });
    }

    const docBuffer = buildNormalizedDocx(normalizedText);

    const baseName = fileName.replace(/\.docx$/i, '');
    const outputName = `normalized-${baseName}.docx`;

    return new NextResponse(docBuffer as unknown as BodyInit, {
      headers: {
        'Content-Type': DOCX_MIME,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(outputName)}"`,
        'Content-Length': String(docBuffer.length),
      },
    });

  } catch (error: unknown) {
    logger.error('[kb/validate/download/POST] Error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
