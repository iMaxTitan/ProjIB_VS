/**
 * Import mobilization laws: fetch, insert, chunk + embed (NO contextual prefix).
 * Run: cd /opt/cs-dev && DOTENV_CONFIG_PATH=.env.local npx tsx --require dotenv/config scripts/import-mobilization-laws.ts
 */

import { chunkDocument, buildContextualContent } from '../src/lib/kb/chunker';
import { embedBatch } from '../src/lib/kb/embedder';
import { createPostgrestClient } from '../src/lib/shared/postgrest-client';
import { config } from '../src/lib/shared/config';

const FETCHER_URL = process.env.LAW_FETCHER_URL || 'http://localhost:3100';
const FETCHER_KEY = process.env.LAW_FETCHER_KEY || 'law-fetcher-internal-key';
const CATEGORY_ID = '9770629d-f8ce-487d-8ee5-537bdfa0ac69';
const USER_ID = '390773f1-cc3d-4ee7-842a-3e0eb82e7a8f';

const DOCS = [
  { url: 'https://zakon.rada.gov.ua/laws/show/3543-12', docType: 'Закон України', docNumber: '3543-XII',
    related: 'КМУ №76 (бронювання), КМУ №560 (призов), КМУ №1487 (військовий облік), КМУ №1608 (зміни до бронювання), Наказ МОУ №722 (критерії підприємств КІ)' },
  { url: 'https://zakon.rada.gov.ua/laws/show/76-2023-%D0%BF', docType: 'Постанова КМУ', docNumber: '76-2023-п',
    parent: 'Закон 3543-XII (Про мобілізаційну підготовку та мобілізацію)' },
  { url: 'https://zakon.rada.gov.ua/laws/show/560-2024-%D0%BF', docType: 'Постанова КМУ', docNumber: '560-2024-п',
    parent: 'Закон 3543-XII (Про мобілізаційну підготовку та мобілізацію)' },
  { url: 'https://zakon.rada.gov.ua/laws/show/1487-2022-%D0%BF', docType: 'Постанова КМУ', docNumber: '1487-2022-п',
    parent: 'Закон 3543-XII (Про мобілізаційну підготовку та мобілізацію)' },
  { url: 'https://zakon.rada.gov.ua/laws/show/1608-2025-%D0%BF', docType: 'Постанова КМУ', docNumber: '1608-2025-п',
    parent: 'Закон 3543-XII (Про мобілізаційну підготовку та мобілізацію)' },
  { url: 'https://zakon.rada.gov.ua/laws/show/z1582-25', docType: 'Наказ', docNumber: 'z1582-25',
    parent: 'Закон 3543-XII, КМУ №76 (бронювання)' },
];

function buildHeader(doc: typeof DOCS[0], date: string): string {
  const lines = [
    `> **Тип:** ${doc.docType}`,
    `> **Номер:** ${doc.docNumber}`,
    `> **Редакція:** актуальна станом на ${date}`,
    `> **Джерело:** ${doc.url.replace(/#.*$/, '')}`,
  ];
  if ('parent' in doc && doc.parent) lines.push(`> **На виконання:** ${doc.parent}`);
  if ('related' in doc && doc.related) lines.push(`> **Пов'язані акти:** ${doc.related}`);
  return lines.join('\n');
}

const EMBED_BATCH = 20;

async function main() {
  console.log('DB URL:', config.db.serverUrl ? 'OK' : 'MISSING!');
  if (!config.db.serverUrl) { console.error('POSTGREST_URL not set'); process.exit(1); }

  const db = createPostgrestClient(config.db.serverUrl, config.db.serviceRoleKey, { auth: { persistSession: false } });
  const date = new Date().toISOString().split('T')[0];

  // Delete previously stuck processing records from this script
  const { data: stuck } = await db.from('kb_documents').select('id').eq('status', 'processing').not('metadata->fetched_at', 'is', null);
  if (stuck && Array.isArray(stuck) && stuck.length > 0) {
    const ids = stuck.map((d: { id: string }) => d.id);
    console.log(`Cleaning ${ids.length} stuck processing records...`);
    for (const id of ids) {
      await db.from('kb_chunks').delete().eq('document_id', id);
      await db.from('kb_documents').delete().eq('id', id);
    }
  }

  for (const doc of DOCS) {
    console.log(`\n=== ${doc.docNumber} ===`);

    // 1. Fetch
    console.log('  Fetching...');
    const fRes = await fetch(`${FETCHER_URL}/fetch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Service-Key': FETCHER_KEY },
      body: JSON.stringify({ url: doc.url }),
    });
    if (!fRes.ok) { console.log('  FETCH FAIL:', fRes.status); continue; }
    const fetched = await fRes.json() as { title: string; markdown: string; charCount: number };
    console.log(`  ${fetched.charCount} chars`);

    // 2. Add header
    let md = fetched.markdown;
    const header = buildHeader(doc, date);
    const m = md.match(/^# .+/);
    if (m) md = md.replace(/^# .+/, `${m[0]}\n\n${header}`);
    else md = `# ${fetched.title}\n\n${header}\n\n${md}`;

    // 3. Insert doc
    console.log('  Inserting...');
    const { data: ins, error: insErr } = await db.from('kb_documents').insert({
      title: fetched.title,
      source_filename: `${doc.docNumber.replace(/\//g, '-')}.md`,
      mime_type: 'text/markdown',
      category_id: CATEGORY_ID,
      created_by: USER_ID,
      status: 'processing',
      content: md.slice(0, 100_000),
      metadata: { doc_type: doc.docType, doc_number: doc.docNumber, source_url: doc.url.replace(/#.*$/, ''), related_docs: [], fetched_at: date },
    }).selectAfterMutate('id');

    if (insErr || !ins || !Array.isArray(ins) || ins.length === 0) {
      console.log('  INSERT FAIL:', insErr); continue;
    }
    const docId = (ins[0] as { id: string }).id;
    console.log(`  id: ${docId}`);

    // 4. Chunk
    const chunks = chunkDocument(md);
    console.log(`  ${chunks.length} chunks`);

    // 5. Embed + insert chunks (no contextual prefix)
    console.log('  Embedding...');
    const catName = 'Юридичний';
    const texts = chunks.map(c => buildContextualContent(null, catName, fetched.title, c.heading, c.content));

    for (let i = 0; i < texts.length; i += EMBED_BATCH) {
      const batch = texts.slice(i, i + EMBED_BATCH);
      const batchChunks = chunks.slice(i, i + EMBED_BATCH);
      const embeddings = await embedBatch(batch);

      const rows = batchChunks.map((c, j) => ({
        document_id: docId,
        chunk_index: i + j,
        heading: c.heading || null,
        content: c.content,
        token_count: c.tokenCount,
        contextual_prefix: null,
        embedding: JSON.stringify(embeddings[j]),
      }));

      const { error: chunkErr } = await db.from('kb_chunks').insert(rows);
      if (chunkErr) { console.log(`  CHUNK INSERT FAIL batch ${i}:`, chunkErr); }
      else { process.stdout.write(`  batch ${i}-${i + batch.length}/${texts.length} ✓\n`); }
    }

    // 6. Update doc status
    await db.from('kb_documents').update({ status: 'ready', chunk_count: chunks.length, updated_at: new Date().toISOString() }).eq('id', docId);
    console.log(`  ✓ Done`);
  }

  console.log('\n=== All done ===');
}

main().catch(e => { console.error(e); process.exit(1); });
