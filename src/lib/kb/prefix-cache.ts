/**
 * Prefix cache — skip regeneration for unchanged chunks.
 * Cache key = hash(chunk_content) + pipeline_version_hash.
 * Pipeline version includes: prompt, validator, scope_rules, dict, l1_model, l2_model.
 */
import { createHash } from 'crypto';
import logger from '@/lib/shared/logger';

export interface PipelineVersion {
  prompt: string;
  validator: string;
  scope_rules: string;
  dict: number;
  l1_model: string;
  l2_model: string;
}

let _pipelineVersion: PipelineVersion | null = null;
let _pipelineVersionHash: string | null = null;

/** Load pipeline version from DB config. */
export async function loadPipelineVersion(): Promise<PipelineVersion> {
  if (_pipelineVersion) return _pipelineVersion;
  const { getServerDb } = await import('@/lib/shared/db-server');
  const db = getServerDb();
  const { data } = await db.from('kb_pipeline_config').select('value').eq('key', 'pipeline_version').single();
  _pipelineVersion = (data?.value as PipelineVersion) || {
    prompt: 'v1', validator: 'v1', scope_rules: 'v1', dict: 1,
    l1_model: 'gemini-2.0-flash-lite', l2_model: 'claude-haiku-4-5-20251001',
  };
  _pipelineVersionHash = createHash('md5').update(JSON.stringify(_pipelineVersion)).digest('hex').slice(0, 8);
  return _pipelineVersion;
}

/** Get short hash of current pipeline version. */
export async function getPipelineVersionHash(): Promise<string> {
  if (_pipelineVersionHash) return _pipelineVersionHash;
  await loadPipelineVersion();
  return _pipelineVersionHash!;
}

/** Compute cache key for a chunk. */
export function computeCacheKey(chunkContent: string, pipelineHash: string): string {
  const contentHash = createHash('md5').update(chunkContent).digest('hex').slice(0, 12);
  return `${contentHash}_${pipelineHash}`;
}

/**
 * Check if chunk already has a valid cached prefix.
 * Returns true if chunk's existing prefix was generated with current pipeline version.
 */
export async function isCached(
  chunkContent: string,
  existingPrefix: string | null,
  existingCacheKey: string | null,
): Promise<boolean> {
  if (!existingPrefix || !existingCacheKey) return false;
  const pipelineHash = await getPipelineVersionHash();
  const expectedKey = computeCacheKey(chunkContent, pipelineHash);
  return existingCacheKey === expectedKey;
}

/** Invalidate cache (call after pipeline version change). */
export function invalidatePipelineCache(): void {
  _pipelineVersion = null;
  _pipelineVersionHash = null;
  logger.prod('[kb/prefix-cache] pipeline version cache invalidated');
}
