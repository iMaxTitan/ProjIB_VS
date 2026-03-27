/**
 * Quick KB query test — runs a single query through the RAG pipeline.
 * Usage: npx tsx scripts/kb-test-query.ts "як підключити 4G модем"
 */
import 'dotenv/config';
import { searchAndAnswer } from '../src/lib/kb/search';
import { createClient } from '../src/lib/shared/postgrest-client';

const query = process.argv[2] || 'як підключити 4G модем до робочого місця';

const db = createClient(
  process.env.NEXT_PUBLIC_API_URL!,
  process.env.POSTGREST_SERVICE_KEY!,
);

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
