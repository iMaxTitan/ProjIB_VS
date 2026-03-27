/**
 * Generate contextual prefixes for chunks that don't have them.
 * Parallel batches — GPT-4.1-mini handles high throughput (thousands RPM).
 * Run: cd /opt/cs-dev && DOTENV_CONFIG_PATH=.env.local npx tsx --require dotenv/config scripts/generate-prefixes.ts
 */

import { generateContextualPrefix } from '../src/lib/kb/contextual-prefix';
import { createPostgrestClient } from '../src/lib/shared/postgrest-client';
import { config } from '../src/lib/shared/config';

const CONCURRENCY = 10; // parallel LLM calls
const DELAY_BETWEEN_BATCHES_MS = 200;

async function main() {
  if (!config.db.serverUrl) { console.error('POSTGREST_URL not set'); process.exit(1); }
  const db = createPostgrestClient(config.db.serverUrl, config.db.serviceRoleKey, { auth: { persistSession: false } });

  // Get documents that have chunks without contextual_prefix
  const { data: docs } = await db
    .from('kb_documents')
    .select('id, title, content')
    .eq('status', 'ready')
    .not('content', 'eq', '')
    .order('created_at', { ascending: false });

  if (!docs || !Array.isArray(docs) || docs.length === 0) {
    console.log('No documents found.'); return;
  }

  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const doc of docs as { id: string; title: string; content: string }[]) {
    const { data: chunks } = await db
      .from('kb_chunks')
      .select('id, heading, content')
      .eq('document_id', doc.id)
      .is('contextual_prefix', null)
      .order('chunk_index');

    if (!chunks || !Array.isArray(chunks) || chunks.length === 0) continue;

    console.log(`\n${doc.title.substring(0, 60)} — ${chunks.length} chunks`);
    const docSummary = doc.content.slice(0, 6000);
    const typedChunks = chunks as { id: string; heading: string; content: string }[];

    // Process in parallel batches
    for (let i = 0; i < typedChunks.length; i += CONCURRENCY) {
      const batch = typedChunks.slice(i, i + CONCURRENCY);

      const results = await Promise.allSettled(
        batch.map(async (chunk) => {
          const prefix = await generateContextualPrefix(doc.title, docSummary, chunk.heading || '', chunk.content);
          if (prefix) {
            await db.from('kb_chunks').update({ contextual_prefix: prefix }).eq('id', chunk.id);
            return 'ok';
          }
          return 'skip';
        }),
      );

      for (const r of results) {
        if (r.status === 'fulfilled') {
          if (r.value === 'ok') { totalUpdated++; process.stdout.write('.'); }
          else { totalSkipped++; process.stdout.write('x'); }
        } else {
          totalErrors++;
          process.stdout.write('!');
        }
      }

      if (i + CONCURRENCY < typedChunks.length) {
        await new Promise(r => setTimeout(r, DELAY_BETWEEN_BATCHES_MS));
      }
    }
    console.log(` (${totalUpdated} ok, ${totalSkipped} skip, ${totalErrors} err)`);
  }

  console.log(`\n=== Done: ${totalUpdated} prefixes, ${totalSkipped} skipped, ${totalErrors} errors ===`);
}

main().catch(e => { console.error(e); process.exit(1); });
