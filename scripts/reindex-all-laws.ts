/**
 * Re-import all law documents via data.rada.gov.ua API.
 * Replaces Playwright-scraped content with clean API text.
 * Run: cd /opt/cs-dev && DOTENV_CONFIG_PATH=.env.local npx tsx --require dotenv/config scripts/reindex-all-laws.ts
 */

import { chunkDocument, buildContextualContent } from '../src/lib/kb/chunker';
import { embedBatch } from '../src/lib/kb/embedder';
import { createPostgrestClient } from '../src/lib/shared/postgrest-client';
import { config } from '../src/lib/shared/config';

const EMBED_BATCH = 20;
const DELAY_MS = 2000;

function extractNreg(url: string): string | null {
  const match = url.match(/\/laws\/show\/([^#?]+)/);
  return match ? decodeURIComponent(match[1]).replace(/\/$/, '') : null;
}

function buildHeader(meta: { doc_type: string; doc_number: string; source_url: string; related_docs?: string[]; fetched_at?: string; parent_doc_id?: string | null }, related?: string): string {
  const date = new Date().toISOString().split('T')[0];
  const lines = [
    `> **Тип:** ${meta.doc_type}`,
    `> **Номер:** ${meta.doc_number}`,
    `> **Редакція:** актуальна станом на ${date}`,
    `> **Джерело:** ${meta.source_url}`,
  ];
  if (related) lines.push(`> **Пов'язані акти:** ${related}`);
  return lines.join('\n');
}

function postProcessTxt(rawText: string, title: string): string {
  let md = rawText.trim();

  md = md.replace(/(^|\n)(Глава\s+[IVXLC\d]+[-\d]*)\s*[\.\-]\s*([^\n]+)/gm,
    (_, pre, chapter, name) => `${pre}\n## ${chapter}. ${name.trim()}\n`);
  md = md.replace(/(^|\n)(Розділ\s+[IVXLC\d]+[-\d]*)\s*[\.\-]\s*([^\n]+)/gm,
    (_, pre, section, name) => `${pre}\n## ${section}. ${name.trim()}\n`);
  md = md.replace(/(^|\n)(Розділ\s+[IVXLC\d]+[-\d]*)\s*\n\s*([А-ЯІЇЄҐ][А-ЯІЇЄҐ\s,'-]+)/g,
    (_, pre, section, name) => `${pre}\n## ${section}. ${name.trim()}\n`);
  md = md.replace(/(^|\n)(Частина\s+[IVXLC\d]+[-\d]*)\s*[\.\-]\s*([^\n]+)/gm,
    (_, pre, part, name) => `${pre}\n## ${part}. ${name.trim()}\n`);
  md = md.replace(/(^|\n)(Преамбула)\s*\n/g, '$1\n## $2\n\n');
  md = md.replace(/(^|\n)(Стаття\s+\d+[-\d]*[\.\s])/g, '$1\n### $2');
  md = md.replace(/\n##\s*\n/g, '\n');
  md = md.replace(/\n###\s*\n/g, '\n');
  md = md.replace(/\n{3,}/g, '\n\n');
  md = md.replace(/[ \t]+$/gm, '');
  md = md.trim();

  if (title) md = `# ${title}\n\n${md}`;
  return md;
}

async function main() {
  if (!config.db.serverUrl) { console.error('POSTGREST_URL not set'); process.exit(1); }
  const db = createPostgrestClient(config.db.serverUrl, config.db.serviceRoleKey, { auth: { persistSession: false } });

  // Get all law documents
  const { data: docs } = await db
    .from('kb_documents')
    .select('id, title, metadata, category_id')
    .not('metadata->doc_type', 'is', null)
    .order('created_at');

  if (!docs || !Array.isArray(docs) || docs.length === 0) {
    console.log('No law documents found.'); return;
  }

  console.log(`Found ${docs.length} law documents to re-import.\n`);

  const catMap = new Map<string, string>();
  const { data: cats } = await db.from('kb_categories').select('id, name');
  if (cats) for (const c of cats as { id: string; name: string }[]) catMap.set(c.id, c.name);

  let ok = 0, fail = 0;

  for (const doc of docs as { id: string; title: string; metadata: Record<string, unknown>; category_id: string }[]) {
    const meta = doc.metadata as { doc_type: string; doc_number: string; source_url: string; related_docs?: string[]; fetched_at?: string };
    const nreg = extractNreg(meta.source_url || '');
    if (!nreg) { console.log(`SKIP ${doc.title} — no nreg`); fail++; continue; }

    console.log(`=== ${meta.doc_number} (${nreg}) ===`);

    // 1. Fetch via API (nreg may contain Cyrillic or slashes — don't encode)
    const [cardRes, textRes] = await Promise.all([
      fetch(`https://data.rada.gov.ua/laws/card/${nreg}.json`, { headers: { 'User-Agent': 'OpenData' } }),
      fetch(`https://data.rada.gov.ua/laws/show/${nreg}.txt`, { headers: { 'User-Agent': 'OpenData' } }),
    ]);

    if (!cardRes.ok || !textRes.ok) {
      console.log(`  API FAIL: card=${cardRes.status} txt=${textRes.status}`);
      fail++; continue;
    }

    const card = await cardRes.json() as { nazva?: string; datred?: number };
    const rawText = await textRes.text();
    if (!rawText || rawText.trim().length < 100) {
      console.log(`  TEXT TOO SHORT: ${rawText.length}`);
      fail++; continue;
    }

    const title = card.nazva || doc.title;
    let md = postProcessTxt(rawText, title);

    // Add metadata header
    const header = buildHeader(meta);
    const titleMatch = md.match(/^# .+/);
    if (titleMatch) {
      md = md.replace(/^# .+/, `${titleMatch[0]}\n\n${header}`);
    }

    console.log(`  Fetched: ${md.length} chars`);

    // 2. Delete old chunks
    await db.from('kb_chunks').delete().eq('document_id', doc.id);

    // 3. Chunk
    const chunks = chunkDocument(md);
    console.log(`  ${chunks.length} chunks`);

    // 4. Embed + insert
    const catName = catMap.get(doc.category_id) || 'Юридичний';
    const texts = chunks.map(c => buildContextualContent(null, catName, title, c.heading, c.content));

    for (let i = 0; i < texts.length; i += EMBED_BATCH) {
      const batch = texts.slice(i, i + EMBED_BATCH);
      const batchChunks = chunks.slice(i, i + EMBED_BATCH);
      const embeddings = await embedBatch(batch);
      const rows = batchChunks.map((c, j) => ({
        document_id: doc.id, chunk_index: i + j, heading: c.heading || null,
        content: c.content, token_count: c.tokenCount, contextual_prefix: null,
        embedding: JSON.stringify(embeddings[j]),
      }));
      const { error } = await db.from('kb_chunks').insert(rows);
      if (error) { console.log(`  CHUNK FAIL batch ${i}:`, error); break; }
    }

    // 5. Update document
    const datred = card.datred ? String(card.datred) : null;
    const fetchedAt = new Date().toISOString().split('T')[0];
    await db.from('kb_documents').update({
      title,
      content: md.slice(0, 200_000),
      chunk_count: chunks.length,
      status: 'ready',
      metadata: { ...meta, fetched_at: fetchedAt, datred },
      updated_at: new Date().toISOString(),
    }).eq('id', doc.id);

    console.log(`  ✓ Done`);
    ok++;

    // Delay between documents
    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  console.log(`\n=== All done: ${ok} ok, ${fail} failed ===`);
}

main().catch(e => { console.error(e); process.exit(1); });
