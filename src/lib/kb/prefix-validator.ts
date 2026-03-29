/**
 * Prefix validation — checks AI-generated prefix quality.
 * Confidence score determines accept/retry/escalate decision.
 * Weights loaded from kb_pipeline_config (not hardcoded).
 */
import logger from '@/lib/shared/logger';

// ── Types ────────────────────────────────────────────────────────────────────

export interface PrefixJson {
  scope: string;
  scope_confidence?: number;
  formal_terms: string[];
  colloquial_synonyms: string[];
  surzhyk: string[];
  abbr: string[];
  semantic_summary: string;
  search_terms: string[];
  subject?: string;
}

export interface ValidationResult {
  valid: boolean;
  confidence: number;
  errors: string[];
  /** Specific error for retry prompt. */
  retryHint?: string;
  /** Force escalation to L2 (scope conflict, novel phrase). */
  forceL2: boolean;
}

interface ConfidenceWeights {
  alias: number;
  scope: number;
  format: number;
  dedupe: number;
}

// ── Config cache ─────────────────────────────────────────────────────────────

let _weights: ConfidenceWeights | null = null;
let _surzhykDomains: string[] | null = null;

async function loadConfig(): Promise<void> {
  if (_weights && _surzhykDomains) return;
  const { getServerDb } = await import('@/lib/shared/db-server');
  const db = getServerDb();
  const { data: wData } = await db.from('kb_pipeline_config').select('value').eq('key', 'confidence_weights').single();
  _weights = (wData?.value as ConfidenceWeights) || { alias: 0.4, scope: 0.3, format: 0.2, dedupe: 0.1 };
  const { data: sData } = await db.from('kb_pipeline_config').select('value').eq('key', 'surzhyk_required_domains').single();
  _surzhykDomains = (sData?.value as string[]) || ['hr', 'general', 'it', 'ib'];
}

// ── Validation ───────────────────────────────────────────────────────────────

/**
 * Validate AI-generated prefix JSON.
 * @param prefix - parsed JSON from AI
 * @param knownSynonyms - synonyms from kb_synonym_dict for this chunk
 * @param ruleBasedScope - scope determined by pre-enrichment rules (null if unknown)
 * @param domain - document domain (legal, hr, ib, it, general)
 */
export async function validatePrefix(
  prefix: PrefixJson,
  knownSynonyms: string[],
  ruleBasedScope: string | null,
  domain: string,
): Promise<ValidationResult> {
  await loadConfig();
  const w = _weights!;
  const errors: string[] = [];
  let forceL2 = false;

  // A. Schema check
  let formatScore = 1.0;
  if (!prefix.scope) { errors.push('missing scope'); formatScore -= 0.5; }
  if (!prefix.semantic_summary) { errors.push('missing semantic_summary'); formatScore -= 0.3; }
  if (!Array.isArray(prefix.search_terms) || prefix.search_terms.length === 0) {
    errors.push('empty search_terms'); formatScore -= 0.5;
  }
  if (!Array.isArray(prefix.formal_terms)) { errors.push('missing formal_terms'); formatScore -= 0.2; }

  // B. Alias coverage — check that known synonyms from dict are present
  let aliasCoverage = 1.0;
  if (knownSynonyms.length > 0) {
    const toArr = (v: unknown): string[] => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : typeof v === 'string' ? v.split(',').map(s => s.trim()).filter(Boolean) : [];
    const allTermsLower = [
      ...toArr(prefix.colloquial_synonyms),
      ...toArr(prefix.surzhyk),
      ...toArr(prefix.search_terms),
    ].map(t => t.toLowerCase());
    const covered = knownSynonyms.filter(s => allTermsLower.some(t => t.includes(s.toLowerCase())));
    aliasCoverage = covered.length / knownSynonyms.length;
    if (aliasCoverage < 1.0) {
      const missing = knownSynonyms.filter(s => !allTermsLower.some(t => t.includes(s.toLowerCase())));
      errors.push(`missing aliases: ${missing.slice(0, 3).join(', ')}`);
    }
  }

  // C. Surzhyk check (per-domain)
  let surzhykOk = true;
  if (_surzhykDomains!.includes(domain)) {
    if (!prefix.surzhyk?.length) {
      surzhykOk = false;
      errors.push('no surzhyk variants (required for domain ' + domain + ')');
    }
  }

  // D. Scope agreement
  let scopeScore = 1.0;
  if (ruleBasedScope) {
    const aiScope = prefix.scope?.toLowerCase() || 'general';
    const ruleScope = ruleBasedScope.toLowerCase();
    if (aiScope.startsWith('specific') !== ruleScope.startsWith('specific')) {
      // Conflict: rule says specific, AI says general (or vice versa)
      scopeScore = 0.2;
      errors.push(`scope conflict: rule="${ruleScope}" vs ai="${aiScope}"`);
      forceL2 = true;
    } else if (aiScope !== ruleScope && ruleScope !== 'ambiguous') {
      scopeScore = 0.6;
      errors.push(`scope mismatch: rule="${ruleScope}" vs ai="${aiScope}"`);
    }
  }
  // scope_confidence from AI (if provided)
  if (typeof prefix.scope_confidence === 'number' && prefix.scope_confidence < 0.5) {
    scopeScore *= 0.5;
    errors.push(`low scope_confidence: ${prefix.scope_confidence}`);
    forceL2 = true;
  }

  // E. Dedupe/noise check
  let dedupeScore = 1.0;
  const terms = prefix.search_terms || [];
  const uniqueTerms = new Set(terms.map(t => t.toLowerCase()));
  if (terms.length > 0 && uniqueTerms.size < terms.length * 0.7) {
    dedupeScore = 0.5;
    errors.push('too many duplicate search_terms');
  }

  // Confidence
  const confidence =
    w.alias * aliasCoverage +
    w.scope * scopeScore +
    w.format * formatScore +
    w.dedupe * dedupeScore;

  const valid = errors.length === 0 || (confidence >= 0.75 && !forceL2);

  if (!valid) {
    logger.prod('[kb/prefix-validator] confidence:', confidence.toFixed(2), 'errors:', errors.join('; '));
  }

  // Build retry hint for error-guided prompt
  const retryHint = errors.length > 0 ? errors.slice(0, 2).join('. ') + '.' : undefined;

  return { valid, confidence, errors, retryHint, forceL2 };
}

/** Invalidate config cache. */
export function invalidateValidatorCache(): void {
  _weights = null;
  _surzhykDomains = null;
}
