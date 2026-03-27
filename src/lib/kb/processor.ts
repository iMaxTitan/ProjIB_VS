/**
 * KB Document Processor — parses .docx and .md files and creates embeddings.
 *
 * Supported formats: DOCX (.docx), Markdown (.md)
 * DOCX: uses mammoth to preserve Word heading styles (Heading 1/2/3 -> # / ## / ###).
 *        Title/Subtitle styles are extracted as metadata, NOT converted to headings.
 * MD: decoded as UTF-8 text (headings already in # / ## / ### format).
 * Contextual Retrieval: contextual_content generated on-the-fly, NOT stored in DB.
 */

import { getServerDb } from '@/lib/shared/db-server';
import logger from '@/lib/shared/logger';
import { chunkDocument, buildContextualContent, type DocMetaForEmbedding } from './chunker';
import { embedBatch } from './embedder';
import { generateContextualPrefixes } from './contextual-prefix';
import { parseDOCX } from './processor-docx';
export { parseDOCX };
export type { ParsedDocument, StyleMetadata } from './processor-docx';

// ---- Concurrency limiter (prevent OOM on bulk uploads) ----

const MAX_CONCURRENT = 2;
const MAX_QUEUED = 8; // reject uploads beyond this to prevent OOM
let _running = 0;
const _queue: Array<() => void> = [];

/** Check if the processing queue can accept more work */
export function canAcceptWork(): boolean {
  return _queue.length < MAX_QUEUED;
}

/** Current queue depth (for logging) */
export function getQueueDepth(): number {
  return _queue.length;
}

function acquireSlot(): Promise<void> {
  if (_running < MAX_CONCURRENT) {
    _running++;
    return Promise.resolve();
  }
  return new Promise<void>(resolve => {
    _queue.push(() => { _running++; resolve(); });
  });
}

function releaseSlot(): void {
  _running--;
  const next = _queue.shift();
  if (next) next();
}

// ---- Text preprocessing ----

/**
 * Strip common DOCX extraction artifacts before chunking.
 * Works with mammoth markdown output (headings as # / ## / ###).
 */
export function preprocessText(text: string): string {
  return text
    // Remove approval stamps: СТВЕРДЖУЮ, ЗАТВЕРДЖЕНО, ПОГОДЖУЮ, УЗГОДЖЕНО, ВВЕДЕНО В ДІЮ
    .replace(/^[«"']?(СТВЕРДЖУЮ|ЗАТВЕРДЖУЮ|ЗАТВЕРДЖЕНО|ПОГОДЖЕНО|ПОГОДЖУЮ|УЗГОДЖЕНО|ВВЕДЕНО В ДІЮ)[»"']?\s*$/gim, '')
    .replace(/^Протокол\s*№[\s_]*\d*.*$/gm, '')
    // Remove date stamps: «15» грудня 2023 р.
    .replace(/^[«"']\d{1,2}[»"']\s*_*\w+_*\s*\d{4}\s*р\.?\s*$/gm, '')
    // Remove signature lines: Генеральний директор, М.П., long underscores
    .replace(/^[\s_]*(Генеральний директор|Директор|М\.?\s*П\.?)[\s_]*$/gm, '')
    .replace(/^[\s_]{10,}$/gm, '')
    // Remove standalone page numbers: — 5 —, -12-, 3
    .replace(/^\s*[—–-]?\s*\d{1,3}\s*[—–-]?\s*$/gm, '')
    // Remove summary/notes artifacts
    .replace(/\(Зведення усіх частин\)/gi, '')
    // Collapse 3+ consecutive blank lines into 2
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ---- MIME / extension detection ----

export function isDOCX(mimeType: string, fileName?: string): boolean {
  return (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    (fileName?.toLowerCase().endsWith('.docx') ?? false)
  );
}

export function isMarkdown(mimeType: string, fileName?: string): boolean {
  return (
    mimeType === 'text/markdown' ||
    (fileName?.toLowerCase().endsWith('.md') ?? false)
  );
}

// ---- Markdown parser ----

/** Decode buffer as UTF-8 — Markdown is already plain text with # headings. */
export function parseMarkdown(buffer: Buffer): string {
  return buffer.toString('utf-8');
}

// ---- Main pipeline ----

export interface ProcessResult {
  documentId: string;
  chunkCount: number;
}

import type { Chunk } from './chunker';
import type { SupabaseClient } from '@/lib/shared/postgrest-client';

/** Load document metadata for enriched embeddings. Returns null for non-metadata docs. */
async function loadDocMeta(db: SupabaseClient, documentId: string): Promise<DocMetaForEmbedding | null> {
  const { data } = await db.from('kb_documents').select('metadata, title').eq('id', documentId).single();
  if (!data) return null;
  const doc = data as { metadata?: Record<string, unknown>; title?: string };
  const meta = doc.metadata;
  if (!meta || !meta.doc_type) return null;

  const result: DocMetaForEmbedding = {
    doc_type: meta.doc_type as string,
    doc_number: meta.doc_number as string,
  };

  // Resolve parent document title
  if (meta.parent_doc_id) {
    const { data: parent } = await db.from('kb_documents').select('title, metadata').eq('id', meta.parent_doc_id as string).single();
    if (parent) {
      const p = parent as { title?: string; metadata?: Record<string, unknown> };
      const parentNum = (p.metadata as Record<string, unknown>)?.doc_number || '';
      result.parent_law = parentNum ? `${parentNum} — ${p.title}` : (p.title || '');
    }
  }

  // Related acts from metadata header (stored as text in markdown header)
  // Try to extract from related_docs array or use doc titles
  const relatedIds = (meta.related_docs as string[]) || [];
  if (relatedIds.length > 0) {
    const { data: relDocs } = await db.from('kb_documents').select('title, metadata').in('id', relatedIds);
    if (relDocs && Array.isArray(relDocs)) {
      result.related_acts = relDocs.map((r: { title?: string; metadata?: Record<string, unknown> }) => {
        const num = (r.metadata as Record<string, unknown>)?.doc_number || '';
        return num ? `${num} (${(r.title || '').substring(0, 40)})` : (r.title || '');
      }).join(', ');
    }
  }

  return result;
}

/** Shared embed+insert logic for both processDocument and processFromMarkdown. */
async function embedAndInsertChunks(
  db: SupabaseClient, documentId: string, chunks: Chunk[],
  prefixes: string[], categoryName: string, title: string,
  docMeta?: DocMetaForEmbedding | null,
): Promise<void> {
  const EMBED_BATCH = 100;
  const DB_BATCH = 50;

  // Delete old chunks before re-indexing (idempotent: no-op if none exist)
  const { error: delErr } = await db.from('kb_chunks').delete().eq('document_id', documentId);
  if (delErr) logger.warn('[kb/processor] failed to delete old chunks:', delErr.message);

  for (let batchStart = 0; batchStart < chunks.length; batchStart += EMBED_BATCH) {
    const batchChunks = chunks.slice(batchStart, batchStart + EMBED_BATCH);
    const batchPrefixes = prefixes.slice(batchStart, batchStart + EMBED_BATCH);
    const contextualContents = batchChunks.map((chunk, i) =>
      buildContextualContent(categoryName, title, chunk.heading, chunk.content, batchPrefixes[i] || undefined, docMeta)
    );
    const embeddings = await embedBatch(contextualContents);
    const chunkRows = batchChunks.map((chunk, i) => ({
      document_id: documentId,
      chunk_index: chunk.chunkIndex,
      content: chunk.content,
      embedding: JSON.stringify(embeddings[i]),
      heading: chunk.heading || null,
      token_count: chunk.tokenCount,
      contextual_prefix: batchPrefixes[i] || null,
    }));
    for (let i = 0; i < chunkRows.length; i += DB_BATCH) {
      const { error } = await db.from('kb_chunks').insert(chunkRows.slice(i, i + DB_BATCH));
      if (error) throw error;
    }
  }
}

/** Full async processing pipeline (DOCX + Markdown). */
export async function processDocument(
  documentId: string, buffer: Buffer, mimeType: string,
  title: string, categoryName: string, fileName?: string,
): Promise<ProcessResult> {
  await acquireSlot();
  logger.info(`[kb/processor] slot acquired for ${documentId} (running: ${_running}, queued: ${_queue.length})`);
  const db = getServerDb();

  try {
    let rawText: string;
    let effectiveTitle = title;

    if (isDOCX(mimeType, fileName)) {
      const parsed = await parseDOCX(buffer);
      rawText = parsed.body;
      const styleTitle = parsed.styleMetadata.title;
      if (styleTitle && styleTitle.length > effectiveTitle.length) {
        effectiveTitle = styleTitle;
        await db.from('kb_documents').update({ title: effectiveTitle }).eq('id', documentId);
      }
    } else if (isMarkdown(mimeType, fileName)) {
      rawText = parseMarkdown(buffer);
    } else {
      throw new Error('Unsupported format. Only .docx and .md files are accepted.');
    }
    if (!rawText.trim()) throw new Error('Document is empty or could not be parsed');

    const setStage = async (stage: string) => {
      const { data } = await db.from('kb_documents').select('metadata').eq('id', documentId).single();
      const meta = (data as { metadata?: Record<string, unknown> } | null)?.metadata || {};
      await db.from('kb_documents').update({ metadata: { ...meta, processing_stage: stage } }).eq('id', documentId);
    };

    // Read document metadata for enriched embeddings
    const docMeta = await loadDocMeta(db, documentId);

    await setStage('chunking');
    const fullText = preprocessText(rawText);
    const chunks = chunkDocument(fullText);
    if (chunks.length === 0) throw new Error('No chunks produced from document');

    await setStage('prefix');
    let prefixes: string[];
    try {
      prefixes = await generateContextualPrefixes(
        effectiveTitle, fullText, chunks.map(c => ({ heading: c.heading, content: c.content })),
      );
    } catch (prefixErr) {
      logger.warn(`[kb/processor] Contextual prefix generation failed, proceeding without: ${(prefixErr as Error).message}`);
      prefixes = chunks.map(() => '');
    }

    await setStage('embedding');
    await embedAndInsertChunks(db, documentId, chunks, prefixes, categoryName, effectiveTitle, docMeta);

    const { error: updateError } = await db.from('kb_documents').update({
      status: 'ready', chunk_count: chunks.length,
      content: fullText, updated_at: new Date().toISOString(),
    }).eq('id', documentId);
    if (updateError) throw updateError;
    return { documentId, chunkCount: chunks.length };

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.from('kb_documents').update({
      status: 'error', error_message: message.slice(0, 500), updated_at: new Date().toISOString(),
    }).eq('id', documentId);
    throw err;
  } finally {
    releaseSlot();
  }
}

/** Process from already-clean Markdown text (after AI normalization). */
export async function processFromMarkdown(
  documentId: string, markdownText: string, title: string, categoryName: string,
): Promise<ProcessResult> {
  await acquireSlot();
  logger.info(`[kb/processor] slot acquired for ${documentId} (running: ${_running}, queued: ${_queue.length})`);
  const db = getServerDb();

  try {
    const setStage = async (stage: string) => {
      const { data } = await db.from('kb_documents').select('metadata').eq('id', documentId).single();
      const meta = (data as { metadata?: Record<string, unknown> } | null)?.metadata || {};
      await db.from('kb_documents').update({ metadata: { ...meta, processing_stage: stage } }).eq('id', documentId);
    };

    const docMeta = await loadDocMeta(db, documentId);

    await setStage('chunking');
    const chunks = chunkDocument(markdownText);
    if (chunks.length === 0) throw new Error('No chunks produced from normalized text');

    await setStage('prefix');
    let prefixes: string[];
    try {
      prefixes = await generateContextualPrefixes(
        title, markdownText, chunks.map(c => ({ heading: c.heading, content: c.content })),
      );
    } catch (prefixErr) {
      logger.warn(`[kb/processor] Contextual prefix generation failed, proceeding without: ${(prefixErr as Error).message}`);
      prefixes = chunks.map(() => '');
    }

    await setStage('embedding');
    await embedAndInsertChunks(db, documentId, chunks, prefixes, categoryName, title, docMeta);

    const { error: updateError } = await db.from('kb_documents').update({
      status: 'ready', chunk_count: chunks.length,
      content: markdownText, updated_at: new Date().toISOString(),
    }).eq('id', documentId);
    if (updateError) throw updateError;
    return { documentId, chunkCount: chunks.length };

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.from('kb_documents').update({
      status: 'error', error_message: message.slice(0, 500), updated_at: new Date().toISOString(),
    }).eq('id', documentId);
    throw err;
  } finally {
    releaseSlot();
  }
}
