-- Fix BM25 in match_kb_documents:
-- 1. 'simple' → 'russian' dictionary: stems Ukrainian words
--    ("встановлення" = "встановлений" → 'встановлен', "Teams" → 'team', etc.)
-- 2. AND → OR semantics: plainto_tsquery required ALL query words in same chunk;
--    table chunks contain "Microsoft Teams" but not "встановлення/комунікацій/станцію",
--    so they were silently excluded. OR lets any key term match.
-- 3. Include kc.heading in tsvector: table chunks have context only in heading
--    (e.g. "Базовий набір ПЗ... має бути встановлений за замовчуванням").

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

  -- Build OR-tsquery with Russian stemming from query_text lexemes.
  -- OR semantics ensures chunks matching ANY key term are included
  -- (e.g. a table chunk with "Microsoft Teams" but no "встановлення").
  SELECT to_tsquery('russian', string_agg(lexeme, ' | '))
  INTO v_or_query
  FROM unnest(to_tsvector('russian', query_text));

  SET LOCAL hnsw.ef_search = 100;

  RETURN QUERY
  WITH vs AS (
    -- Vector similarity search (filtered by threshold)
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
  bm AS (
    -- BM25 with OR-semantics, Russian stemming, heading+content tsvector.
    -- Includes full chunk data so FULL OUTER JOIN works in rrf.
    SELECT
      kc.id          AS bm_chunk_id,
      kc.document_id AS bm_doc_id,
      kd.title       AS bm_title,
      cat.name       AS bm_cat,
      kc.content     AS bm_content,
      kc.heading     AS bm_heading,
      kc.chunk_index AS bm_chunk_index,
      (1 - (kc.embedding <=> q_embedding)) AS bm_sim,
      ROW_NUMBER() OVER (
        ORDER BY
          ts_rank(
            to_tsvector('russian', COALESCE(kc.heading, '') || ' ' || kc.content),
            v_or_query
          ) DESC
      ) AS bm_rank
    FROM kb_chunks kc
    JOIN kb_documents  kd  ON kd.id  = kc.document_id
    JOIN kb_categories cat ON cat.id = kd.category_id
    WHERE kd.status = 'ready'
      AND kc.embedding IS NOT NULL
      AND (filter_category_slug IS NULL OR cat.slug = filter_category_slug)
      AND (filter_process_id    IS NULL OR kd.process_id = filter_process_id)
      AND v_or_query IS NOT NULL
      AND (
        -- OR-based full-text match (heading + content, Russian stemming)
        to_tsvector('russian', COALESCE(kc.heading, '') || ' ' || kc.content)
          @@ v_or_query
        -- Trigram fallback for rare/transliterated words
        OR similarity(kc.content, query_text) > 0.1
      )
  ),
  rrf AS (
    -- Reciprocal Rank Fusion: FULL OUTER JOIN so BM25-only chunks
    -- (e.g. table chunks below vector threshold) are always included
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
