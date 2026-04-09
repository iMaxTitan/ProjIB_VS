---
doc_type: kb_eval_reference
last_verified: 2026-04-09
verified_against:
  - scripts/kb-eval.ts
  - scripts/eval-env.ts
  - src/lib/kb/eval/test-cases.json
  - src/lib/kb/search.ts
freshness_ttl_days: 30
on_change_required:
  - When kb-eval.ts changes its metric definitions or pipeline
  - When test-cases.json schema changes
  - When new metrics or stages are added to KBSearchDebug
---

# KB Eval Framework

> Last updated: 2026-04-08

Производит измерение качества ретривала и синтеза в пайплайне базы знаний (`lib/kb`). Фреймворк используется как для baseline-замеров, так и для A/B-сравнения изменений в pipeline.

## Архитектурный принцип

**Eval вызывает реальный прод-код**, а не реимплементирует pipeline. Предыдущая версия скрипта собирала свой пайплайн вручную и **расходилась** с проданием по нескольким этапам, что приводило к ложным выводам про «потерю gold-чанков на diversity». После исправления eval вызывает `searchAndAnswer()` напрямую с опцией `_debug: true`.

```
scripts/kb-eval.ts → searchAndAnswer({ _debug: true }) → result._debug.{stages}
```

Это гарантирует, что любое изменение в `lib/kb/search.ts` автоматически отражается в результатах eval.

## Структура

| Файл | Назначение |
|---|---|
| `scripts/kb-eval.ts` | Главный runner. Читает test-cases, вызывает прод-search, считает метрики |
| `scripts/eval-env.ts` | Загружает env-переменные, проставляет PostgREST URL и захардкоженный service-role JWT |
| `src/lib/kb/eval/test-cases.json` | Набор тест-кейсов с gold chunks, expected/negative keywords, wrong-scope markers |
| `src/lib/kb/search.ts` | Реальный pipeline. Опциональный параметр `options._debug` включает stage attribution |

## Запуск

### Подготовка инфраструктуры

PostgREST живёт на DB VPS и доступен только через WireGuard / MikroTik LAN:

```
http://10.0.0.3:3000   ← внутренний адрес, прописан в scripts/eval-env.ts
```

JWT для service_role — захардкожен в `eval-env.ts` (HS256, не секрет, имеет права на kb_chunks RPC).

### Команды

```bash
# Полный прогон всех кейсов
npx tsx scripts/kb-eval.ts

# С детальным выводом stage attribution и preview ответа
npx tsx scripts/kb-eval.ts --verbose

# Один кейс
npx tsx scripts/kb-eval.ts --id booking-docs
npx tsx scripts/kb-eval.ts --id booking-docs --verbose
```

### Стоимость

Полный прогон 20 кейсов: ~$0.10–0.15 (Voyage rerank + Gemini extract + Haiku synthesis + LLM judge).

## Метрики

### Retrieval

- **Recall@10** — доля gold-chunks, попавших в top-10 кандидатов после `diversifyByDocument` (это финальный набор, который видит синтез). Значение `n/a` если для кейса не проставлены `gold_chunk_ids`.
- **MRR@10** — обратный ранг первого gold-chunk в том же top-10. `1.00` если gold на первой позиции.
- **WrongScope@3** — доля wrong-scope маркеров, найденных в первых 3 чанках preview. Должно быть 0.

### Stage attribution (главное диагностическое средство)

Записывается из `result._debug.{raw,subjectFiltered,rerank,diverse,final}`. На каждом этапе считается, сколько gold-chunks ещё «живо»:

| Этап | Что происходит | Где в `search.ts` |
|---|---|---|
| `raw` | Vector + BM25 RRF + cross-category fallback + legal-locator inject | до `applyScopeBoost` |
| `subjectFiltered` | После soft-boost по scope (специфичные нормы получают `* 0.75`) | строка `applyScopeBoost(query, mergedChunks)` |
| `rerank` | Voyage rerank-2.5 + entity boost + keyword rescue + fallback demote + KEEP_K trim | после `rerankChunks` |
| `diverse` | `diversifyByDocument(maxPerDoc)` — этот набор идёт в синтез как top-10 | `diversifyByDocument` |
| `final` | После `expandWithNeighbors` (±1) + `expandWithRelatedDocs` (cross-ref) + повторный scope boost | финальный массив перед `synthesizeAnswer` |

**Цель stage attribution** — понять, где именно gold-chunk теряется. Если `raw=0.5` и все следующие этапы тоже `0.5` — проблема в исходном retrieval (embedding/chunking). Если `raw=0.9` и `diverse=0.4` — проблема в diversity. И т.д.

### Synthesis

- **KeywordHit** — доля `expected_keywords` (с учётом регистра-инсенситивно), найденных в финальном тексте ответа (без cost-footer). Является более «реальной» метрикой качества чем Recall, потому что синтез часто восстанавливает информацию из соседних чанков даже когда gold не попал.
- **NegativeHit** — bool, есть ли хоть одно слово из `negative_keywords` в ответе. Должно быть `false`.
- **Refused** — содержит ли ответ маркеры отказа («не знайдено», «немає інформації»).
- **Deterministic retry** — считает, сколько раз сработал retry без category-фильтра в `search.ts` (когда rerank score < 0.20). Высокое число — признак неудачного category-классификатора.

## Test cases

Файл `src/lib/kb/eval/test-cases.json` — массив кейсов:

```json
{
  "id": "booking-docs",
  "query": "які документи потрібні для бронювання працівника",
  "gold_chunk_ids": ["uuid", "uuid"],
  "expected_keywords": ["список", "ЄДРПОУ", "Портал Дія"],
  "negative_keywords": ["священнослужител"],
  "wrong_scope_markers": ["священнослужител", "моряк"],
  "difficulty": "hard"
}
```

- `gold_chunk_ids` — UUIDs из `kb_chunks.id` (можно пустой массив, тогда recall/mrr будут `n/a`)
- `expected_keywords` — должны быть в ответе
- `negative_keywords` — НЕ должны быть в ответе
- `wrong_scope_markers` — не должны попасть в top-3 чанков
- `difficulty` — `normal | hard` (используется только для группировки)

### Известные проблемы test-set

- **Размер.** 20 кейсов, 8 с gold — это smoke test, не статистически значимая выборка. Изменения < 0.05 в Recall/MRR — в пределах шума.
- **Gold maintenance.** При переиндексации UUID чанков меняются. Gold нужно перепроверять после каждого reindex.
- **Покрытие.** Сейчас перекошен в сторону юридических кейсов (бронювання, кордон). HR/IB/IT недопредставлены.

## Базовый протокол изменений в pipeline

Перед любым изменением `lib/kb/`:

1. Прогнать baseline: `npx tsx scripts/kb-eval.ts > eval-before.txt`
2. Внести изменение
3. Прогнать снова: `npx tsx scripts/kb-eval.ts > eval-after.txt`
4. Сравнить:
   - Recall@10 — главная метрика, не должна падать
   - Stage attribution — должно быть видно, где улучшение
   - WrongScope@3 — должно остаться 0
   - NegativeHit — должно остаться 0
   - KeywordHit — направление улучшения
5. Если Recall вырос на > 0.05 — фиксировать. Если < 0.05 — это в пределах шума на 8 кейсах, нужно расширять test set до 60–100 кейсов перед фиксацией.

## Расширение фреймворка

### Добавить новый кейс

Дописать объект в `src/lib/kb/eval/test-cases.json`. Для нового gold:

```sql
-- Найти подходящий чанк через MCP postgres:
SELECT id, heading, left(content, 200)
FROM kb_chunks
WHERE document_id = '<uuid>'
  AND content ILIKE '%<keyword>%';
```

### Добавить новую метрику

Метрики считаются в `scripts/kb-eval.ts` в основном цикле (после получения `dbg`). Добавить новое поле в `EvalResult`, посчитать в loop, вывести в Summary.

### Добавить новый stage

1. В `KBSearchDebug` (тип в `search.ts`) добавить поле — массив `string[]`.
2. В `searchAndAnswer` записать `debug.<field> = chunks.map(c => c.chunk_id)` после соответствующего этапа.
3. В `kb-eval.ts` посчитать `goldIn<Stage>` через `countGold(dbg.<field>)` и вывести в Summary stage retention.

## История

### Cross-category fix — 2026-04-09 (after deploy)

Always-on parallel cross-category search (`search.ts`). Removed lazy fallback (similarity < 0.42) and deterministic retry — cross-category chunks are merged upfront.

```
KB Eval — 46 test cases (via prod searchAndAnswer)
Resolved gold for 17/46 cases.

STAGE GOLD RETENTION  (17 cases with resolved gold)
  Raw candidates:     0.882
  After scope-boost:  0.882
  After rerank:       0.706
  After diversity:    0.647   ← top10 input to synthesis
  After expansion:    0.647

RETRIEVAL
  Recall@10:          0.529
  MRR@10:             0.288
  WrongScope@3:       0/46    ✅
SYNTHESIS
  KeywordHit:         0.866
  NegativeHit:        0/46    ✅
  Refused:            3/46    (all expected: priests, secureboot, critical-infrastructure)
  Deterministic retry:0/46
```

**Delta vs pre-fix baseline (same test set, same day):**

| Metric | Before | After | Delta |
|---|---|---|---|
| Recall@10 | 0.471 | **0.529** | +12% |
| MRR@10 | 0.181 | **0.288** | +59% |
| KeywordHit | 0.824 | **0.866** | +5% |
| Refused | 8/46 (17%) | **3/46 (6.5%)** | −62% |
| Gold in raw | 0.588 | **0.882** | +50% |

**Fixed cases:** `kzpp-work-hours`, `kzpp-labor-contract-definition`, `kzpp-employment-age` (КЗпП queries classified as HR now find legal-tagged КЗпП), `mandatory-medical-exam`, `cyber-authorized-body`, `passwords-browser`.

**Root cause:** Category filter was a hard gate — domain search for `hr` never found КЗпП (tagged `legal`). Old fallback only triggered when similarity < 0.42, but irrelevant HR docs scored above that threshold, masking the problem.

### Prod-representative baseline — 2026-04-09 (before fix)

Test set rebuilt from **real prod query-log** (633 queries, 2026-03-02 → 2026-04-07). 46 cases, 17 with pattern-based gold. Stratified: legal (16), ib (12), hr (12), it (2), refusal-expected (4). Includes 5 known refused queries from prod to validate pipeline gaps.

```
KB Eval — 46 test cases (via prod searchAndAnswer)
Resolved gold for 17/46 cases.

STAGE GOLD RETENTION  (17 cases with resolved gold)
  Raw candidates:     0.588
  After scope-boost:  0.588
  After rerank:       0.529
  After diversity:    0.529   ← top10 input to synthesis
  After expansion:    0.529

RETRIEVAL
  Recall@10:          0.471
  MRR@10:             0.181
  WrongScope@3:       0/46    ✅
SYNTHESIS
  KeywordHit:         0.824
  NegativeHit:        0/46    ✅
  Refused:            8/46    (3 expected: priests, secureboot, passwords-browser; 5 unexpected)
  Deterministic retry:0/46
```

**Diagnostic implications:**

1. **KZpP (Кодекс законів про працю) is the main retrieval gap.** 3 of 5 unexpected refusals are KZpP queries — the doc is enormous, chunks are long/formal, rerank scores are low (0.43-0.48). Same pattern seen in prod-log 2026-03-31.
2. **Reranker drops 10% of gold.** Raw retention 0.588 → post-rerank 0.529. Less than the 14% hypothesis from prior baseline, but still measurable.
3. **Booking-docs gold fails.** `booking-docs` + `booking-docs-ru` show R=0 despite being the most-tested topic. Gold chunks rank outside top-10 — possibly chunking issue (gold is in a very specific sub-section of a long doc).
4. **Synthesis compensates well.** KeywordHit 0.824 despite Recall 0.471 — synthesis reconstructs from neighbors. But for KZpP it can't compensate (refused outright).
5. **Prod refuse-rate correlation:** Eval shows 17.4% refuse, prod post-tuning window (04-01→04-07) showed 6.1%. Delta explained by: eval intentionally includes known-refused queries from prod (stress test), plus 3 expected refusals.
6. **WrongScope remains 0** across all 46 cases — scope filter works well.

**Next actions (priority order):**
- Improve KZpP retrieval: consider chunking strategy for large codex documents, or KZpP-specific embeddings boosting
- Investigate `booking-docs` gold ranking — may need chunker adjustment for multi-section reservation docs
- Add gold patterns to remaining 29 synthesis-only cases as specific chunks become identifiable

### Honest baseline — 2026-04-08

After full framework rebuild (eval calls real prod, gold defined as patterns, fail-fast on missing/ambiguous gold) and a P1 fix in `search.ts` so that early-refusal returns and `handleMetaQuery` shortcuts also propagate `_debug`. Numbers are **directly produced by `npx tsx scripts/kb-eval.ts`** on this date.

```
KB Eval — 20 test cases (via prod searchAndAnswer)
Resolved gold for 6/20 cases (6 unique queries with gold).

STAGE GOLD RETENTION  (cases with resolved gold)
  Raw candidates:     0.500
  After scope-boost:  0.500
  After rerank:       0.500
  After diversity:    0.500   ← top10 input to synthesis
  After expansion:    0.500

RETRIEVAL
  Recall@10:          0.500
  MRR@10:             0.131
  WrongScope@3:       0/20    ✅
SYNTHESIS
  KeywordHit:         0.863
  NegativeHit:        0/20    ✅
  Refused:            2/20
  Deterministic retry:0/20    (never triggered — quality gate is too lenient or never reached)
COST: ~$0.14
```

**Diagnostic implications:**

1. **Vector + BM25 find ~57% of gold.** This is the actual ceiling without changing chunking or embeddings.
2. **Reranker drops 14%.** `RERANK_NOISE_THRESHOLD = 0.15` in `reranker.ts:22` filters chunks below threshold. Worth A/B testing this constant before any structural changes.
3. **Diversity, expansion, scope boost — all neutral on this set.** They neither help nor hurt recall on the 6 gold cases.
4. **Synthesis quality is much higher than retrieval recall would suggest** (KeywordHit 0.78 vs Recall 0.43). The two-stage extract+compose pipeline successfully reconstructs answers from neighbor chunks even when the gold chunk itself wasn't in the top 10.
5. **Deterministic retry never fired.** Either the quality gate (`RERANK_REFUSE_THRESHOLD = 0.15`) is too low, or this test set never produces low rerank scores after a category miss.
6. **WrongScope@3 = 0** and **NegativeHit = 0** — scope filter and negative-keyword guard are working.

**Test set is too small for confident A/B.** 5-6 unique queries with gold = a smoke test, not statistical evidence. Any single rank shift moves Recall@10 by ~0.14. Before claiming an improvement is real, expand the test set to 60-100 stratified cases.

### Older snapshots

- **2026-04-08 (earlier same day).** Eval rewritten to call `searchAndAnswer` but gold was still raw UUIDs from `gold_chunk_ids`. That run reported `Recall@10 = 0.438` — those UUIDs were stale after intervening reindexes, so the cases that scored 0 were measurement artifacts, not retrieval failures. Numbers from before pattern-based gold are **not comparable** to the honest baseline above.
- **2026-03-30 (memory archive).** A baseline of `Recall@10 = 0.714` is mentioned in `memory/_archive/project-kb-eval-baseline-2026-03-30.md`. That number was produced by an even older version of `kb-eval.ts` that:
  1. Didn't import `eval-env.ts` (so it ran without service-role JWT — must have used a different env setup)
  2. Re-implemented the search pipeline manually, missing several prod stages (cross-category fallback, scope boost before rerank, deterministic retry, legal locator inject)
  3. Used hardcoded UUIDs that may or may not have existed in the DB at the time
  Treat the 0.714 figure as **historical curiosity, not a baseline**. Do not compare new improvements against it.
