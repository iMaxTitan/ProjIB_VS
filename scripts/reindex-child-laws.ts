/**
 * Re-index ONLY child law documents (those with parent_doc_id).
 * Adds "На виконання: ..." header with full parent chain for RAG context.
 *
 * Pipeline per document:
 *   1. Fetch fresh text from data.rada.gov.ua API
 *   2. Build parent chain label (walks up parent_doc_id)
 *   3. Inject "На виконання: ..." into markdown header
 *   4. processFromMarkdown() → chunking → AI prefixes → embedding → DB
 *
 * Run (on dev VPS):
 *   cd /opt/cs-dev && DOTENV_CONFIG_PATH=.env.local npx tsx --require dotenv/config scripts/reindex-child-laws.ts
 */

import './eval-env';
import { processFromMarkdown } from '../src/lib/kb/processor';
import { fetchLaw } from '../src/lib/ops/laws/fetcher-client';
import { createPostgrestClient } from '../src/lib/shared/postgrest-client';
import { config } from '../src/lib/shared/config';

const DELAY_BETWEEN_DOCS_MS = 3000;

interface DocRow {
  id: string;
  title: string;
  metadata: {
    doc_type: string;
    doc_number: string;
    source_url: string;
    parent_doc_id?: string | null;
    related_docs?: string[];
    fetched_at?: string;
  };
  category_id: string;
}

function detectDocType(num: string, current: string): string {
  const n = num.toLowerCase().trim();
  if (n.endsWith('-п') || n.includes('-п/')) return 'Постанова КМУ';
  if (n.endsWith('-р') || n.includes('-р/')) return 'Розпорядження КМУ';
  if (/^\d+-[IVXLC]+$/.test(n) || /[IVXLC]{2,}/.test(n)) return 'Закон України';
  if (n.startsWith('z')) return 'Наказ';
  return current;
}

function buildHeader(p: {
  doc_type: string; doc_number: string; source_url: string;
  parentChain?: string;
}): string {
  const date = new Date().toISOString().split('T')[0];
  const lines = [
    `> **Тип:** ${p.doc_type}`,
    `> **Номер:** ${p.doc_number}`,
    `> **Редакція:** актуальна станом на ${date}`,
    `> **Джерело:** ${p.source_url}`,
  ];
  if (p.parentChain) lines.push(`> **На виконання:** ${p.parentChain}`);
  return lines.join('\n');
}

async function main() {
  if (!config.db.serverUrl) {
    console.error('POSTGREST_URL not set.');
    process.exit(1);
  }

  const db = createPostgrestClient(config.db.serverUrl, config.db.serviceRoleKey, {
    auth: { persistSession: false },
  });

  // Load ALL law documents (need full set to resolve parent chains)
  const { data: allDocs } = await db
    .from('kb_documents')
    .select('id, title, metadata, category_id')
    .not('metadata->doc_type', 'is', null)
    .order('created_at');

  if (!allDocs || allDocs.length === 0) {
    console.log('No law documents found.');
    return;
  }

  const docMap = new Map<string, DocRow>();
  for (const d of allDocs as DocRow[]) docMap.set(d.id, d);

  // Filter only child documents (have parent_doc_id pointing to existing doc)
  const childDocs = (allDocs as DocRow[]).filter(d => {
    const pid = d.metadata?.parent_doc_id;
    return pid && docMap.has(pid);
  });

  if (childDocs.length === 0) {
    console.log('No child documents to reindex.');
    return;
  }

  // Load category names
  const catMap = new Map<string, string>();
  const { data: cats } = await db.from('kb_categories').select('id, name');
  if (cats) for (const c of cats as { id: string; name: string }[]) catMap.set(c.id, c.name);

  // Build parent chain label: walks up parent_doc_id
  function buildParentChain(doc: DocRow): string {
    const parts: string[] = [];
    let current: DocRow | undefined = doc;
    const visited = new Set<string>();

    while (current?.metadata?.parent_doc_id) {
      if (visited.has(current.id)) break; // cycle protection
      visited.add(current.id);
      const parent = docMap.get(current.metadata.parent_doc_id);
      if (!parent) break;
      const num = parent.metadata?.doc_number || '';
      parts.push(num ? `${num} — ${parent.title}` : parent.title);
      current = parent;
    }

    return parts.join('; ');
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  Reindex ${childDocs.length} child law documents`);
  console.log(`  Adding "На виконання: ..." parent chain to headers`);
  console.log(`  Pipeline: fetch → header + parent → chunk → prefix → embed`);
  console.log(`${'═'.repeat(60)}\n`);

  let ok = 0;
  let fail = 0;

  for (const doc of childDocs) {
    const meta = doc.metadata;
    if (!meta.source_url) {
      console.log(`  SKIP ${doc.title} — no source_url`);
      fail++;
      continue;
    }

    const parentChain = buildParentChain(doc);
    console.log(`\n── [${ok + fail + 1}/${childDocs.length}] ${meta.doc_number} ──`);
    console.log(`  Parent chain: ${parentChain}`);

    try {
      // 1. Fetch fresh text
      const fetched = await fetchLaw(meta.source_url);
      if (!fetched.markdown || fetched.charCount < 100) {
        console.log(`  ✗ Text too short: ${fetched.charCount} chars`);
        fail++;
        continue;
      }

      // 2. Fix doc_type
      const fixedDocType = detectDocType(meta.doc_number, meta.doc_type);
      if (fixedDocType !== meta.doc_type) {
        console.log(`  ⚡ doc_type: "${meta.doc_type}" → "${fixedDocType}"`);
      }

      // 3. Build markdown with parent chain header
      const title = fetched.title || doc.title;
      const header = buildHeader({
        doc_type: fixedDocType,
        doc_number: meta.doc_number,
        source_url: meta.source_url,
        parentChain,
      });

      let md = fetched.markdown;
      const titleMatch = md.match(/^# .+/);
      if (titleMatch) {
        md = md.replace(/^# .+/, `${titleMatch[0]}\n\n${header}`);
      } else {
        md = `# ${title}\n\n${header}\n\n${md}`;
      }

      console.log(`  Fetched: ${md.length} chars`);

      // 4. Update metadata
      const fetchedAt = new Date().toISOString().split('T')[0];
      await db.from('kb_documents').update({
        title,
        status: 'processing',
        metadata: { ...meta, doc_type: fixedDocType, fetched_at: fetchedAt },
        updated_at: new Date().toISOString(),
      }).eq('id', doc.id);

      // 5. Process: chunk → AI prefix → embed → DB
      const catName = catMap.get(doc.category_id) || 'Юридичний';
      const result = await processFromMarkdown(doc.id, md, title, catName);

      console.log(`  ✓ ${result.chunkCount} chunks`);
      ok++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ✗ Error: ${msg.slice(0, 200)}`);
      fail++;
    }

    if (ok + fail < childDocs.length) {
      await new Promise(r => setTimeout(r, DELAY_BETWEEN_DOCS_MS));
    }
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  Done: ${ok} ok, ${fail} failed out of ${childDocs.length}`);
  console.log(`${'═'.repeat(60)}\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
