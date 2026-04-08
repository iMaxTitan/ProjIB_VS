---
doc_type: kb_pipeline_reference
last_verified: 2026-04-08
verified_against:
  - src/lib/kb/search.ts
  - src/lib/kb/chunker.ts
  - src/lib/kb/reranker.ts
  - src/lib/kb/embedder.ts
  - src/lib/kb/processor.ts
  - kb_chunks schema (live DB via mcp__postgres__query)
verification_method: |
  Read each source file end-to-end and cross-checked named constants
  (MAX_TOKENS, MATCH_COUNT, RERANK_*, etc.). Schema verified by querying
  information_schema.columns for kb_chunks. Numbers in this doc are pulled
  from the actual code, not from memory.
freshness_ttl_days: 30
on_change_required:
  - When src/lib/kb/search.ts changes search pipeline structure
  - When src/lib/kb/chunker.ts MAX_TOKENS / OVERLAP changes
  - When kb_chunks schema gains/loses columns
  - When embedding model is swapped
  - After any reindex (re-run kb-eval to confirm gold patterns still resolve)
---

# Knowledge Base — RAG Pipeline

> Verified description of how indexing and retrieval actually work in `src/lib/kb/`.
> If anything in this doc disagrees with the code, **the code wins** — open an issue and update this file.

---

## Overview

```
INDEXING:  .docx → mammoth → text → chunk → contextual prefix → embed → kb_chunks
RETRIEVAL: query → multi-query + synonyms → vector + BM25 RRF → scope boost
           → Voyage rerank-2.5 → keyword/entity boosts → diversity → expand → synthesize
```

The system uses **Contextual Retrieval** (Anthropic 2024) — each chunk gets a stored
`contextual_prefix` describing where it sits in the document. Embeddings are computed
against `prefix + content`, so query matching benefits from doc-level context.

---

## Indexing pipeline (`processor.ts`)

### Supported format

`.docx` only (Microsoft Word with proper Heading styles). PDF and `.doc` are not supported.

### Steps

```
1. parseDOCX(buffer)
   mammoth.convertToHtml() with style mapping for Heading 1/2/3
   (Ukrainian "Заголовок 1/2/3" also recognized).
   Bold-heading fallback if no real <h1>: detectBoldHeadings()
   converts <p><strong>text</strong></p> to headings (≤120 chars, not a sentence).

2. preprocessText(rawText)
   Strips approval stamps (СТВЕРДЖУЮ, ПОГОДЖУЮ, УЗГОДЖЕНО, ВВЕДЕНО В ДІЮ),
   signature lines, page numbers, excessive blank lines.

3. chunkDocument(fullText)   ← see "Chunking" section below

4. contextualPrefixGenerator (per chunk, async)
   Cascade: L1 = Gemini Flash-Lite (cheap, ~99% success rate)
            L2 = Claude Haiku (fallback when L1 fails / rate-limit / parse error)
   Stores: contextual_prefix, prefix_status (ok|fallback|needs_review),
           scope, search_terms[], semantic_summary, hypothetical_questions[]
   Skipped on rate-limit; chunk gets prefix_status='fallback' and is demoted at rerank time.

5. embedBatch(prefix + content)
   Voyage voyage-4-large, 1024d Matryoshka, input_type='document', batch 100.

6. INSERT kb_chunks (content, embedding, contextual_prefix, scope, search_terms,
                     semantic_summary, prefix_status, hypothetical_questions, question_embedding)
   UPDATE kb_documents SET status='ready', chunk_count=N
```

### Chunking constants (`chunker.ts`)

| Constant | Value | Meaning |
|---|---|---|
| `MAX_TOKENS` | **700** | Max tokens per chunk |
| `OVERLAP_TOKENS` | **100** | Sliding-window overlap between adjacent chunks |
| `MIN_CHUNK_TOKENS` | **30** | Chunks smaller than this are dropped |
| `CHARS_PER_TOKEN` | **2.5** | Cyrillic-aware estimator (`tokens ≈ chars / 2.5`) |

### Files

- `src/lib/kb/processor.ts` — top-level pipeline (parse → chunk → prefix → embed → insert)
- `src/lib/kb/chunker.ts` — heading-aware chunking strategy
- `src/lib/kb/chunker-tables.ts` — table-aware chunking (preserves header rows)
- `src/lib/kb/processor-html.ts` — bold-heading detection fallback
- `src/lib/kb/contextual-prefix.ts` — L1/L2 cascade for contextual prefix generation
- `src/lib/kb/hyde-generator.ts` — hypothetical question generation (HyDE)
- `src/lib/kb/embedder.ts` — Voyage `voyage-4-large` (docs) / `voyage-4-lite` (queries)

---

## Retrieval pipeline (`searchAndAnswer` in `search.ts`)

The function lives at `src/lib/kb/search.ts:143`. The order below is the actual code path,
verified line-by-line on 2026-04-08.

```
0. Scope-prefix shortcut
   Detects "по статуту / за статутом / у статуті" prefix → forces docTitleFilter='статут'

0.1. Meta-query handler (handleMetaQuery)
   Returns immediately for "які документи є в БЗ" / "перелік документів" type queries.

0.2. Legal locator (legalLocator)
   Deterministic lookup by article/clause number. Hits are injected into candidates later
   with top priority. Bypasses embedding entirely for "стаття 23 Закону № 3543" type queries.

1. Query analysis (generateMultiQueries — GPT-4o-mini)
   Generates 2-3 sub-queries from different angles + detects domain (ib/hr/it/legal/general).
   If domain='ambiguous' or specificity='low' → return clarification request to user.

1.5. Synonym expansion (expandQueryWithSynonyms via kb_synonym_dict)
   Adds one extra sub-query built from deterministic synonym dictionary (top 5 terms).

2. Batch embedding (embedBatchQueries — Voyage voyage-4-lite, query mode)

3. Hybrid retrieval (runMultiSearch → match_kb_documents RPC × N sub-queries in parallel)
   - vector via pgvector cosine similarity
   - BM25 via ts_rank with RRF fusion (k=60)
   - filter_category_slug applied if domain detected
   - MATCH_COUNT = 50 chunks per sub-query
   - MATCH_THRESHOLD = 0.10
   Merge by chunk_id (max similarity wins), sort by similarity desc.

3.0. Cross-category fallback
   If categorySlug filter was applied AND topScore < 0.42 → repeat search with no filter,
   merge any cross-category chunks that scored higher.

3.0a. Doc-title filter (only when scope-prefix detected)
   filter mergedChunks where document_title contains needle.

3.1. Legal locator inject
   Locator chunks pushed to front of candidates with top priority.

4. Scope soft-boost BEFORE rerank (applyScopeBoost)
   Off-scope chunks get similarity * 0.75 (not dropped — soft penalty).

4.1. Rerank (rerankChunks → Voyage rerank-2.5 cross-encoder)
   - input: top RERANK_FETCH_K (=50) chunks
   - prompt: domain-specific instruction prefix + original query
   - output filtered by RERANK_NOISE_THRESHOLD = 0.15  ← drops weak chunks INSIDE reranker
   - keeps top RERANK_KEEP_K (=30) after boost adjustments

4.2. Fallback chunk demote
   Chunks with prefix_status in ('fallback','needs_review') get _rerank_score *= 0.7
   (lower confidence in their contextual prefix → lower trust).

4.3. Keyword rescue (keywordRescue)
   Re-promotes chunks with exact entity matches that the reranker dropped.

4.4. Entity boost (applyEntityBoost)
   Adds +0.16 to _rerank_score per query-entity hit (capped, see policy file).

5. Quality gate
   If rerankTopScore < RERANK_REFUSE_THRESHOLD (0.15) → trigger deterministic retry below.

5.1. Deterministic retry (only if quality gate failed AND categorySlug was set)
   Repeat search with no category filter and no domain hint. If new top score passes
   the gate → use retry results (debug.retried = true). If still failing → return refusal.

6. Diversity (diversifyByDocument)
   POST_RERANK_MAX_PER_DOC = 2 chunks per document by default
   (with score-gap exception: extra chunks allowed if top scores cluster tightly).

6.1. Context expansion
   - expandWithNeighbors: ±1 chunk from same document around each kept chunk
   - expandWithRelatedDocs: pulls top-4 from kb_documents.parent_doc_id / related_docs[]
   - applyScopeBoost re-applied (expansion can re-introduce off-scope chunks)

7. AI synthesis (synthesizeAnswer)
   Two-stage:
   - Extract: Gemini Flash-Lite extracts facts + refs (fallback Claude Haiku)
   - Compose: Claude Haiku 4.5 writes the final answer with category-specific suffix
   System prompt: answer ONLY from given fragments, cite sources as "📄 «Title», п.X"
   Post-validation: stripHallucinatedParagraphs() removes paragraphs with hallucination markers
```

### Search constants (`search.ts`)

| Constant | Default | Env var | Purpose |
|---|---|---|---|
| `MATCH_COUNT` | **50** | `KB_MATCH_COUNT` | Chunks fetched per sub-query from vector+BM25 |
| `MATCH_THRESHOLD` | **0.10** | `KB_MATCH_THRESHOLD` | Min cosine similarity to keep |
| `RERANK_FETCH_K` | **50** | `KB_RERANK_FETCH_K` | Top-K sent to Voyage rerank |
| `RERANK_KEEP_K` | **30** | `KB_RERANK_KEEP_K` | Top-K kept after rerank+boosts |
| `RERANK_REFUSE_THRESHOLD` | **0.15** | `KB_RERANK_REFUSE_THRESHOLD` | Below this → refuse / retry |
| `RERANK_NOISE_THRESHOLD` | **0.15** | (hardcoded in `reranker.ts:22`) | Inside reranker — chunks below this are filtered out before being returned |
| `POST_RERANK_MAX_PER_DOC` | **2** | `KB_POST_RERANK_MAX_PER_DOC` | Diversity cap per document |

> ⚠️ `RERANK_NOISE_THRESHOLD` and `RERANK_REFUSE_THRESHOLD` are both 0.15 today.
> The first hard-filters per-chunk inside the reranker call. The second triggers
> retry/refuse based on the top score. They are independent and can drift apart.

### Files

- `src/lib/kb/search.ts` — `searchAndAnswer()`, `runMultiSearch()`, retry logic
- `src/lib/kb/query-translator.ts` — `generateMultiQueries()`, `dominantCategorySlug()`
- `src/lib/kb/synonym-lookup.ts` — `expandQueryWithSynonyms()` from `kb_synonym_dict`
- `src/lib/kb/embedder.ts` — `embedBatchQueries()` (Voyage)
- `src/lib/kb/reranker.ts` — Voyage rerank-2.5 with `RERANK_NOISE_THRESHOLD` filter
- `src/lib/kb/search-helpers.ts` — `diversifyByDocument`, `expandWithNeighbors`, `expandWithRelatedDocs`
- `src/lib/kb/search-locators.ts` — `legalLocator`, `handleMetaQuery`
- `src/lib/kb/search-ranking-policy.ts` — `applyScopeBoost`, `applyEntityBoost`, `keywordRescue`
- `src/lib/kb/synthesizer.ts` — extract/compose pipeline
- `src/lib/kb/bot-adapter.ts` — bot integration (`kbSearchTool`)

---

## DB schema (`kb_chunks`)

Verified live via `mcp__postgres__query` on 2026-04-08:

```sql
CREATE TABLE kb_chunks (
  id                     uuid PRIMARY KEY,
  document_id            uuid REFERENCES kb_documents(id),
  chunk_index            integer,
  content                text,
  embedding              vector(1024),       -- Voyage voyage-4-large
  heading                text,               -- "§ 25 > 26. ..." breadcrumb
  token_count            integer,
  contextual_prefix      text,               -- AI-generated, used in embedding
  scope                  text,               -- general | specific:<group>
  search_terms           text[],             -- extracted entities/keywords
  semantic_summary       text,               -- 1-line summary used by reranker context
  prefix_status          text,               -- ok | fallback | needs_review
  prefix_cache_key       text,
  hypothetical_questions text[],             -- HyDE questions per chunk
  question_embedding     vector(1024)        -- HyDE embedding (NOT yet wired into retrieval lane)
);
```

### Other KB tables

```sql
kb_categories       (id, slug, name, process_id, is_active)
kb_documents        (id, category_id, title, status, chunk_count, parent_doc_id, related_docs)
kb_pipeline_config  -- runtime tunables
kb_prefix_reviews   -- chunks with prefix_status='needs_review' for human review
kb_query_log        -- analytics: every searchAndAnswer call writes a row
kb_synonym_dict     -- deterministic query synonym expansion
```

### Indexes

```
idx_kb_chunks_hnsw  ON kb_chunks USING hnsw (embedding vector_cosine_ops) m=16 ef=64
idx_kb_chunks_fts   ON kb_chunks USING gin(to_tsvector('uk', content))
```

`hnsw.ef_search = 100` is set inside `match_kb_documents` RPC via `SET LOCAL`.

### Critical RPC

```
match_kb_documents(query_embedding text, query_text text DEFAULT '',
                   match_count int DEFAULT 10, match_threshold float DEFAULT 0.2,
                   filter_category_slug text DEFAULT NULL,
                   filter_process_id uuid DEFAULT NULL)
```

Must be `SECURITY DEFINER` — otherwise the `authenticated` role hits RLS in plpgsql
context and returns zero rows even via service-role client.

> `query_embedding` parameter is **a string** like `'[0.1,0.2,...]'`, NOT a JSON array.
> See `search.ts:120` for the exact format.

---

## Known unwired feature: HyDE retrieval lane

The `kb_chunks.question_embedding` and `hypothetical_questions` columns are **populated**
during indexing (`hyde-generator.ts`), but **not used** as a parallel retrieval lane in
`search.ts` as of 2026-04-08. They could be added as a third RRF input alongside vector
and BM25 — see `docs/KB_GAP_ANALYSIS.md` for the proposal.

---

## Eval framework

Quality is measured by `scripts/kb-eval.ts` against `src/lib/kb/eval/test-cases.json`.
See `docs/KB_EVAL_FRAMEWORK.md` for the full protocol.

Key principles:

1. **Eval calls real prod `searchAndAnswer({ _debug: true })`** — never re-implements pipeline
2. **Gold chunks defined as patterns**, not UUIDs — survives reindex
3. **Stage attribution** — debug returns `{ raw, subjectFiltered, rerank, diverse, final }` so we can see exactly where gold is lost
4. **Pre-flight validation** — eval refuses to run if any gold pattern resolves to 0 or >1 chunks
