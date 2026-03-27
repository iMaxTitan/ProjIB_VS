/**
 * Shared fuzzy-matching utilities for Telegram bot tools.
 */

/** Normalize text for fuzzy matching: lowercase, strip punctuation, collapse whitespace */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[«»"'`\-—–.,;:!?()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Score how well `query` matches `target`. Higher = better. 0 = no match. */
export function matchScore(query: string, target: string): number {
  const q = normalize(query);
  const t = normalize(target);

  if (q === t) return 100;
  if (t.includes(q)) return 80;
  if (q.includes(t)) return 70;

  const qWords = q.split(' ').filter(Boolean);
  const tWords = t.split(' ').filter(Boolean);

  // All query words found in target (word-level)
  const allFound = qWords.every(qw => tWords.some(tw => tw.includes(qw) || qw.includes(tw)));
  if (allFound) return 60 + Math.min(qWords.length, 9);

  // At least half of query words found
  const foundCount = qWords.filter(qw => tWords.some(tw => tw.includes(qw) || qw.includes(tw))).length;
  if (foundCount > 0 && foundCount >= qWords.length / 2) return 30 + foundCount * 5;

  return 0;
}

/**
 * Generic fuzzy finder. Scores each item against multiple text fields,
 * returns the best match above `minScore` threshold.
 */
export function findBestMatch<T>(
  items: T[],
  query: string,
  textFields: ((item: T) => string | null | undefined)[],
  minScore = 30,
): T | null {
  let best: T | null = null;
  let bestScore = 0;

  for (const item of items) {
    let score = 0;
    for (const getField of textFields) {
      const val = getField(item);
      if (val) score = Math.max(score, matchScore(query, val));
    }
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }

  return bestScore >= minScore ? best : null;
}
