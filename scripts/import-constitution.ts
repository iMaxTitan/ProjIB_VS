/**
 * Import Constitution of Ukraine.
 * Run: cd /opt/cs-dev && DOTENV_CONFIG_PATH=.env.local npx tsx --require dotenv/config scripts/import-constitution.ts
 */

import { chunkDocument, buildContextualContent } from '../src/lib/kb/chunker';
import { embedBatch } from '../src/lib/kb/embedder';
import { createPostgrestClient } from '../src/lib/shared/postgrest-client';
import { config } from '../src/lib/shared/config';

const FETCHER_URL = process.env.LAW_FETCHER_URL || 'http://localhost:3100';
const FETCHER_KEY = process.env.LAW_FETCHER_KEY || 'law-fetcher-internal-key';
const CATEGORY_ID = '9770629d-f8ce-487d-8ee5-537bdfa0ac69';
const USER_ID = '390773f1-cc3d-4ee7-842a-3e0eb82e7a8f';
const EMBED_BATCH = 20;

async function main() {
  if (!config.db.serverUrl) { console.error('POSTGREST_URL not set'); process.exit(1); }
  const db = createPostgrestClient(config.db.serverUrl, config.db.serviceRoleKey, { auth: { persistSession: false } });
  const date = new Date().toISOString().split('T')[0];

  console.log('Fetching Конституція...');
  const res = await fetch(`${FETCHER_URL}/fetch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Service-Key': FETCHER_KEY },
    body: JSON.stringify({ url: 'https://zakon.rada.gov.ua/laws/show/254%D0%BA/96-%D0%B2%D1%80' }),
  });
  const fetched = await res.json() as { title: string; markdown: string; charCount: number };
  console.log(`${fetched.charCount} chars`);

  let md = fetched.markdown;
  const header = [
    '> **Тип:** Конституція України',
    '> **Номер:** 254к/96-ВР від 28.06.1996',
    `> **Редакція:** актуальна станом на ${date}`,
    '> **Джерело:** https://zakon.rada.gov.ua/laws/show/254к/96-вр',
  ].join('\n');
  const m = md.match(/^# .+/);
  if (m) md = md.replace(/^# .+/, `${m[0]}\n\n${header}`);

  console.log('Inserting...');
  const { data: ins, error: insErr } = await db.from('kb_documents').insert({
    title: 'Конституція України',
    source_filename: 'constitution-254k-96-vr.md',
    mime_type: 'text/markdown', category_id: CATEGORY_ID, created_by: USER_ID,
    status: 'processing', content: md.slice(0, 100_000),
    metadata: { doc_type: 'Конституція', doc_number: '254к/96-ВР', source_url: 'https://zakon.rada.gov.ua/laws/show/254к/96-вр', related_docs: [], fetched_at: date },
  }).selectAfterMutate('id');

  if (insErr || !ins || !Array.isArray(ins)) { console.error('INSERT FAIL:', insErr); return; }
  const docId = (ins[0] as { id: string }).id;
  console.log(`id: ${docId}`);

  const chunks = chunkDocument(md);
  console.log(`${chunks.length} chunks`);

  console.log('Embedding...');
  const texts = chunks.map(c => buildContextualContent(null, 'Юридичний', 'Конституція України', c.heading, c.content));
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const batch = texts.slice(i, i + EMBED_BATCH);
    const batchChunks = chunks.slice(i, i + EMBED_BATCH);
    const embeddings = await embedBatch(batch);
    const rows = batchChunks.map((c, j) => ({
      document_id: docId, chunk_index: i + j, heading: c.heading || null,
      content: c.content, token_count: c.tokenCount, contextual_prefix: null,
      embedding: JSON.stringify(embeddings[j]),
    }));
    const { error } = await db.from('kb_chunks').insert(rows);
    if (error) console.log(`CHUNK FAIL batch ${i}:`, error);
    else process.stdout.write(`  ${i + batch.length}/${texts.length}\n`);
  }

  await db.from('kb_documents').update({ status: 'ready', chunk_count: chunks.length, updated_at: new Date().toISOString() }).eq('id', docId);
  console.log('✓ Done');
}

main().catch(e => { console.error(e); process.exit(1); });
