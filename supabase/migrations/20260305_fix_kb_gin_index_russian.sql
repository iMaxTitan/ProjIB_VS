-- Fix GIN index mismatch with current match_kb_documents function.
--
-- Problem:
--   Existing index: to_tsvector('simple', content)
--   Function query: to_tsvector('russian', COALESCE(heading,'') || ' ' || content)
--   → Different config ('simple' vs 'russian') AND different expression
--     (content only vs heading||content) → index is NEVER used → full seq scan.
--
-- Fix: add GIN index matching the exact expression used in match_kb_documents.
-- Old 'simple' index kept for backward compatibility with any direct SQL queries.

CREATE INDEX IF NOT EXISTS idx_kb_chunks_fts_russian
  ON public.kb_chunks
  USING gin (
    to_tsvector('russian', COALESCE(heading, '') || ' ' || content)
  );

-- Also fix HNSW index parameters comment (current: m=16, ef_construction=64).
-- These are reasonable for 728 chunks but ef_construction=128 would give
-- better recall at index build time. Rebuild only when corpus exceeds ~5k chunks.
-- For now: just ensure ef_search=100 is set at query time (already done in function).

COMMENT ON INDEX idx_kb_chunks_fts_russian
  IS 'GIN index for BM25 search in match_kb_documents: russian stemming + heading context';
