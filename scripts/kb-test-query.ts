/**
 * Quick KB query test — runs a single query through the RAG pipeline.
 * Usage: npx tsx scripts/kb-test-query.ts "як підключити 4G модем"
 */
import './eval-env';
import { searchAndAnswer } from '../src/lib/kb/search';
import { getServerDb } from '../src/lib/shared/db-server';

const query = process.argv[2] || 'як підключити 4G модем до робочого місця';

const db = getServerDb();

async function main() {
  console.log(`\n🔍 Query: "${query}"\n`);
  const start = Date.now();

  const result = await searchAndAnswer(query, {
    userId: 'test',
    role: 'chief',
    db,
  });

  console.log(`⏱ ${Date.now() - start}ms\n`);
  console.log(result.text);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
