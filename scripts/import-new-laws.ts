/**
 * Import specific new law documents into KB.
 * Uses law-fetcher → processFromMarkdown() pipeline.
 *
 * Usage: npx tsx scripts/import-new-laws.ts
 */

import './eval-env';
import { processFromMarkdown } from '../src/lib/kb/processor';
import { fetchLaw } from '../src/lib/ops/laws/fetcher-client';
import { createPostgrestClient } from '../src/lib/shared/postgrest-client';
import { config } from '../src/lib/shared/config';

const DELAY_MS = 5000;

interface NewLaw {
  url: string;
  docType: string;
  docNumber: string;
  parentDocNumber?: string; // will resolve to parent_doc_id
}

const LAWS_TO_IMPORT: NewLaw[] = [
  {
    url: 'https://zakon.rada.gov.ua/laws/show/z1676-25',
    docType: 'Наказ',
    docNumber: 'z1676-25',
    parentDocNumber: '76-2023-п', // related to bronuvannya
  },
  {
    url: 'https://zakon.rada.gov.ua/laws/show/847-2025-%D0%BF',
    docType: 'Постанова КМУ',
    docNumber: '847-2025-п',
    parentDocNumber: '76-2023-п',
  },
  {
    url: 'https://zakon.rada.gov.ua/laws/show/233-2025-%D0%BF',
    docType: 'Постанова КМУ',
    docNumber: '233-2025-п',
    parentDocNumber: '76-2023-п',
  },
  {
    url: 'https://zakon.rada.gov.ua/laws/show/z0300-25',
    docType: 'Наказ',
    docNumber: 'z0300-25',
    parentDocNumber: '76-2023-п',
  },
];

function buildHeader(p: { docType: string; docNumber: string; sourceUrl: string; parentLaw?: string }): string {
  const date = new Date().toISOString().split('T')[0];
  const lines = [
    `> **Тип:** ${p.docType}`,
    `> **Номер:** ${p.docNumber}`,
    `> **Редакція:** актуальна станом на ${date}`,
    `> **Джерело:** ${p.sourceUrl}`,
  ];
  if (p.parentLaw) lines.push(`> **На виконання:** ${p.parentLaw}`);
  return lines.join('\n');
}

async function main() {
  const db = createPostgrestClient(config.db.serverUrl, config.db.serviceRoleKey, { auth: { persistSession: false } });

  // Get legal category ID
  const { data: cats } = await db.from('kb_categories').select('id, name').eq('slug', 'legal');
  const legalCat = (cats as Array<{ id: string; name: string }> | null)?.[0];
  if (!legalCat) { console.error('Legal category not found'); process.exit(1); }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  Import ${LAWS_TO_IMPORT.length} new law documents`);
  console.log(`${'═'.repeat(60)}\n`);

  let ok = 0;
  let fail = 0;

  for (const law of LAWS_TO_IMPORT) {
    console.log(`── ${law.docNumber} ──`);

    try {
      // Check if already exists
      const { data: existing } = await db
        .from('kb_documents')
        .select('id')
        .eq('metadata->>doc_number', law.docNumber);
      if (existing?.length) {
        console.log(`  SKIP — already exists`);
        continue;
      }

      // Resolve parent doc ID
      let parentDocId: string | null = null;
      let parentLaw: string | undefined;
      if (law.parentDocNumber) {
        const { data: parent } = await db
          .from('kb_documents')
          .select('id, title')
          .eq('metadata->>doc_number', law.parentDocNumber);
        if (parent?.length) {
          parentDocId = (parent[0] as { id: string }).id;
          parentLaw = `${law.parentDocNumber} — ${(parent[0] as { title: string }).title}`;
          console.log(`  Parent: ${law.parentDocNumber}`);
        }
      }

      // Fetch via law-fetcher
      const fetched = await fetchLaw(law.url);
      if (!fetched.markdown || fetched.charCount < 100) {
        console.log(`  ✗ Text too short: ${fetched.charCount}`);
        fail++;
        continue;
      }

      const title = fetched.title;
      console.log(`  Fetched: ${fetched.charCount} chars — ${title.slice(0, 60)}...`);

      // Build markdown with header
      const header = buildHeader({
        docType: law.docType,
        docNumber: law.docNumber,
        sourceUrl: law.url.replace(/#.*$/, ''),
        parentLaw,
      });

      let md = fetched.markdown;
      const titleMatch = md.match(/^# .+/);
      if (titleMatch) {
        md = md.replace(/^# .+/, `${titleMatch[0]}\n\n${header}`);
      } else {
        md = `# ${title}\n\n${header}\n\n${md}`;
      }

      // Insert document record
      const metadata = {
        doc_type: law.docType,
        doc_number: law.docNumber,
        source_url: law.url.replace(/#.*$/, ''),
        related_docs: [],
        parent_doc_id: parentDocId,
        fetched_at: new Date().toISOString().split('T')[0],
      };

      const { data: inserted, error: insertErr } = await db
        .from('kb_documents')
        .insert({
          title,
          source_filename: `${law.docNumber.replace(/[\/\\]/g, '-')}.md`,
          mime_type: 'text/markdown',
          category_id: legalCat.id,
          created_by: null,
          status: 'processing',
          content: '',
          metadata,
        })
        .select('id');

      if (insertErr || !inserted?.length) {
        console.log(`  ✗ Insert error:`, insertErr);
        fail++;
        continue;
      }

      const docId = (inserted[0] as { id: string }).id;

      // Process through full pipeline
      const result = await processFromMarkdown(docId, md, title, legalCat.name);
      console.log(`  ✓ ${result.chunkCount} chunks`);
      ok++;
    } catch (err) {
      console.log(`  ✗ ${err instanceof Error ? err.message : String(err)}`);
      fail++;
    }

    if (ok + fail < LAWS_TO_IMPORT.length) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  Done: ${ok} imported, ${fail} failed`);
  console.log(`${'═'.repeat(60)}\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
