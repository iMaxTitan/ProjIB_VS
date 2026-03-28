/**
 * Re-import all law documents via data.rada.gov.ua API.
 * Uses the SAME processing pipeline as the web interface (processFromMarkdown).
 *
 * Pipeline per document:
 *   1. Fetch fresh text from data.rada.gov.ua API
 *   2. Post-process to markdown (headings, structure)
 *   3. Fix doc_type by document number suffix (-п, -р, etc.)
 *   4. Call processFromMarkdown() → chunking → AI prefixes → embedding → DB
 *
 * Run (on dev VPS):
 *   cd /opt/cs-dev && DOTENV_CONFIG_PATH=.env.local npx tsx --require dotenv/config scripts/reindex-all-laws.ts
 *
 * Run (local with SSH tunnel):
 *   npx tsx scripts/reindex-all-laws.ts
 */

import './eval-env';
import { processFromMarkdown } from '../src/lib/kb/processor';
import { fetchLaw } from '../src/lib/ops/laws/fetcher-client';
import { createPostgrestClient } from '../src/lib/shared/postgrest-client';
import { config } from '../src/lib/shared/config';

const DELAY_BETWEEN_DOCS_MS = 3000;

/** Skip huge documents that would take too long / cost too much for prefix generation. */
const SKIP_DOC_NUMBERS = new Set([
  '2755-17',   // Податковий кодекс (~3099 chunks, ~$5 just for prefixes)
]);

/** Fix known metadata issues before processing. */
const METADATA_FIXES: Record<string, Partial<{ doc_type: string; parent_doc_id: string | null }>> = {
  '994_575':  { doc_type: 'Конвенція' },                // was "Закон України"
  '2163-19':  { doc_type: 'Закон України' },             // was "Закон" (incomplete)
  '64-2026-п': { parent_doc_id: null },                  // parent 1e31607f... doesn't exist
};

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Detect document type by number suffix: -п = Постанова, -р = Розпорядження, etc. */
function detectDocType(docNumber: string, currentType: string): string {
  if (!docNumber) return currentType;
  const num = docNumber.toLowerCase().trim();
  if (num.endsWith('-п') || num.includes('-п/')) return 'Постанова КМУ';
  if (num.endsWith('-р') || num.includes('-р/')) return 'Розпорядження КМУ';
  if (/^\d+-[IVXLC]+$/.test(num)) return 'Закон України';
  if (/[IVXLC]{2,}/.test(num)) return 'Закон України';
  return currentType;
}

function buildHeader(meta: {
  doc_type: string; doc_number: string; source_url: string;
  related_docs?: string[]; parent_doc_id?: string | null;
}): string {
  const date = new Date().toISOString().split('T')[0];
  return [
    `> **Тип:** ${meta.doc_type}`,
    `> **Номер:** ${meta.doc_number}`,
    `> **Редакція:** актуальна станом на ${date}`,
    `> **Джерело:** ${meta.source_url}`,
  ].join('\n');
}

// No postProcessTxt needed — law-fetcher returns clean markdown with headings

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  if (!config.db.serverUrl) {
    console.error('POSTGREST_URL not set. Use eval-env.ts or set env vars.');
    process.exit(1);
  }

  const db = createPostgrestClient(config.db.serverUrl, config.db.serviceRoleKey, {
    auth: { persistSession: false },
  });

  // Load law documents (those with metadata.doc_type)
  const { data: docs } = await db
    .from('kb_documents')
    .select('id, title, metadata, category_id')
    .not('metadata->doc_type', 'is', null)
    .order('created_at');

  if (!docs || !Array.isArray(docs) || docs.length === 0) {
    console.log('No law documents found.');
    return;
  }

  // Load category names
  const catMap = new Map<string, string>();
  const { data: cats } = await db.from('kb_categories').select('id, name');
  if (cats) for (const c of cats as { id: string; name: string }[]) catMap.set(c.id, c.name);

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  Reindex ${docs.length} law documents`);
  console.log(`  Pipeline: fetch → markdown → chunk → AI prefix → embed → DB`);
  console.log(`${'═'.repeat(60)}\n`);

  let ok = 0;
  let fail = 0;

  for (const doc of docs as Array<{ id: string; title: string; metadata: Record<string, unknown>; category_id: string }>) {
    const meta = doc.metadata as {
      doc_type: string; doc_number: string; source_url: string;
      related_docs?: string[]; parent_doc_id?: string | null;
    };
    if (!meta.source_url) {
      console.log(`  SKIP ${doc.title} — no source_url`);
      fail++;
      continue;
    }
    if (SKIP_DOC_NUMBERS.has(meta.doc_number)) {
      console.log(`  SKIP ${doc.title} — in skip list (too large)`);
      continue;
    }

    console.log(`\n── [${ok + fail + 1}/${docs.length}] ${meta.doc_number} ──`);

    try {
      // 1. Fetch via law-fetcher microservice (same as web interface)
      const fetched = await fetchLaw(meta.source_url);
      if (!fetched.markdown || fetched.charCount < 100) {
        console.log(`  ✗ Text too short: ${fetched.charCount} chars`);
        fail++;
        continue;
      }

      // 2. Fix doc_type by number suffix + known metadata fixes
      let fixedDocType = detectDocType(meta.doc_number, meta.doc_type);
      const knownFix = METADATA_FIXES[meta.doc_number];
      if (knownFix?.doc_type) fixedDocType = knownFix.doc_type;
      if (fixedDocType !== meta.doc_type) {
        console.log(`  ⚡ doc_type fix: "${meta.doc_type}" → "${fixedDocType}"`);
      }
      // Fix broken parent_doc_id
      if (knownFix && 'parent_doc_id' in knownFix) {
        console.log(`  ⚡ parent fix: "${meta.parent_doc_id}" → "${knownFix.parent_doc_id}"`);
        meta.parent_doc_id = knownFix.parent_doc_id;
      }

      // 3. Build markdown with metadata header
      const title = fetched.title || doc.title;
      const updatedMeta = { ...meta, doc_type: fixedDocType };
      const header = buildHeader(updatedMeta);
      let md = fetched.markdown;
      const titleMatch = md.match(/^# .+/);
      if (titleMatch) {
        md = md.replace(/^# .+/, `${titleMatch[0]}\n\n${header}`);
      } else {
        md = `# ${title}\n\n${header}\n\n${md}`;
      }

      console.log(`  Fetched: ${md.length} chars, title: ${title.slice(0, 60)}...`);

      // 4. Update document metadata (doc_type fix + fresh date)
      const fetchedAt = new Date().toISOString().split('T')[0];
      await db.from('kb_documents').update({
        title,
        status: 'processing',
        metadata: { ...updatedMeta, fetched_at: fetchedAt },
        updated_at: new Date().toISOString(),
      }).eq('id', doc.id);

      // 5. Process through the SAME pipeline as web interface
      //    chunking → AI prefixes → embedding → DB insert
      const catName = catMap.get(doc.category_id) || 'Юридичний';
      const result = await processFromMarkdown(doc.id, md, title, catName);

      console.log(`  ✓ ${result.chunkCount} chunks (with AI prefixes + embeddings)`);
      ok++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ✗ Error: ${msg.slice(0, 200)}`);
      fail++;
    }

    // Delay between documents to avoid rate limits
    if (ok + fail < docs.length) {
      await new Promise(r => setTimeout(r, DELAY_BETWEEN_DOCS_MS));
    }
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  Done: ${ok} ok, ${fail} failed`);
  console.log(`${'═'.repeat(60)}\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
