-- Fix match_kb_documents: include BM25-only matches via FULL OUTER JOIN
-- Problem: `FROM vs LEFT JOIN bm` excluded chunks found by BM25 but below vector threshold.
-- When threshold was tightened (0.20→0.35), standard software document chunks (e.g. Teams
-- in the standard software list) were dropped from vector search but still found by BM25 —
-- yet the LEFT JOIN discarded them, causing incomplete answers.
-- Fix: enrich `bm` CTE with full chunk data and use FULL OUTER JOIN in `rrf`.

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
BEGIN
  q_embedding := query_embedding::vector(1024);

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
    -- BM25 full-text + trigram search (includes full chunk data for FULL OUTER JOIN)
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
            to_tsvector('simple', kc.content),
            plainto_tsquery('simple', query_text)
          ) DESC
      ) AS bm_rank
    FROM kb_chunks kc
    JOIN kb_documents  kd  ON kd.id  = kc.document_id
    JOIN kb_categories cat ON cat.id = kd.category_id
    WHERE kd.status = 'ready'
      AND kc.embedding IS NOT NULL
      AND (filter_category_slug IS NULL OR cat.slug = filter_category_slug)
      AND (filter_process_id    IS NULL OR kd.process_id = filter_process_id)
      AND (
        to_tsvector('simple', kc.content) @@ plainto_tsquery('simple', query_text)
        OR similarity(kc.content, query_text) > 0.1
      )
  ),
  rrf AS (
    -- Reciprocal Rank Fusion: FULL OUTER JOIN so BM25-only chunks are included
    -- even when their vector similarity falls below match_threshold
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
