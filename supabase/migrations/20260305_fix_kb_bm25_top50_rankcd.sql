-- Fix BM25 algorithmic issues in match_kb_documents:
--
-- Root cause analysis:
-- 1. OR query from ALL lexemes → 189/728 chunks (26% of corpus) as candidates.
--    High-frequency domain terms: 'забезпечен' 21.7%, 'встановлен' 11%, 'робоч' 10%.
--    These flood BM25 candidates with noise unrelated to the actual query.
--
-- 2. ts_rank does not implement true BM25 IDF weighting. With OR query,
--    'забезпечен' (21.7% doc-freq) and 'team' (1% doc-freq) contribute
--    similarly to the score. In proper BM25, IDF of 'team' is 4.6×
--    higher than 'забезпечен'.
--
-- 3. bm_rank extends to 189 → lowest chunk contributes 1/(60+189)≈0.004
--    to RRF, still displacing better chunks from the final top-20.
--
-- 4. trigram fallback similarity > 0.1 is semantically meaningless
--    (virtually any two strings share some trigrams). Raises to 0.3.
--
-- Fixes:
-- A. Cap BM25 candidates to top-50 by ts_rank_cd BEFORE RRF (standard practice).
--    bm_rank now goes 1..50 max → minimum RRF contribution 1/110≈0.009.
-- B. Switch ts_rank → ts_rank_cd (cover density normalization).
--    Better approximates IDF for short chunks and dense technical documents.
-- C. Raise trigram threshold 0.1 → 0.3 (meaningful character-level similarity).

CREATE OR REPLACE FUNCTION public.match_kb_documents(
  query_embedding text,
  query_text      text,
  match_count     integer DEFAULT 10,
  match_threshold numeric DEFAULT 0.20,
  filter_category_slug text DEFAULT NULL,
  filter_process_id    uuid   DEFAULT NULL
)
RETURNS TABLE(
  chunk_id       uuid,
  document_id    uuid,
  document_title text,
  category_name  text,
  content        text,
  heading        text,
  similarity     numeric,
  chunk_index    integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  q_embedding vector(1024);
  v_or_query  tsquery;
BEGIN
  q_embedding := query_embedding::vector(1024);

  -- Build OR-tsquery from Russian-stemmed lexemes.
  -- OR semantics is necessary to find table/list chunks that contain
  -- specific product names (e.g. "Microsoft Teams") without containing
  -- procedural words ("встановлення", "налаштування") from the query.
  SELECT to_tsquery('russian', string_agg(lexeme, ' | '))
  INTO v_or_query
  FROM unnest(to_tsvector('russian', query_text));

  SET LOCAL hnsw.ef_search = 100;

  RETURN QUERY
  WITH vs AS (
    -- Vector similarity search filtered by threshold
    SELECT
      kc.id                                    AS vs_chunk_id,
      kc.document_id                           AS vs_doc_id,
      kd.title                                 AS vs_title,
      cat.name                                 AS vs_cat,
      kc.content                               AS vs_content,
      kc.heading                               AS vs_heading,
      kc.chunk_index                           AS vs_chunk_index,
      (1 - (kc.embedding <=> q_embedding))     AS vs_sim,
      ROW_NUMBER() OVER (ORDER BY kc.embedding <=> q_embedding) AS vs_rank
    FROM kb_chunks kc
    JOIN kb_documents  kd  ON kd.id  = kc.document_id
    JOIN kb_categories cat ON cat.id = kd.category_id
    WHERE kd.status = 'ready'
      AND kc.embedding IS NOT NULL
      AND (filter_category_slug IS NULL OR cat.slug = filter_category_slug)
      AND (filter_process_id    IS NULL OR kd.process_id = filter_process_id)
      AND (1 - (kc.embedding <=> q_embedding)) >= match_threshold
  ),
  -- BM25 step 1: score all matching chunks, take top-50 only.
  -- Limiting to 50 before RRF prevents noise chunks (matched via
  -- high-frequency terms) from diluting the final result set.
  bm_top AS (
    SELECT
      kc.id          AS bm_chunk_id,
      kc.document_id AS bm_doc_id,
      kd.title       AS bm_title,
      cat.name       AS bm_cat,
      kc.content     AS bm_content,
      kc.heading     AS bm_heading,
      kc.chunk_index AS bm_chunk_index,
      (1 - (kc.embedding <=> q_embedding)) AS bm_sim,
      -- ts_rank_cd uses cover-density normalization; better IDF-like
      -- weighting than ts_rank for short technical document chunks.
      ts_rank_cd(
        to_tsvector('russian', COALESCE(kc.heading, '') || ' ' || kc.content),
        v_or_query
      ) AS bm_score
    FROM kb_chunks kc
    JOIN kb_documents  kd  ON kd.id  = kc.document_id
    JOIN kb_categories cat ON cat.id = kd.category_id
    WHERE kd.status = 'ready'
      AND kc.embedding IS NOT NULL
      AND (filter_category_slug IS NULL OR cat.slug = filter_category_slug)
      AND (filter_process_id    IS NULL OR kd.process_id = filter_process_id)
      AND v_or_query IS NOT NULL
      AND (
        to_tsvector('russian', COALESCE(kc.heading, '') || ' ' || kc.content)
          @@ v_or_query
        -- Trigram fallback for transliterated/rare words not caught by stemmer.
        -- Threshold 0.3: meaningful character-level overlap (was 0.1 = noise).
        OR similarity(kc.content, query_text) > 0.3
      )
    ORDER BY bm_score DESC
    LIMIT 50
  ),
  -- BM25 step 2: assign rank within the capped top-50 set.
  -- bm_rank now ranges 1..50, so minimum RRF contribution = 1/110 ≈ 0.009.
  bm AS (
    SELECT
      bm_chunk_id, bm_doc_id, bm_title, bm_cat,
      bm_content, bm_heading, bm_chunk_index, bm_sim,
      ROW_NUMBER() OVER (ORDER BY bm_score DESC) AS bm_rank
    FROM bm_top
  ),
  -- Reciprocal Rank Fusion: FULL OUTER JOIN preserves BM25-only chunks
  -- (e.g. table/list chunks below vector threshold) in the final result.
  rrf AS (
    SELECT
      COALESCE(vs.vs_chunk_id,    bm.bm_chunk_id)    AS rrf_chunk_id,
      COALESCE(vs.vs_doc_id,      bm.bm_doc_id)      AS rrf_doc_id,
      COALESCE(vs.vs_title,       bm.bm_title)       AS rrf_title,
      COALESCE(vs.vs_cat,         bm.bm_cat)         AS rrf_cat,
      COALESCE(vs.vs_content,     bm.bm_content)     AS rrf_content,
      COALESCE(vs.vs_heading,     bm.bm_heading)     AS rrf_heading,
      COALESCE(vs.vs_chunk_index, bm.bm_chunk_index) AS rrf_chunk_index,
      COALESCE(vs.vs_sim,         bm.bm_sim)         AS rrf_sim,
      (
        COALESCE(1.0 / (60 + vs.vs_rank), 0) +
        COALESCE(1.0 / (60 + bm.bm_rank), 0)
      ) AS rrf_score
    FROM vs
    FULL OUTER JOIN bm ON bm.bm_chunk_id = vs.vs_chunk_id
  )
  SELECT
    r.rrf_chunk_id,
    r.rrf_doc_id,
    r.rrf_title,
    r.rrf_cat,
    r.rrf_content,
    r.rrf_heading,
    r.rrf_sim::numeric,
    r.rrf_chunk_index
  FROM rrf r
  ORDER BY r.rrf_score DESC
  LIMIT match_count;
END;
$$;
