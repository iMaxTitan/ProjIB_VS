---
doc_type: kb_reindex_protocol
last_verified: 2026-04-08
verified_against:
  - scripts/reindex-all-laws.ts
  - scripts/reindex-one-law.ts
  - scripts/reindex-child-laws.ts
  - scripts/rechunk-internal-docs.ts
  - src/lib/kb/processor.ts
freshness_ttl_days: 60
on_change_required:
  - When a new reindex script is added
  - When chunking strategy changes (chunker.ts MAX_TOKENS / OVERLAP)
  - When embedding model changes
  - When kb_chunks schema changes
---

# KB Reindex Protocol

> What to do **before**, **during**, and **after** any reindex of the corporate Knowledge Base.
> Reindex always changes `kb_chunks.id`, so it WILL break stale references.

---

## When you need a reindex

| Trigger | Scope | Script |
|---|---|---|
| New law published | Single law | `scripts/reindex-one-law.ts` |
| Updated child law (e.g. amendment) | Just the children | `scripts/reindex-child-laws.ts` |
| Embedding model change | All laws | `scripts/reindex-all-laws.ts` |
| Internal policy doc updated | One internal doc | Re-upload via web UI |
| Chunker constants changed (`MAX_TOKENS` etc.) | Everything | `scripts/reindex-all-laws.ts` + re-upload internal docs |
| Contextual prefix template changed | Everything | `scripts/fill-missing-prefixes.ts` (if only prefixes changed) or full reindex |

> Internal policy docs (.docx uploaded via web UI) **cannot** be re-indexed by these
> scripts. They must be re-uploaded manually. There are typically 12-15 of them.

---

## Pre-reindex checklist

1. **Snapshot current eval baseline.**
   ```
   npx tsx scripts/kb-eval.ts > eval-before-reindex.txt
   ```
   Save the file. After reindex you will compare against it.

2. **Verify gold patterns still resolve.**
   ```
   npx tsx scripts/kb-eval.ts --resolve-only
   ```
   Should print `Resolved gold for N/M cases.` with no FAILURES section.
   If there are failures already → fix them BEFORE reindex (you cannot use stale gold as a baseline).

3. **Check disk + API budget.**
   - Voyage embeddings: ~$0.06 per 1M tokens for `voyage-4-large`
   - Gemini Flash-Lite (contextual prefix): ~$0.10 per 1M input tokens, very cheap
   - Claude Haiku (L2 fallback prefix): ~$1 per 1M input tokens
   - A full reindex of all laws (~60 docs, ~9000 chunks) ≈ $0.50-2.00 total

4. **Notify users if prod will be affected.**
   The reindex scripts run against the actual `kb_chunks` table. Search results during
   reindex may be inconsistent (some old chunks deleted, new not yet inserted).

---

## Reindex commands

All scripts must `import './eval-env'` (most already do) so they get the right
PostgREST URL and service-role JWT. You don't need to set env vars manually.

### Single law

```bash
cd C:\Proj\ProjIB_VS
npx tsx scripts/reindex-one-law.ts <law_number>
# example: npx tsx scripts/reindex-one-law.ts 3543-XII
```

What it does:
1. Fetch fresh text from `data.rada.gov.ua` API
2. Post-process to markdown
3. `processFromMarkdown()` → chunking → AI prefixes (L1 Gemini, L2 Haiku) → embedding → INSERT
4. **DELETE old chunks for this document_id** before insert

### All laws

```bash
npx tsx scripts/reindex-all-laws.ts
```

Same as above for every law in the corpus, with `DELAY_BETWEEN_DOCS_MS = 3000` between
documents (rate-limit friendly). Runs ~30-60 minutes for ~60 laws.

> ⚠️ **Skipped by default:** documents in `SKIP_DOC_NUMBERS` (currently the Tax Code,
> ~3099 chunks, ~$5 just for prefixes). Edit the array to include them if needed.

### Child laws only

```bash
npx tsx scripts/reindex-child-laws.ts
```

Only re-imports laws with `parent_doc_id IS NOT NULL` (amendments, sub-acts).

### Internal policies (re-upload via UI)

There is no batch script. For each document:

1. Open `https://maxtitan.me/` → KB section → Documents
2. Find the doc, click "Replace"
3. Upload the new `.docx`
4. Wait for processing to finish (status `ready`)

---

## Post-reindex checklist (mandatory)

Run **all** of these. Skipping any of them means future eval results are unreliable.

### 1. Verify gold pattern resolution

```bash
npx tsx scripts/kb-eval.ts --resolve-only
```

If any gold pattern fails to resolve:
- The reindex changed the chunk structure for that document
- Open `src/lib/kb/eval/test-cases.json`
- Update the affected `gold_match` patterns
- Use `mcp__postgres__query` to find the new chunk:
  ```sql
  SELECT c.id, c.heading, left(c.content, 200)
  FROM kb_chunks c
  JOIN kb_documents d ON d.id = c.document_id
  WHERE d.title ILIKE '%<doc keyword>%'
    AND c.content ILIKE '%<unique phrase>%';
  ```
- Re-run `--resolve-only` until clean

### 2. Run full eval

```bash
npx tsx scripts/kb-eval.ts > eval-after-reindex.txt
```

### 3. Compare to baseline

```bash
diff eval-before-reindex.txt eval-after-reindex.txt
```

Watch for:

| Metric | Acceptable change | Action if exceeded |
|---|---|---|
| `Recall@10` | ±0.05 (noise on 6-7 cases) | If drop > 0.05 → investigate per-case stage attribution |
| `WrongScope@3` | should stay 0 | If non-zero → scope filter regressed |
| `NegativeHit` | should stay 0 | If non-zero → synthesis regressed |
| `Refused` | ±1 | If more refusals → quality gate or category filter regressed |
| Stage retention | each stage ±0.05 | A drop on a specific stage points at a specific bug |

### 4. Spot-check synthesis quality

Pick 2-3 cases manually:
```bash
npx tsx scripts/kb-eval.ts --id booking-docs --verbose
npx tsx scripts/kb-eval.ts --id border-reserved --verbose
```

Read the answer preview. Does it look correct? Cite the right document?

### 5. Update `docs/KB_EVAL_FRAMEWORK.md`

If the new baseline is materially different (not noise), append a new dated section
to the History part of `docs/KB_EVAL_FRAMEWORK.md` with the new numbers and a note
about what reindex caused them.

### 6. Smoke test through the bot

Open Telegram bot, ask 2-3 real questions. Verify the answer cites updated documents
with the right page references. **The bot is the actual user-facing surface — eval
metrics are a proxy, the bot is the ground truth.**

---

## Common failures

### "no chunks match patterns" for many cases at once

**Cause:** the chunker re-cut the document (e.g. after changing `MAX_TOKENS`), so
heading boundaries shifted.

**Fix:** rewrite the affected `gold_match` patterns. Don't try to "match the old chunk
text" — find the new chunk that contains the target information.

### "AMBIGUOUS — N chunks match"

**Cause:** the new chunking is more granular and your heading pattern now hits multiple
sub-chunks.

**Fix:** add more entries to `content_contains` until the match is unique (the resolver
runs `ilike` AND across all `content_contains` strings).

### Recall dropped 0.10 or more

**Likely causes (in order of probability):**
1. Embedding model changed but query model wasn't updated to match (asymmetric search must use matched pair)
2. `RERANK_NOISE_THRESHOLD` is filtering more chunks because rerank scores shifted
3. New chunks are larger and dilute the per-chunk match score
4. Category filter is now mis-classifying the new chunk's domain

**Diagnosis:** run `--verbose` on the worst cases, look at stage attribution. The first
stage where gold disappears is the bug.

### Reindex script crashes mid-run

The scripts are idempotent per-document. If a crash leaves a partial state, just re-run
the script — it will DELETE+INSERT cleanly per `document_id`.

For a full `reindex-all-laws.ts` crash, you can restart it; it starts from the first
doc but skips ones already at `status='ready'`.

---

## What NOT to do after reindex

- ❌ Do NOT update `gold_chunk_ids` UUIDs in `test-cases.json` — that field is gone, replaced by `gold_match` patterns. If you see UUIDs there, the test file is from before 2026-04-08 and was rolled back.
- ❌ Do NOT trust pre-reindex eval numbers for comparison without re-resolving gold first.
- ❌ Do NOT cherry-pick a single passing case as proof everything is fine. Run the full eval.
- ❌ Do NOT skip the bot smoke test. Eval is a proxy; the bot is reality.
- ❌ Do NOT commit new `eval-before/after-*.txt` files to git — they are throwaway artifacts. Add to `.gitignore` if needed.
