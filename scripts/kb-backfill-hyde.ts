/**
 * Backfill HyDE (hypothetical questions + question_embedding) for existing chunks.
 * Does NOT touch content embedding or prefix — only adds question data.
 *
 *   npx tsx scripts/kb-backfill-hyde.ts                  — all chunks without question_embedding
 *   npx tsx scripts/kb-backfill-hyde.ts --doc-id UUID    — specific document only
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env', override: true });
dotenv.config({ path: '.env.local', override: true });

async function main() {
  const { backfillHyde } = await import('../src/lib/kb/hyde-generator');
  const { config } = await import('../src/lib/shared/config');
  const { createPostgrestClient } = await import('../src/lib/shared/postgrest-client');

  if (!config.db.serverUrl || !config.db.serviceRoleKey) {
    console.error('Missing DB config');
    process.exit(1);
  }

  const db = createPostgrestClient(config.db.serverUrl, config.db.serviceRoleKey);

  const docIdx = process.argv.indexOf('--doc-id');
  const documentId = docIdx >= 0 ? process.argv[docIdx + 1] : undefined;

  console.log(`\n  HyDE Backfill${documentId ? ` (doc: ${documentId})` : ' (all chunks)'}\n`);

  const result = await backfillHyde(db, {
    batchSize: 20,
    delayMs: 500,
    documentId,
    onProgress: (p) => {
      process.stdout.write(`\r  Progress: ${p.processed}/${p.total} (generated: ${p.generated}, errors: ${p.errors})`);
    },
  });

  console.log(`\n\n  Done: ${result.processed}/${result.total} processed, ${result.generated} generated, ${result.errors} errors\n`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
