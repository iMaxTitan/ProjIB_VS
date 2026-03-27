/**
 * Process pending law documents (chunk + embed).
 * Run: cd /opt/cs-dev && node -r dotenv/config scripts/process-pending-laws.ts dotenv_config_path=.env.local
 * Or:  cd /opt/cs-dev && npx tsx --require dotenv/config scripts/process-pending-laws.ts
 * Env must be loaded BEFORE module imports (config reads process.env at init).
 */

import { processDocument } from '../src/lib/kb/processor';
import { getServerDb } from '../src/lib/shared/db-server';

async function main() {
  const db = getServerDb();

  // Find documents with content but no chunks
  const { data: docs, error } = await db
    .from('kb_documents')
    .select('id, title, content, mime_type, category_id')
    .eq('chunk_count', 0)
    .not('content', 'eq', '')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Query error:', error);
    process.exit(1);
  }

  if (!docs || docs.length === 0) {
    console.log('No pending documents.');
    return;
  }

  console.log(`Found ${docs.length} documents to process.\n`);

  // Get category names
  const { data: cats } = await db.from('kb_categories').select('id, name');
  const catMap = new Map((cats || []).map((c: { id: string; name: string }) => [c.id, c.name]));

  for (const doc of docs as { id: string; title: string; content: string; mime_type: string; category_id: string }[]) {
    console.log(`Processing: ${doc.title.substring(0, 60)}...`);
    const buffer = Buffer.from(doc.content, 'utf-8');
    const catName = catMap.get(doc.category_id) || 'Юридичний';

    try {
      const result = await processDocument(doc.id, buffer, 'text/markdown', doc.title, catName);
      console.log(`  ✓ ${result.chunkCount} chunks\n`);
    } catch (err) {
      console.error(`  ✗ Error: ${(err as Error).message}\n`);
    }
  }

  console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
