# Knowledge Base — RAG Pipeline

> Опис того як працює індексація та пошук документів у корпоративній базі знань.

---

## Огляд

```
ІНДЕКСАЦІЯ:  .docx → mammoth → markdown-text → chunk → embed → Supabase
ПОШУК:       запит → multi-query (2-3 ракурси) → embed batch → parallel hybrid search → merge → rerank → AI-відповідь
```

Система використовує **Contextual Retrieval** — кожен чанк при embedding збагачується
контекстом (категорія → документ → розділ), але в БД зберігається тільки чистий текст.

---

## Індексація (processDocument)

### Формат
Підтримується тільки **`.docx`** (Microsoft Word з правильними стилями Heading).
PDF і `.doc` в KB не підтримуються.

### Кроки

```
1. parseDOCX(buffer)
   mammoth.convertToHtml() зі style mapping:
     Heading 1 / Заголовок 1  → <h1>  → "# Назва розділу"
     Heading 2 / Заголовок 2  → <h2>  → "## Підрозділ"
     Heading 3 / Заголовок 3  → <h3>  → "### Пункт"
     TOC 1-3 / Зміст 1-3      → !     (виключаються, case-insensitive)
   Bold heading fallback: якщо немає <h1>/<h2>/<h3> →
     detectBoldHeadings() конвертує <p><strong>text</strong></p> → <h1>/<h2>
     (≤120 символів, не sentence, X.Y → h2)
   htmlToText() → markdown-style plain text

2. preprocessText(rawText)
   Прибирає: штампи затвердження (СТВЕРДЖУЮ, ПОГОДЖУЮ, УЗГОДЖЕНО, ВВЕДЕНО В ДІЮ),
   рядки підписів, номери сторінок, надлишкові переноси

3. chunkDocument(fullText)
   Стратегія: секції по isHeadingLine (# / ## / ### / 1. / 1.1 )
   MAX_TOKENS = 450, OVERLAP = 50 tokens
   Таблиці: зберігаються цілком або розбиваються по рядках з дублюванням шапки
   Фільтр: MIN_CHUNK_TOKENS = 30, виключаються TOC-чанки

4. buildContextualContent(category, title, heading, content)
   "Категорія: X.\nДокумент: «Y».\nРозділ: Z.\n\n{content}"
   → використовується ТІЛЬКИ для embedding (не зберігається в БД)

5. embedBatch(contextualContents)
   Voyage voyage-4-large (1024d via Matryoshka), input_type=document, batch 100, HNSW index

6. INSERT kb_chunks (content, embedding, heading, token_count)
   UPDATE kb_documents (status='ready', chunk_count, content[100K])
```

### Ключові файли
- [src/lib/kb/processor.ts](../src/lib/kb/processor.ts) — парсинг + pipeline
- [src/lib/kb/chunker.ts](../src/lib/kb/chunker.ts) — стратегія чанкування
- [src/lib/kb/embedder.ts](../src/lib/kb/embedder.ts) — Voyage embeddings (voyage-4-large docs / voyage-4-lite queries, 1024d)
- [src/app/api/kb/documents/route.ts](../src/app/api/kb/documents/route.ts) — upload API

---

## Пошук (searchAndAnswer)

```
1. Отримати запит (текст питання)

2. Multi-Query Rewriting (GPT-4o-mini, generateMultiQueries)
   Генерує 2-3 пошукові запити з різних ракурсів:
   — конкретний (зберігає назви ПЗ, сервісів)
   — узагальнений (процедурний/нормативний термін)
   — альтернативний ракурс (якщо є сенс)
   Приклад: "установить Teams" →
     ["встановити Microsoft Teams на робочу станцію",
      "встановлення програмного забезпечення на робочу станцію",
      "базовий набір ПЗ робочого місця"]
   Fallback: translateAndExpand() (одиночний запит) при помилці API.

3. Batch Embed (Voyage voyage-4-lite, 1024d Matryoshka, input_type=query)
   Всі 2-3 підзапити за один API виклик (embedBatchQueries).

4. Parallel Hybrid Search: match_kb_documents RPC × N підзапитів (паралельно)
   vector:   cosine similarity (pgvector <=>)
   BM25:     ts_rank(fts, to_tsquery('russian', query)) з OR-семантикою
   fusion:   RRF (Reciprocal Rank Fusion, k=60)
   match_count: 20 чанків на підзапит
   threshold: 0.30

5. Merge & Deduplicate
   Об'єднання результатів усіх підзапитів по chunk_id (max similarity).
   Fallback: якщо merged пустий → один пошук з threshold 0.20.

6. Quality gate: topScore < 0.30 → повернути "не знайдено" (без синтезу)

7. Rerank (Voyage rerank-2.5 cross-encoder, top 5)
   Використовує ОРИГІНАЛЬНИЙ запит (не перекладений) — для збереження специфіки.
   Graceful fallback якщо VOYAGE_API_KEY не встановлено.

8. Context expansion: ±1 сусідні чанки з тієї ж секції документа.

9. AI-відповідь (Claude Haiku claude-haiku-4-5-20251001)
   System prompt: відповідай ТІЛЬКИ на основі фрагментів, category-specific суфікси
   Вхід: XML <fragment> теги з document/section атрибутами, max 6 чанків × 1200 символів
   Post-validation: stripHallucinatedParagraphs() — видаляє параграфи з ознаками галюцинацій
   maxTokens: 2400
   Footer: "🤖 claude-haiku-4-5 · ↑N ↓N · $X.XXXXX"
```

### Чому Multi-Query?

Одиночна переформулювання запиту втрачає recall: "встановити Teams" узагальнюється до
"встановлення ПЗ" і знаходить лише процедурні чанки, але не таблицю базового набору ПЗ
де Teams вже є. Multi-Query покриває різні ракурси одночасно.

### Альтернатива: Agentic RAG

Якщо Multi-Query буде недостатньо — наступний крок: **Agentic RAG** (LLM самостійно
вирішує, чи потрібен допошук або уточнення запиту). Складніший у реалізації, але дає
максимальну гнучкість для складних/багатокрокових запитів.

### Ключові файли
- [src/lib/kb/search.ts](../src/lib/kb/search.ts) — searchAndAnswer(), runMultiSearch()
- [src/lib/kb/query-translator.ts](../src/lib/kb/query-translator.ts) — generateMultiQueries(), translateAndExpand() (fallback)
- [src/lib/kb/embedder.ts](../src/lib/kb/embedder.ts) — embedBatchQueries()
- [src/lib/kb/reranker.ts](../src/lib/kb/reranker.ts) — Voyage rerank-2.5
- [src/lib/kb/bot-adapter.ts](../src/lib/kb/bot-adapter.ts) — інтеграція з ботом (kbSearchTool)

---

## Валідація перед індексацією

Окремий endpoint `POST /api/kb/validate` — перевіряє документ НЕ індексуючи його.

```
validator.ts:
  1. parseDOCX → raw text (той самий парсер що й при індексації)
  2. extractMetadata → docType, docNumber, docDate, version, approver
  3. detectArtifacts → approvalStamps, signatureLines, changelog, toc
  4. preprocessText → cleanedText
  5. computeStats → sectionCount, subsectionCount, tableCount, estimatedChunks
     (використовує chunkDocument() — той самий що й при індексації)
     ВАЖЛИВО: перед підрахунком H1/H2 зрізати '#' маркери (.replace(/^#+\s*/, ''))
  6. runChecks → ValidationCheck[] (структурні перевірки по Document Guide v2)
     Тонкі розділи: рахує речення (. ! ?) + елементи списків (; :)
     Мова: якщо 'mixed' — findRussianWords() показує конкретні слова з рос. символами
  7. getAIAnalysis → AIAnalysis (3 семантичні + fixInstructions через Claude Haiku)
     Текст для AI: перші 12 000 символів (щоб уникнути таймауту на великих доках)
     Таймаут: 60 секунд
     Глосарій: якщо документ посилається на зовнішній Глосарій — abbreviations = ok
```

### Document Guide v2 — вимоги до документа

Повний гайд: [`docs/Document_Guide_v2.md`](./Document_Guide_v2.md)

| Перевірка | Тип | Умова |
|---|---|---|
| Метадані | warning | Відсутні: тип, №, дата, версія, хто затвердив |
| Заголовки H1 | error | Немає жодного |
| Word Heading стилі | warning | Заголовки знайдено через bold-евристику, а не Word стилі |
| Мінімальний обсяг | error | < 300 слів |
| Порожні розділи | error | Секції з текстом < 50 символів |
| Підрозділи H2 | warning | Відсутні при ≥ 3 розділах |
| Тонкі розділи | warning | < 3 речень/пунктів у розділі |
| Абревіатури | warning | > 2 нерозшифрованих (OK якщо глосарій/перелік скорочень) |
| Мова | warning | Змішана — показує конкретні слова з рос. символами (ы ъ э ё) |
| Шапка таблиці | warning | Таблиця без header row |
| Якість таблиць | warning | Заповненість < 30% |
| Самодостатність | warning | «як зазначено вище», «див. п.», «Додаток А», «Таблиця 1» |
| Абревіатури (AI) | warning (AI) | Семантична перевірка абревіатур |
| Числа в тексті | warning (AI) | Тільки в таблиці, не в тексті |
| Назви таблиць | warning (AI) | «Таблиця N.» відсутня |
| Зміст (TOC) | info | Відсутній при > 5 розділах |
| Як виправити | accordion | AI генерує покрокові інструкції для кожного порушення |

---

## Схема БД

```sql
kb_categories  (id, slug, name, process_id, is_active)
kb_documents   (id, category_id, title, status, chunk_count, content[100K], error_message)
kb_chunks      (id, document_id, chunk_index, content, embedding vector(1024), heading, token_count)

-- Індекси:
idx_kb_chunks_hnsw   ON kb_chunks USING hnsw (embedding vector_cosine_ops) m=16 ef=64
idx_kb_chunks_fts    ON kb_chunks USING gin(to_tsvector('uk', content))

-- RPC:
match_kb_documents(query_embedding, query_text, category_slug, threshold, top_k)
  SECURITY DEFINER  -- обов'язково, інакше RLS блокує рядки
  → vector + BM25 + RRF fusion
```

---

## Налаштування

| Параметр | Значення | Де змінити |
|---|---|---|
| Embedding model | `voyage-4-large` (docs) / `voyage-4-lite` (queries), 1024d Matryoshka | `embedder.ts` |
| AI model | `claude-haiku-4-5-20251001` | `search.ts` |
| Chunk size | 450 tokens (~180 укр. слів, 1125 chars) | `chunker.ts` MAX_TOKENS + CHARS_PER_TOKEN=2.5 |
| Chunk overlap | 50 tokens | `chunker.ts` OVERLAP_TOKENS |
| Min chunk | 30 tokens | `chunker.ts` MIN_CHUNK_TOKENS |
| Vector threshold | 0.30 (multi-query), 0.20 (fallback) | `search.ts` |
| Quality gate | 0.30 (нижче → без синтезу) | `search.ts` |
| Multi-query count | 2-3 підзапити (GPT-4o-mini) | `query-translator.ts` |
| HNSW m | 16, ef_construction=64 | міграція БД |
| `hnsw.ef_search` | 100 (SET LOCAL в RPC) | `match_kb_documents` |
| Embedding format | `[${arr.join(',')}]` string | `search.ts` — Supabase RPC вимагає рядок |
| AI text limit (validator) | 12 000 символів | `validator.ts` AI_TEXT_LIMIT |

---

## Важливі деталі

**SECURITY DEFINER на RPC** — обов'язково. Без нього `authenticated` роль в plpgsql
виконується під звичайним RLS і не бачить жодного рядка навіть при service_role клієнті.

**Embedding format** — в RPC передавати як рядок `[0.1,0.2,...]`, не як JS array.

**Contextual prefix не зберігається** — в `kb_chunks.content` чистий текст чанку.
Контекстний префікс (категорія → документ → розділ) будується лише для embedding.

**Heading у DB** — `#` / `##` / `###` префікси прибираються перед збереженням
(`buildContextualContent` робить `heading.replace(/^#+\s*/, '')`).

**Конкурентний доступ до памʼяті** — `search.ts` зберігає conversation memory в
in-memory Map (одинарний процес). При рестарті pm2 — history скидається.

**Category filter** — якщо бот передає `category: 'ib'`, всі підзапити multi-query
фільтруються по категорії. Fallback (threshold 0.20) також з фільтром.

---

## Tech Debt

| Пункт | Статус | Опис |
|---|---|---|
| Voyage embeddings | ✅ 2026-03-04 | `voyage-4-large`/`voyage-4-lite` (1024d Matryoshka), asymmetric search |
| Chunk tokenization | ✅ 2026-03-02 | `CHARS_PER_TOKEN=2.5`, `MAX_CHARS=1125` для кирилиці |
| `hnsw.ef_search` | ✅ 2026-03-02 | `SET LOCAL hnsw.ef_search = 100` в `match_kb_documents` RPC |
| Conversation memory | ⏳ При потребі | In-memory Map — зламається при PM2 cluster |
| **Реіндексація** | ⚠️ Потрібна | 12 документів в KB треба перезавантажити через UI (старі чанки видалено) |
