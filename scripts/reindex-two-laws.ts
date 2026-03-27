/**
 * Re-import 2 laws with slash in nreg (80/94-вр, 254к/96-вр).
 * Run: cd /opt/cs-dev && DOTENV_CONFIG_PATH=.env.local npx tsx --require dotenv/config scripts/reindex-two-laws.ts
 */

import { chunkDocument, buildContextualContent } from '../src/lib/kb/chunker';
import { embedBatch } from '../src/lib/kb/embedder';
import { createPostgrestClient } from '../src/lib/shared/postgrest-client';
import { config } from '../src/lib/shared/config';

const EMBED_BATCH = 20;

const DOCS = [
  { id: '68154c7c-bcb3-421f-9bc4-8555ef815e13', nreg: '80/94-%D0%B2%D1%80', docNumber: '80/94-ВР' },
  { id: '00c2d9fe-ed91-4635-b0fd-4702bb63eee9', nreg: '254%D0%BA/96-%D0%B2%D1%80', docNumber: '254к/96-ВР' },
];

function postProcessTxt(rawText: string, title: string): string {
  let md = rawText.trim();
  md = md.replace(/(^|\n)(Глава\s+[IVXLC\d]+[-\d]*)\s*[\.\-]\s*([^\n]+)/gm, (_, pre, ch, n) => `${pre}\n## ${ch}. ${n.trim()}\n`);
  md = md.replace(/(^|\n)(Розділ\s+[IVXLC\d]+[-\d]*)\s*[\.\-]\s*([^\n]+)/gm, (_, pre, s, n) => `${pre}\n## ${s}. ${n.trim()}\n`);
  md = md.replace(/(^|\n)(Розділ\s+[IVXLC\d]+[-\d]*)\s*\n\s*([А-ЯІЇЄҐ][А-ЯІЇЄҐ\s,'-]+)/g, (_, pre, s, n) => `${pre}\n## ${s}. ${n.trim()}\n`);
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

  for (const doc of DOCS) {
    console.log(`\n=== ${doc.docNumber} ===`);

    const [cardRes, textRes] = await Promise.all([
      fetch(`https://data.rada.gov.ua/laws/card/${doc.nreg}.json`, { headers: { 'User-Agent': 'OpenData' } }),
      fetch(`https://data.rada.gov.ua/laws/show/${doc.nreg}.txt`, { headers: { 'User-Agent': 'OpenData' } }),
    ]);

    if (!cardRes.ok || !textRes.ok) { console.log(`  FAIL: ${cardRes.status} ${textRes.status}`); continue; }

    const card = await cardRes.json() as { nazva?: string; datred?: number };
    const rawText = await textRes.text();
    const title = card.nazva || doc.docNumber;
    const md = postProcessTxt(rawText, title);
    console.log(`  ${md.length} chars`);

    await db.from('kb_chunks').delete().eq('document_id', doc.id);

    const chunks = chunkDocument(md);
    console.log(`  ${chunks.length} chunks`);

    const texts = chunks.map(c => buildContextualContent(null, 'Юридичний', title, c.heading, c.content));
    for (let i = 0; i < texts.length; i += EMBED_BATCH) {
      const batch = texts.slice(i, i + EMBED_BATCH);
      const batchChunks = chunks.slice(i, i + EMBED_BATCH);
      const embeddings = await embedBatch(batch);
      const rows = batchChunks.map((c, j) => ({
        document_id: doc.id, chunk_index: i + j, heading: c.heading || null,
        content: c.content, token_count: c.tokenCount, contextual_prefix: null,
        embedding: JSON.stringify(embeddings[j]),
      }));
      await db.from('kb_chunks').insert(rows);
    }

    const fetchedAt = new Date().toISOString().split('T')[0];
    await db.from('kb_documents').update({
      title, content: md.slice(0, 200_000), chunk_count: chunks.length, status: 'ready',
      updated_at: new Date().toISOString(),
    }).eq('id', doc.id);

    console.log(`  ✓ Done`);
  }
  console.log('\n=== All done ===');
}

main().catch(e => { console.error(e); process.exit(1); });
