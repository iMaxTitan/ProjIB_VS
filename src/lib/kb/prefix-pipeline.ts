/**
 * Prefix Pipeline Orchestrator.
 *
 * Decision tree:
 *   1. Pre-enrichment (dict synonyms + rule-based scope) — free
 *   2. L1 Gemini Flash-Lite → JSON prefix
 *   3. Validate (confidence score)
 *   4. PASS → accept | FAIL → retry L1 (1x) | FAIL → L2 Haiku | FAIL → fallback
 *   5. Cache result by chunk_hash + pipeline_version
 */
import logger from '@/lib/shared/logger';
import { findSynonymsForText } from './synonym-lookup';
import { generateL1Prefix } from './prefix-l1';
import { generateL2Prefix, initBatchQuota, canEscalateL2 } from './prefix-l2';
import { validatePrefix, type PrefixJson } from './prefix-validator';
import { computeCacheKey, getPipelineVersionHash } from './prefix-cache';

// ── Types ────────────────────────────────────────────────────────────────────

export interface PrefixResult {
  prefixText: string;
  scope: string;
  searchTerms: string[];
  semanticSummary: string;
  status: 'ok' | 'needs_review' | 'fallback';
  cacheKey: string;
  failureReason?: string;
  failureDetails?: Record<string, unknown>;
  /** Which model produced the final result. */
  model: 'l1' | 'l2' | 'fallback';
  confidence: number;
}

/** Safely coerce value to string array (AI may return string instead of array). */
function toArray(val: unknown): string[] {
  if (Array.isArray(val)) return val.filter((v): v is string => typeof v === 'string');
  if (typeof val === 'string') return val.split(',').map(s => s.trim()).filter(Boolean);
  return [];
}

// ── Pre-enrichment: rule-based scope ─────────────────────────────────────────
//
// APPROACH: AI (Gemini) = primary scope decision. Rules = only TITLE-based high-precision.
// Chunk text patterns disabled — too many false positives (see git history for old version).
// Critic recommendation: "rules only as high-precision signals, not override for weak patterns"

const TITLE_SCOPE_PATTERNS: Array<{ pattern: RegExp; scope: string }> = [
  { pattern: /священнослужител/i, scope: 'specific: священнослужителі' },
  { pattern: /моряк|морськ|судноплав/i, scope: 'specific: моряки' },
  { pattern: /авіаційн|пілот/i, scope: 'specific: авіаційний персонал' },
  { pattern: /спортсмен|олімпійськ/i, scope: 'specific: спортсмени' },
  { pattern: /культурн.*діяч|кінематограф/i, scope: 'specific: культурні діячі' },
];

/* ── OLD chunk-text scope engine (disabled — too many FP on large legal docs)
 *
 * const SPECIFIC_SCOPE_PATTERNS = TITLE_SCOPE_PATTERNS;
 * const EXCEPTION_CONTEXT = /крім|за виключенням|за винятком|окрім|не стосується|не поширюється|не застосовується/i;
 *
 * function ruleBasedScope(docTitle, chunkText) {
 *   // Check title
 *   for (const { pattern, scope } of SPECIFIC_SCOPE_PATTERNS) {
 *     if (pattern.test(docTitle.toLowerCase())) return scope;
 *   }
 *   // Check chunk text — but only if NOT in exception context
 *   const textLower = chunkText.toLowerCase();
 *   for (const { pattern, scope } of SPECIFIC_SCOPE_PATTERNS) {
 *     const match = pattern.exec(textLower);
 *     if (!match) continue;
 *     const before = textLower.slice(Math.max(0, match.index - 100), match.index);
 *     if (EXCEPTION_CONTEXT.test(before)) continue;
 *     return scope;
 *   }
 *   return null;
 * }
 * ── END OLD */

function ruleBasedScope(docTitle: string, _chunkText: string): string | null {
  // ONLY check document title — high precision, zero false positives.
  // If title says "бронювання священнослужителів" — it's 100% specific.
  // Chunk text analysis disabled — AI handles it better.
  const titleLower = docTitle.toLowerCase();
  for (const { pattern, scope } of TITLE_SCOPE_PATTERNS) {
    if (pattern.test(titleLower)) return scope;
  }
  return null; // let AI decide
}

// ── Build prefix text from JSON ──────────────────────────────────────────────

function buildPrefixText(json: PrefixJson, dictSynonyms: string[]): string {
  const allTerms = [...new Set([
    ...toArray(json.search_terms),
    ...toArray(json.colloquial_synonyms),
    ...toArray(json.surzhyk),
    ...toArray(json.abbr),
    ...dictSynonyms,
  ])];

  const lines = [
    json.semantic_summary || '',
    allTerms.length > 0 ? `[Пошук: ${allTerms.join(', ')}]` : '',
    json.subject ? `[Стосується: ${json.subject}]` : '',
  ].filter(Boolean);

  return lines.join('\n');
}

// ── Fallback template ────────────────────────────────────────────────────────

function buildFallback(
  chunkText: string, heading: string, dictSynonyms: string[], ruleScope: string | null,
): PrefixResult {
  const summary = heading
    ? `Розділ: ${heading}`
    : chunkText.replace(/\r/g, '').split(/[.\n]/)[0]?.trim().slice(0, 100) || '';
  const searchTerms = dictSynonyms.length > 0 ? dictSynonyms : [];
  const prefixText = [
    summary,
    searchTerms.length > 0 ? `[Пошук: ${searchTerms.join(', ')}]` : '',
  ].filter(Boolean).join('\n');

  return {
    prefixText,
    scope: ruleScope || 'general',
    searchTerms,
    semanticSummary: summary,
    status: 'fallback',
    cacheKey: '',
    failureReason: 'all_models_failed',
    model: 'fallback',
    confidence: 0,
  };
}

// ── Single chunk pipeline ────────────────────────────────────────────────────

const CONCURRENCY = 8;

/**
 * Generate prefix for a single chunk through the full pipeline.
 */
export async function generateChunkPrefix(
  chunkText: string,
  heading: string,
  docTitle: string,
  domain: string,
): Promise<PrefixResult> {
  const pipelineHash = await getPipelineVersionHash();
  const cacheKey = computeCacheKey(chunkText, pipelineHash);

  // 1. Pre-enrichment
  const dictSynonyms = await findSynonymsForText(chunkText);
  const ruleScope = ruleBasedScope(docTitle, chunkText);

  // 2. L1 (Gemini Flash-Lite)
  const l1 = await generateL1Prefix(chunkText, heading, docTitle, dictSynonyms);

  if (l1.json) {
    // Merge dict synonyms into AI result
    if (dictSynonyms.length > 0) {
      l1.json.colloquial_synonyms = [...new Set([...toArray(l1.json.colloquial_synonyms), ...dictSynonyms])];
    }

    // 3. Validate
    const v1 = await validatePrefix(l1.json, dictSynonyms, ruleScope, domain);

    if (v1.valid) {
      // PASS — accept L1
      return {
        prefixText: buildPrefixText(l1.json, dictSynonyms),
        scope: l1.json.scope || 'general',
        searchTerms: [...new Set([...toArray(l1.json.search_terms), ...dictSynonyms])],
        semanticSummary: l1.json.semantic_summary || '',
        status: 'ok',
        cacheKey,
        model: 'l1',
        confidence: v1.confidence,
      };
    }

    // 4. Retry L1 once with error hint (skip if forceL2)
    if (!v1.forceL2 && v1.retryHint) {
      const l1retry = await generateL1Prefix(chunkText, heading, docTitle, dictSynonyms, v1.retryHint);
      if (l1retry.json) {
        if (dictSynonyms.length > 0) {
          l1retry.json.colloquial_synonyms = [...new Set([...toArray(l1retry.json.colloquial_synonyms), ...dictSynonyms])];
        }
        const v2 = await validatePrefix(l1retry.json, dictSynonyms, ruleScope, domain);
        if (v2.valid) {
          return {
            prefixText: buildPrefixText(l1retry.json, dictSynonyms),
            scope: l1retry.json.scope || 'general',
            searchTerms: [...new Set([...toArray(l1retry.json.search_terms), ...dictSynonyms])],
            semanticSummary: l1retry.json.semantic_summary || '',
            status: 'ok',
            cacheKey,
            model: 'l1',
            confidence: v2.confidence,
          };
        }
      }
    }

    // 5. Escalate to L2 (Haiku)
    if (await canEscalateL2(domain)) {
      const v1errors = v1.errors;
      const l2 = await generateL2Prefix(chunkText, heading, docTitle, dictSynonyms, v1errors, domain);
      if (l2.json) {
        if (dictSynonyms.length > 0) {
          l2.json.colloquial_synonyms = [...new Set([...toArray(l2.json.colloquial_synonyms), ...dictSynonyms])];
        }
        const v3 = await validatePrefix(l2.json, dictSynonyms, ruleScope, domain);
        return {
          prefixText: buildPrefixText(l2.json, dictSynonyms),
          scope: l2.json.scope || 'general',
          searchTerms: [...new Set([...toArray(l2.json.search_terms), ...dictSynonyms])],
          semanticSummary: l2.json.semantic_summary || '',
          status: v3.valid ? 'ok' : 'needs_review',
          cacheKey,
          model: 'l2',
          confidence: v3.confidence,
          failureReason: v3.valid ? undefined : 'l2_validation_failed',
          failureDetails: v3.valid ? undefined : { errors: v3.errors },
        };
      }
    }
  }

  // 5b. L1 completely failed (null) — escalate to L2 directly
  if (!l1.json && await canEscalateL2(domain)) {
    logger.prod('[kb/prefix-pipeline] L1 null → escalating to L2');
    const l2 = await generateL2Prefix(chunkText, heading, docTitle, dictSynonyms, ['L1 returned no result'], domain);
    if (l2.json) {
      if (dictSynonyms.length > 0) {
        l2.json.colloquial_synonyms = [...new Set([...toArray(l2.json.colloquial_synonyms), ...dictSynonyms])];
      }
      const v = await validatePrefix(l2.json, dictSynonyms, ruleScope, domain);
      return {
        prefixText: buildPrefixText(l2.json, dictSynonyms),
        scope: l2.json.scope || 'general',
        searchTerms: [...new Set([...toArray(l2.json.search_terms), ...dictSynonyms])],
        semanticSummary: l2.json.semantic_summary || '',
        status: v.valid ? 'ok' : 'needs_review',
        cacheKey,
        model: 'l2',
        confidence: v.confidence,
        failureReason: v.valid ? undefined : 'l2_validation_failed',
        failureDetails: v.valid ? undefined : { errors: v.errors },
      };
    }
  }

  // 6. Fallback — use needs_review with deterministic scope if available
  const fb = buildFallback(chunkText, heading, dictSynonyms, ruleScope);
  // If we have rule-based scope, use needs_review (recoverable) instead of fallback (lost)
  if (ruleScope) {
    fb.status = 'needs_review';
    fb.scope = ruleScope;
    logger.warn('[kb/prefix-pipeline] needs_review (rule-scope):', ruleScope.slice(0, 30), heading?.slice(0, 30));
  } else {
    logger.warn('[kb/prefix-pipeline] fallback:', heading?.slice(0, 40) || chunkText.slice(0, 40));
  }
  return fb;
}

// ── Batch generation for a document ──────────────────────────────────────────

// ── TOC builder (moved from contextual-prefix.ts) ──────────────────────────

const MAX_TOC_CHARS = 1500;

export function buildTocSummary(chunks: Array<{ heading: string; content: string }>): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  let totalChars = 'Структура документа:\n'.length;
  for (const chunk of chunks) {
    const h = chunk.heading?.trim();
    if (!h || seen.has(h)) continue;
    seen.add(h);
    const shortH = h.length > 80 ? h.slice(0, 77) + '…' : h;
    const first = chunk.content.replace(/\r/g, '').split(/[.\n]/)[0]?.trim() || '';
    const sentence = first.length > 80 ? first.slice(0, 77) + '…' : first;
    const line = sentence ? `• ${shortH}\n  → ${sentence}` : `• ${shortH}`;
    if (totalChars + line.length + 1 > MAX_TOC_CHARS) break;
    lines.push(line);
    totalChars += line.length + 1;
  }
  return lines.length > 0 ? 'Структура документа:\n' + lines.join('\n') : '';
}

/**
 * Generate prefixes for all chunks of a document.
 */
export async function generatePrefixes(
  docTitle: string,
  domain: string,
  chunks: Array<{ heading: string; content: string }>,
): Promise<PrefixResult[]> {
  initBatchQuota(domain, chunks.length);
  const results: PrefixResult[] = new Array(chunks.length);

  for (let batch = 0; batch < chunks.length; batch += CONCURRENCY) {
    const slice = chunks.slice(batch, batch + CONCURRENCY);
    const batchResults = await Promise.all(
      slice.map(c => generateChunkPrefix(c.content, c.heading, docTitle, domain)),
    );
    for (let j = 0; j < batchResults.length; j++) {
      results[batch + j] = batchResults[j];
    }
    if (batch + CONCURRENCY < chunks.length) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  const stats = { ok: 0, review: 0, fallback: 0, l1: 0, l2: 0 };
  for (const r of results) {
    if (r.status === 'ok') stats.ok++;
    else if (r.status === 'needs_review') stats.review++;
    else stats.fallback++;
    if (r.model === 'l1') stats.l1++;
    else if (r.model === 'l2') stats.l2++;
  }
  logger.prod('[kb/prefix-pipeline]', docTitle.slice(0, 40),
    `ok=${stats.ok} review=${stats.review} fallback=${stats.fallback} l1=${stats.l1} l2=${stats.l2}`);

  return results;
}
