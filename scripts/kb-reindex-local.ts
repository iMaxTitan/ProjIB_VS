/**
 * Local reindex script — runs on dev machine with full CPU power.
 *
 * Modes:
 *   npx tsx scripts/kb-reindex-local.ts              — re-embed only (existing chunks)
 *   npx tsx scripts/kb-reindex-local.ts --rechunk     — DELETE chunks, re-chunk, re-prefix, re-embed
 */
import dotenv from 'dotenv';
dotenv.config({ override: true });
import { createClient } from '../src/lib/shared/postgrest-client';
import { chunkDocument, buildContextualContent } from '../src/lib/kb/chunker';

const SUPABASE_URL = process.env.NEXT_PUBLIC_API_URL!;
const SUPABASE_KEY = process.env.POSTGREST_SERVICE_KEY!;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY!;
const VOYAGE_KEY = process.env.VOYAGE_API_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY || !ANTHROPIC_KEY || !VOYAGE_KEY) {
  console.error('Missing env vars. Need: NEXT_PUBLIC_API_URL, POSTGREST_SERVICE_KEY, ANTHROPIC_API_KEY, VOYAGE_API_KEY');
  process.exit(1);
}

const RECHUNK = process.argv.includes('--rechunk');
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ---- Haiku prefix generation ----

const CONTEXT_PROMPT =
  'Ти отримуєш фрагмент корпоративного документа та загальний опис документа.\n' +
  'Напиши короткий контекст (2-3 речення, максимум 80 слів) для цього фрагменту:\n' +
  '- Про що цей фрагмент і до якої теми він відноситься\n' +
  '- Яке правило/процедуру/заборону він описує (якщо є)\n' +
  '- До якої КАТЕГОРІЇ предметів/систем/процесів він стосується\n' +
  'Пиши ТІЛЬКИ контекст, без вступних слів.';

async function generatePrefix(
  docTitle: string, docSummary: string, heading: string, content: string,
): Promise<string> {
  const userMsg = `Документ: "${docTitle}"\nРозділ: ${heading || '(без заголовка)'}\n\nЗагальний опис документа (перші ~6000 символів):\n${docSummary}\n\n---\nФрагмент:\n${content.slice(0, 2000)}`;

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      temperature: 0,
      system: CONTEXT_PROMPT,
      messages: [{ role: 'user', content: userMsg }],
    }),
  });

  if (!resp.ok) {
    if (resp.status === 429) {
      const retryAfter = Number(resp.headers.get('retry-after') || '30');
      console.log(`\n    Rate limited, waiting ${retryAfter}s...`);
      await new Promise(r => setTimeout(r, retryAfter * 1000));
      return generatePrefix(docTitle, docSummary, heading, content);
    }
    const err = await resp.text();
    throw new Error(`Anthropic ${resp.status}: ${err.slice(0, 200)}`);
  }

  const data = await resp.json();
  return (data.content?.[0]?.text || '').trim();
}

// ---- Voyage embedding ----

async function embedBatchVoyage(texts: string[]): Promise<number[][]> {
  const resp = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${VOYAGE_KEY}`,
    },
    body: JSON.stringify({
      model: 'voyage-4-large',
      input: texts,
      input_type: 'document',
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Voyage ${resp.status}: ${err.slice(0, 200)}`);
  }

  const data = await resp.json();
  return data.data.map((d: { embedding: number[] }) => d.embedding);
}

// ---- Rechunk a single document ----

async function rechunkDocument(
  doc: { id: string; title: string; content: string; category_id: string },
  categoryName: string,
): Promise<{ chunksCreated: number; prefixesGenerated: number }> {
  const docText = doc.content || '';

  // 1. Chunk with new parameters (imported from chunker.ts)
  const newChunks = chunkDocument(docText);

  if (!newChunks.length) {
    console.log(` no chunks generated, skipping`);
    return { chunksCreated: 0, prefixesGenerated: 0 };
  }

  // 2. Delete old chunks
  const { error: deleteError } = await db
    .from('kb_chunks')
    .delete()
    .eq('document_id', doc.id);

  if (deleteError) throw new Error(`delete chunks: ${deleteError.message}`);

  // 3. Generate contextual prefixes for ALL new chunks
  const prefixes: string[] = [];
  for (let i = 0; i < newChunks.length; i++) {
    try {
      const prefix = await generatePrefix(
        doc.title, docText.slice(0, 6000), newChunks[i].heading, newChunks[i].content,
      );
      prefixes.push(prefix);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`\n    prefix error chunk ${i}: ${msg}`);
      prefixes.push('');
    }
    if (i < newChunks.length - 1) await new Promise(r => setTimeout(r, 200));
  }

  // 4. Build contextual content and embed
  const contextualContents = newChunks.map((chunk, i) =>
    buildContextualContent(categoryName, doc.title, chunk.heading, chunk.content, prefixes[i] || undefined)
  );

  const BATCH = 100;
  const allEmbeddings: number[][] = [];
  for (let i = 0; i < contextualContents.length; i += BATCH) {
    const batch = contextualContents.slice(i, i + BATCH);
    const embeddings = await embedBatchVoyage(batch);
    allEmbeddings.push(...embeddings);
  }

  // 5. Insert new chunks
  const DB_BATCH = 50;
  for (let i = 0; i < newChunks.length; i += DB_BATCH) {
    const batch = newChunks.slice(i, i + DB_BATCH).map((chunk, j) => ({
      document_id: doc.id,
      chunk_index: chunk.chunkIndex,
      content: chunk.content,
      heading: chunk.heading || null,
      token_count: chunk.tokenCount,
      contextual_prefix: prefixes[i + j] || null,
      embedding: JSON.stringify(allEmbeddings[i + j]),
    }));

    const { error: insertError } = await db.from('kb_chunks').insert(batch);
    if (insertError) throw new Error(`insert chunks: ${insertError.message}`);
  }

  // 6. Update document chunk_count
  await db.from('kb_documents').update({ chunk_count: newChunks.length }).eq('id', doc.id);

  return { chunksCreated: newChunks.length, prefixesGenerated: prefixes.filter(Boolean).length };
}

// ---- Re-embed existing chunks (original mode) ----

async function reembedDocument(
  doc: { id: string; title: string; content: string; category_id: string },
  categoryName: string,
): Promise<{ chunksProcessed: number; newPrefixes: number }> {
  const { data: chunks, error: chunkError } = await db
    .from('kb_chunks')
    .select('id, chunk_index, content, heading, token_count, contextual_prefix')
    .eq('document_id', doc.id)
    .order('chunk_index');

  if (chunkError || !chunks?.length) {
    throw new Error(chunkError?.message || 'no chunks');
  }

  const docText = doc.content || '';
  let newPrefixes = 0;

  const prefixes: string[] = [];
  for (const chunk of chunks) {
    if (chunk.contextual_prefix) {
      prefixes.push(chunk.contextual_prefix);
    } else {
      try {
        const prefix = await generatePrefix(
          doc.title, docText.slice(0, 6000), chunk.heading || '', chunk.content,
        );
        prefixes.push(prefix);
        if (prefix) newPrefixes++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`\n    prefix error: ${msg}`);
        prefixes.push('');
      }
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  const BATCH = 100;
  for (let i = 0; i < chunks.length; i += BATCH) {
    const batchChunks = chunks.slice(i, i + BATCH);
    const batchPrefixes = prefixes.slice(i, i + BATCH);
    const contextualContents = batchChunks.map((chunk, j) =>
      buildContextualContent(categoryName, doc.title, chunk.heading || '', chunk.content, batchPrefixes[j] || undefined)
    );
    const embeddings = await embedBatchVoyage(contextualContents);

    for (let j = 0; j < batchChunks.length; j++) {
      const { error: updateError } = await db
        .from('kb_chunks')
        .update({
          embedding: JSON.stringify(embeddings[j]),
          contextual_prefix: batchPrefixes[j] || null,
        })
        .eq('id', batchChunks[j].id);

      if (updateError) throw new Error(`update ${batchChunks[j].id}: ${updateError.message}`);
    }
  }

  return { chunksProcessed: chunks.length, newPrefixes };
}

// ---- Main ----

async function main() {
  const { data: documents, error: docError } = await db
    .from('kb_documents')
    .select('id, title, content, category_id')
    .eq('status', 'ready')
    .order('title') as { data: Array<{ id: string; title: string; content: string; category_id: string }> | null; error: any };

  if (docError || !documents?.length) {
    console.error('Doc fetch error:', docError?.message || 'no documents');
    process.exit(1);
  }

  const { data: categories } = await db.from('kb_categories').select('id, name');
  const catMap = new Map((categories ?? []).map(c => [c.id, c.name]));

  const mode = RECHUNK ? 'RECHUNK + RE-EMBED' : 'RE-EMBED only';
  console.log(`\n  Reindex [${mode}] ${documents.length} documents\n`);

  let totalChunks = 0;
  let totalPrefixes = 0;
  const errors: string[] = [];

  for (const doc of documents) {
    const categoryName = catMap.get(doc.category_id) || '';
    process.stdout.write(`  ${doc.title}...`);

    try {
      if (RECHUNK) {
        const result = await rechunkDocument(doc, categoryName);
        totalChunks += result.chunksCreated;
        totalPrefixes += result.prefixesGenerated;
        console.log(` ${result.chunksCreated} chunks, ${result.prefixesGenerated} prefixes`);
      } else {
        const result = await reembedDocument(doc, categoryName);
        totalChunks += result.chunksProcessed;
        totalPrefixes += result.newPrefixes;
        console.log(` ${result.chunksProcessed} chunks, +${result.newPrefixes} new prefixes`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${doc.title}: ${msg}`);
      console.log(` ERROR: ${msg}`);
    }
  }

  console.log(`\n${'='.repeat(36)}`);
  console.log(`  Mode: ${mode}`);
  console.log(`  Documents: ${documents.length}`);
  console.log(`  Total chunks: ${totalChunks}`);
  console.log(`  Prefixes: ${totalPrefixes}`);
  console.log(`  Errors: ${errors.length}`);
  if (errors.length > 0) {
    for (const e of errors.slice(0, 10)) console.log(`    - ${e}`);
    if (errors.length > 10) console.log(`    ... and ${errors.length - 10} more`);
  }
  console.log(`${'='.repeat(36)}\n`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
