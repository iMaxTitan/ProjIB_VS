-- Migration: Add trigram as 3rd RRF signal to match_kb_documents
-- Prerequisite: CREATE EXTENSION IF NOT EXISTS pg_trgm; (already exists)
-- Step 1: Create trigram GIN index
-- Step 2: Replace RPC function

-- Step 1: Trigram index on content (GIN for @@ and similarity operators)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_kb_chunks_trgm
  ON kb_chunks USING gin (content gin_trgm_ops);

-- Step 2: Updated RPC with 3-signal RRF (vector + BM25 + trigram)
CREATE OR REPLACE FUNCTION public.match_kb_documents(
  query_embedding text,
  query_text text DEFAULT '',
  match_count integer DEFAULT 10,
  match_threshold double precision DEFAULT 0.2,
  filter_category_slug text DEFAULT NULL,
  filter_process_id uuid DEFAULT NULL
)
RETURNS TABLE(
  chunk_id uuid,
  document_id uuid,
  document_title text,
  category_name text,
  content text,
  heading text,
  similarity numeric,
  chunk_index integer,
  contextual_prefix text,
  scope text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  q_embedding vector(1024);
  v_or_query  tsquery;
  v_simple_query tsquery;
BEGIN
  q_embedding := query_embedding::vector(1024);

  SELECT to_tsquery('russian', string_agg(lexeme, ' | '))
  INTO v_or_query
  FROM unnest(to_tsvector('russian', query_text));

  v_simple_query := plainto_tsquery('simple', query_text);

  SET LOCAL hnsw.ef_search = 100;

  RETURN QUERY
  -- CTE 1: Vector search (HNSW cosine)
  WITH vs AS (
    SELECT
      kc.id                                    AS vs_chunk_id,
      kc.document_id                           AS vs_doc_id,
      kd.title                                 AS vs_title,
      cat.name                                 AS vs_cat,
      kc.content                               AS vs_content,
      kc.heading                               AS vs_heading,
      kc.chunk_index                           AS vs_chunk_index,
      kc.contextual_prefix                     AS vs_ctx_prefix,
      kc.scope                                 AS vs_scope,
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
  -- CTE 2: BM25 full-text search (russian + simple stemmer)
  bm AS (
    SELECT
      kc.id                                    AS bm_chunk_id,
      kc.document_id                           AS bm_doc_id,
      kd.title                                 AS bm_title,
      cat.name                                 AS bm_cat,
      kc.content                               AS bm_content,
      kc.heading                               AS bm_heading,
      kc.chunk_index                           AS bm_chunk_index,
      kc.contextual_prefix                     AS bm_ctx_prefix,
      kc.scope                                 AS bm_scope,
      (1 - (kc.embedding <=> q_embedding))     AS bm_sim,
      ROW_NUMBER() OVER (
        ORDER BY ts_rank_cd(
          setweight(to_tsvector('russian', coalesce(kc.heading,'')), 'A') ||
          setweight(to_tsvector('russian', coalesce(kc.contextual_prefix,'')), 'B') ||
          setweight(to_tsvector('russian', kc.content), 'C'),
          COALESCE(v_or_query, v_simple_query)
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
        (v_or_query IS NOT NULL AND (
          to_tsvector('russian', kc.content) @@ v_or_query
          OR to_tsvector('russian', coalesce(kc.heading, '')) @@ v_or_query
          OR to_tsvector('russian', coalesce(kc.contextual_prefix, '')) @@ v_or_query
        ))
        OR (v_simple_query IS NOT NULL AND (
          to_tsvector('simple', kc.content) @@ v_simple_query
          OR to_tsvector('simple', coalesce(kc.heading, '')) @@ v_simple_query
        ))
      )
    LIMIT match_count * 3
  ),
  -- CTE 3: Trigram fuzzy search (catches typos, abbreviations, doc numbers)
  tg AS (
    SELECT
      kc.id                                    AS tg_chunk_id,
      kc.document_id                           AS tg_doc_id,
      kd.title                                 AS tg_title,
      cat.name                                 AS tg_cat,
      kc.content                               AS tg_content,
      kc.heading                               AS tg_heading,
      kc.chunk_index                           AS tg_chunk_index,
      kc.contextual_prefix                     AS tg_ctx_prefix,
      kc.scope                                 AS tg_scope,
      (1 - (kc.embedding <=> q_embedding))     AS tg_sim,
      ROW_NUMBER() OVER (
        ORDER BY greatest(
          similarity(kc.content, query_text),
          similarity(coalesce(kc.heading, ''), query_text)
        ) DESC
      ) AS tg_rank
    FROM kb_chunks kc
    JOIN kb_documents  kd  ON kd.id  = kc.document_id
    JOIN kb_categories cat ON cat.id = kd.category_id
    WHERE kd.status = 'ready'
      AND kc.embedding IS NOT NULL
      AND (filter_category_slug IS NULL OR cat.slug = filter_category_slug)
      AND (filter_process_id    IS NULL OR kd.process_id = filter_process_id)
      AND length(query_text) >= 3
      AND (
        kc.content % query_text
        OR coalesce(kc.heading, '') % query_text
      )
    LIMIT match_count * 2
  ),
  -- RRF fusion: vector (k=60) + BM25 (k=60) + trigram (k=120, half weight)
  rrf AS (
    SELECT
      COALESCE(vs.vs_chunk_id, bm.bm_chunk_id, tg.tg_chunk_id)       AS rrf_chunk_id,
      COALESCE(vs.vs_doc_id, bm.bm_doc_id, tg.tg_doc_id)             AS rrf_doc_id,
      COALESCE(vs.vs_title, bm.bm_title, tg.tg_title)                 AS rrf_title,
      COALESCE(vs.vs_cat, bm.bm_cat, tg.tg_cat)                       AS rrf_cat,
      COALESCE(vs.vs_content, bm.bm_content, tg.tg_content)           AS rrf_content,
      COALESCE(vs.vs_heading, bm.bm_heading, tg.tg_heading)           AS rrf_heading,
      COALESCE(vs.vs_chunk_index, bm.bm_chunk_index, tg.tg_chunk_index) AS rrf_chunk_index,
      COALESCE(vs.vs_ctx_prefix, bm.bm_ctx_prefix, tg.tg_ctx_prefix)  AS rrf_ctx_prefix,
      COALESCE(vs.vs_scope, bm.bm_scope, tg.tg_scope)                 AS rrf_scope,
      COALESCE(vs.vs_sim, bm.bm_sim, tg.tg_sim)                       AS rrf_sim,
      (
        COALESCE(1.0 / (60 + vs.vs_rank), 0) +
        COALESCE(1.0 / (60 + bm.bm_rank), 0) +
        COALESCE(1.0 / (120 + tg.tg_rank), 0)
      ) AS rrf_score
    FROM vs
    FULL OUTER JOIN bm ON bm.bm_chunk_id = vs.vs_chunk_id
    FULL OUTER JOIN tg ON tg.tg_chunk_id = COALESCE(vs.vs_chunk_id, bm.bm_chunk_id)
  )
  SELECT
    r.rrf_chunk_id,
    r.rrf_doc_id,
    r.rrf_title,
    r.rrf_cat,
    r.rrf_content,
    r.rrf_heading,
    r.rrf_sim::numeric,
    r.rrf_chunk_index,
    r.rrf_ctx_prefix,
    r.rrf_scope
  FROM rrf r
  ORDER BY r.rrf_score DESC
  LIMIT match_count;
END;
$function$;
