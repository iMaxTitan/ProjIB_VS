-- Migration: Add HyDE (Hypothetical Document Embedding) columns
-- Applied: 2026-03-31

-- Store 2-4 hypothetical questions generated at index time
ALTER TABLE kb_chunks ADD COLUMN IF NOT EXISTS hypothetical_questions text[];

-- Embedding of hypothetical questions for dual-vector search
ALTER TABLE kb_chunks ADD COLUMN IF NOT EXISTS question_embedding vector(1024);

-- HNSW index for question_embedding search
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_kb_chunks_question_hnsw
  ON kb_chunks USING hnsw (question_embedding vector_cosine_ops)
  WITH (m='16', ef_construction='64');
