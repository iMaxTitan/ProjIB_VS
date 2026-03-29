/**
 * Deterministic synonym layer — reads kb_synonym_dict from DB.
 * Scans text for formal terms and returns matching colloquial synonyms.
 * Used at index time (enrich prefix) and query time (expand search).
 */
import logger from '@/lib/shared/logger';

interface SynonymEntry {
  formal_term: string;
  synonyms: string[];
  category: string;
}

let _cache: SynonymEntry[] | null = null;
let _cacheTs = 0;
const CACHE_TTL_MS = 5 * 60_000; // 5 min

/** Load synonym dict from DB (cached). */
async function loadDict(): Promise<SynonymEntry[]> {
  if (_cache && Date.now() - _cacheTs < CACHE_TTL_MS) return _cache;
  const { getServerDb } = await import('@/lib/shared/db-server');
  const db = getServerDb();
  const { data, error } = await db
    .from('kb_synonym_dict')
    .select('formal_term, synonyms, category');
  if (error || !data) {
    logger.error('[kb/synonyms] failed to load dict:', error?.message);
    return _cache || [];
  }
  _cache = data as SynonymEntry[];
  _cacheTs = Date.now();
  return _cache;
}

/**
 * Scan text for known formal terms and return all matching synonyms.
 * Used at index time to enrich prefix with deterministic synonyms.
 */
export async function findSynonymsForText(text: string): Promise<string[]> {
  const dict = await loadDict();
  const lower = text.toLowerCase();
  const matches: string[] = [];
  for (const entry of dict) {
    if (lower.includes(entry.formal_term.toLowerCase())) {
      matches.push(...entry.synonyms);
    }
  }
  return [...new Set(matches)];
}

/**
 * Expand a user query with synonyms from the dict.
 * Used at query time before AI expansion.
 * Returns additional terms to append to search queries.
 */
export async function expandQueryWithSynonyms(query: string): Promise<string[]> {
  const dict = await loadDict();
  const lower = query.toLowerCase();
  const expansions: string[] = [];

  for (const entry of dict) {
    // Check if query contains any synonym → add formal term
    const querySynMatch = entry.synonyms.some(s => lower.includes(s.toLowerCase()));
    if (querySynMatch) {
      expansions.push(entry.formal_term);
    }
    // Check if query contains formal term → add synonyms
    if (lower.includes(entry.formal_term.toLowerCase())) {
      expansions.push(...entry.synonyms);
    }
  }

  return [...new Set(expansions)];
}

/** Invalidate cache (call after dict update). */
export function invalidateSynonymCache(): void {
  _cache = null;
  _cacheTs = 0;
}
