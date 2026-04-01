import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/shared/logger';
import {
  isRequestAuthorized,
  getRequesterKey,
  getDbUserId,
  checkRateLimit,
} from '@/lib/shared/api/request-guards';
import { ROLE_GROUPS, hasRole } from '@/lib/shared/auth/role-groups';
import { getServerDb } from '@/lib/shared/db-server';
import { processDocument } from '@/lib/kb';
import { fetchLaw } from '@/lib/ops/laws/fetcher-client';

const RATE_LIMIT = 15;
const RATE_WINDOW_MS = 60_000;

interface ImportBody {
  url?: string;
  title: string;
  docType: string;
  docNumber: string;
  categoryId: string;
  parentDocId?: string;
  relatedDocIds?: string[];
  relatedDocsText?: string;
  /** Markdown content when importing from file (no URL fetch needed). */
  fileContent?: string;
  fileName?: string;
}

/** Build markdown header with metadata for RAG chunker. */
function buildHeader(p: {
  title: string;
  docType: string;
  docNumber: string;
  sourceUrl: string;
  parentLaw?: string;
  relatedText?: string;
}): string {
  const lines = [
    `> **Тип:** ${p.docType}`,
    `> **Номер:** ${p.docNumber}`,
    `> **Редакція:** актуальна станом на ${new Date().toISOString().split('T')[0]}`,
    `> **Джерело:** ${p.sourceUrl}`,
  ];
  if (p.parentLaw) lines.push(`> **На виконання:** ${p.parentLaw}`);
  if (p.relatedText) lines.push(`> **Пов'язані акти:** ${p.relatedText}`);
  return lines.join('\n');
}

export async function POST(req: NextRequest) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const rl = checkRateLimit(getRequesterKey(req), RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too Many Requests' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } });
  }

  const userId = getDbUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  }

  try {
    const db = getServerDb();

    // Role check — only managers can import laws
    const { data: profile } = await db
      .from('user_profiles')
      .select('role')
      .eq('user_id', userId)
      .single();

    if (!profile || !hasRole(profile.role as string, ROLE_GROUPS.KB_MANAGERS)) {
      return NextResponse.json({ error: 'Forbidden: only chief or head can import laws' }, { status: 403 });
    }
    const body = (await req.json()) as ImportBody;
    const { url, title, docType, docNumber, categoryId, parentDocId, relatedDocIds, relatedDocsText, fileContent, fileName } = body;

    if (!title || !docType || !categoryId) {
      return NextResponse.json({ error: 'title, docType, categoryId are required' }, { status: 400 });
    }
    if (!url && !fileContent) {
      return NextResponse.json({ error: 'url or fileContent is required' }, { status: 400 });
    }

    // Extract docNumber from URL if not provided
    const rawDocNumber = docNumber || (url?.match(/\/laws\/show\/([^\/#]+)/)?.[1] || 'unknown');
    const effectiveDocNumber = decodeURIComponent(rawDocNumber);

    // 1. Get document content — fetch from URL or use provided file content
    let fetchedTitle = title;
    let rawMarkdown: string;

    if (fileContent) {
      rawMarkdown = fileContent;
    } else {
      const fetched = await fetchLaw(url!);
      rawMarkdown = fetched.markdown;
      fetchedTitle = fetched.title || title;
    }

    // 2. Resolve parent law title for header
    let parentLawLabel: string | undefined;
    if (parentDocId) {
      const { data: parentDoc } = await db
        .from('kb_documents')
        .select('title, metadata')
        .eq('id', parentDocId)
        .single();
      if (parentDoc) {
        const pNum = (parentDoc.metadata as Record<string, string>)?.doc_number;
        parentLawLabel = pNum ? `${pNum} — ${parentDoc.title as string}` : (parentDoc.title as string);
      }
    }

    // 3. Build header with metadata
    const sourceUrl = url?.replace(/#.*$/, '') || '';
    const header = buildHeader({
      title: fetchedTitle,
      docType,
      docNumber: effectiveDocNumber,
      sourceUrl,
      parentLaw: parentLawLabel,
      relatedText: relatedDocsText,
    });

    // 4. Inject header into markdown
    let markdown = rawMarkdown;
    const titleLine = markdown.match(/^# .+/);
    if (titleLine) {
      markdown = markdown.replace(/^# .+/, `${titleLine[0]}\n\n${header}`);
    } else {
      markdown = `# ${fetchedTitle}\n\n${header}\n\n${markdown}`;
    }

    // 5. Insert document record
    const sourceFilename = fileName
      || (effectiveDocNumber !== 'unknown' ? `${effectiveDocNumber.replace(/[\/\\]/g, '-')}.md` : 'uploaded.md');

    const metadata = {
      doc_type: docType,
      doc_number: effectiveDocNumber,
      source_url: sourceUrl || null,
      related_docs: relatedDocIds || [],
      parent_doc_id: parentDocId || null,
      fetched_at: new Date().toISOString().split('T')[0],
    };

    const { data: docs, error: insertError } = await db
      .from('kb_documents')
      .insert({
        title: fetchedTitle,
        source_filename: sourceFilename,
        mime_type: 'text/markdown',
        category_id: categoryId,
        created_by: userId,
        status: 'processing',
        content: '',
        metadata,
      })
      .select('id');

    if (insertError || !docs || !Array.isArray(docs) || docs.length === 0) {
      logger.error('[kb/laws/import] Insert error:', insertError);
      return NextResponse.json({ error: 'Failed to create document record' }, { status: 500 });
    }

    const documentId = (docs[0] as { id: string }).id;

    // 6. Fire-and-forget processing pipeline
    const buffer = Buffer.from(markdown, 'utf-8');

    const { data: cat } = await db
      .from('kb_categories')
      .select('name')
      .eq('id', categoryId)
      .single();

    Promise.resolve()
      .then(() => processDocument(documentId, buffer, 'text/markdown', fetchedTitle, (cat?.name as string) || 'Законодавство'))
      .then(result => {
        logger.info(`[kb/laws/import] Processed ${documentId}: ${result.chunkCount} chunks`);
      })
      .catch(async (err: Error) => {
        logger.error(`[kb/laws/import] Processing failed for ${documentId}:`, err);
        try {
          await db.from('kb_documents').update({ status: 'error', error_message: err.message }).eq('id', documentId);
        } catch { /* ignore update failure */ }
      });

    return NextResponse.json({ documentId, title: fetchedTitle, charCount: markdown.length }, { status: 202 });
  } catch (error: unknown) {
    logger.error('[kb/laws/import] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
