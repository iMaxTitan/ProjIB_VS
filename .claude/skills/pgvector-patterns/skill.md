---
name: pgvector-patterns
description: "PostgreSQL pgvector patterns — embeddings, similarity search, HNSW indexing, RPC functions. Always use this skill when the task involves embeddings, vector search, cosine similarity, Voyage API, kb_document_chunks, match_kb_documents, or any pgvector-related work."
---

# pgvector Patterns — CS Platform

## ВАЖНО: Текущие embeddings в проекте

**KB (`kb_chunks`):** Voyage 4 family (1024d via Matryoshka) через `lib/kb/embedder.ts`
- **Asymmetric search (shared embedding space):**
  - `voyage-4-large` — индексация документов (max quality, разовая операция)
  - `voyage-4-lite` — поисковые запросы (low latency, ongoing)
- `input_type: 'document'` при индексации, `'query'` при поиске
- `output_dimension: 1024` — Matryoshka truncation (HNSW limit 2000 dims)
- Embeddings передаются в RPC как строка: `[${embedding.join(',')}]` (NOT raw array)
- `SET LOCAL hnsw.ef_search = 100` внутри `match_kb_documents` RPC
- **Reranker:** `rerank-2.5` (cross-encoder, 32K context, instruction-following)

## Setup

```sql
CREATE EXTENSION IF NOT EXISTS vector;  -- pgvector 0.8.0+
```

## Типы данных

```sql
embedding vector(1024)   -- Voyage 4 (Matryoshka 1024d, наш выбор)
embedding halfvec(2048)  -- Voyage 4 full dims (если нужно >2000 для HNSW)
embedding vector(1536)   -- OpenAI text-embedding-3-small (если используется)
```

**Правила:**
- Voyage 4 shared embedding space: разные модели (large/standard/lite) совместимы
- Нельзя смешивать embeddings от РАЗНЫХ семейств (voyage-4 vs voyage-multilingual-2)
- HNSW limit: 2000 dims для `vector`, 4000 для `halfvec`

## Индексы

### HNSW (наш выбор для KB)

```sql
-- Рекомендуется для <100K записей, не требует предзаполнения
CREATE INDEX idx_kb_chunks_hnsw
  ON kb_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- В RPC — повышаем ef_search для качества поиска:
SET LOCAL hnsw.ef_search = 100;
```

### IVFFlat (только для >100K записей)

```sql
-- ⚠️ ТРЕБУЕТ предзаполнения! Пустая таблица → плохой индекс
CREATE INDEX ... USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);  -- lists = sqrt(rows)
```

## Distance Operators

```sql
-- Cosine (безопасный default, наш выбор)
ORDER BY embedding <=> query_embedding

-- Inner product (быстрее для нормализованных — OpenAI нормализует, Voyage тоже)
ORDER BY embedding <#> query_embedding
```

## Hybrid Search RPC (паттерн из KB)

```sql
CREATE OR REPLACE FUNCTION match_kb_documents(
  query_embedding text,       -- строка "[x,y,z,...]", кастится внутри
  query_text text,            -- для BM25 полнотекстового поиска
  match_count int DEFAULT 10,
  match_threshold numeric DEFAULT 0.20,
  filter_category_slug text DEFAULT NULL,
  filter_process_id uuid DEFAULT NULL
)
RETURNS TABLE (chunk_id uuid, document_id uuid, ...)
LANGUAGE plpgsql
SECURITY DEFINER  -- ОБЯЗАТЕЛЬНО если RLS включён на таблице
AS $$
DECLARE
  q_embedding vector(1024);
BEGIN
  q_embedding := query_embedding::vector(1024);
  SET LOCAL hnsw.ef_search = 100;

  -- Vector search (vs) + BM25 full-text (bm) + RRF fusion
  RETURN QUERY
  WITH vs AS (...), bm AS (...), rrf AS (...)
  SELECT ... FROM rrf ORDER BY rrf_score DESC LIMIT match_count;
END;
$$;
```

**CRITICAL:** `SECURITY DEFINER` обязателен если на таблице включён RLS —
иначе plpgsql выполняется от `authenticated` роли и RLS блокирует все строки
даже при вызове через service_role клиент.

## Voyage Embeddings API

```typescript
// lib/kb/embedder.ts — текущая реализация (Voyage 4, asymmetric search)
const DOCUMENT_MODEL = 'voyage-4-large';   // индексация
const QUERY_MODEL    = 'voyage-4-lite';    // поиск
const OUTPUT_DIMENSION = 1024;

async function callEmbeddingsAPI(inputs: string[], inputType: 'document' | 'query') {
  const model = inputType === 'document' ? DOCUMENT_MODEL : QUERY_MODEL;
  const response = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: inputs,
      input_type: inputType,
      output_dimension: OUTPUT_DIMENSION,  // Matryoshka truncation
    }),
  });
  // ...returns number[][] (1024 dims)
}

// embedBatch(texts)  → voyage-4-large, input_type='document'
// embedText(text)    → voyage-4-lite,  input_type='query'

// Передача в RPC — строкой, не массивом!
const embeddingStr = `[${embedding.join(',')}]`;
await db.rpc('match_kb_documents', { query_embedding: embeddingStr, ... });
```

## RLS паттерн для vector tables

```sql
ALTER TABLE kb_chunks ENABLE ROW LEVEL SECURITY;

-- READ: все авторизованные
CREATE POLICY "authenticated_read" ON kb_chunks
  FOR SELECT TO authenticated USING (true);

-- WRITE: только через service-role (нет INSERT/UPDATE/DELETE policy)
-- Только getDb() (service-role) может писать
```

## Чеклист pgvector

- [ ] Extension `vector` включена (0.8.0+)
- [ ] `vector(1024)` — Voyage 4 Matryoshka (HNSW-совместимо)
- [ ] Asymmetric search: `voyage-4-large` (docs) + `voyage-4-lite` (queries)
- [ ] `input_type: 'document'` при индексации, `'query'` при поиске
- [ ] `output_dimension: 1024` в API-запросе
- [ ] HNSW index с `vector_cosine_ops` (не IVFFlat для нашего объёма)
- [ ] `SET LOCAL hnsw.ef_search = 100` внутри RPC
- [ ] RPC с `SECURITY DEFINER` если таблица под RLS
- [ ] Embedding передаётся в RPC как строка `[x,y,z,...]` (не raw array)
- [ ] `WHERE embedding IS NOT NULL` в RPC
- [ ] `ORDER BY embedding <=> query` (не по alias — index игнорируется!)
- [ ] Zero vector проверка после создания embedding

## Антипаттерны

```sql
-- ❌ ORDER BY alias — index не используется!
SELECT *, 1 - (embedding <=> query) AS similarity
FROM docs ORDER BY similarity DESC;

-- ✅ ORDER BY distance function напрямую
SELECT *, 1 - (embedding <=> query) AS similarity
FROM docs ORDER BY embedding <=> query ASC;

-- ❌ IVFFlat на пустой таблице → плохие кластеры
-- ❌ Смешивать embeddings от разных семейств (voyage-4 ≠ voyage-multilingual-2)
-- ❌ vector(2048) + HNSW — лимит 2000 dims! Используй halfvec(2048) или vector(1024)
-- ❌ vector column без NOT NULL guard → WHERE embedding IS NOT NULL в RPC
-- ❌ RPC без SECURITY DEFINER на таблице с RLS
-- ❌ Передавать embedding как JS array в RPC (нужна строка "[x,y,z]")
-- ❌ Забыть output_dimension при вызове Voyage 4 API (default может быть != 1024)
```
