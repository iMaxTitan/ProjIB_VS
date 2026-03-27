/**
 * Client for law-fetcher microservice on DB VPS.
 * Proxies requests from App VPS API routes to the microservice.
 */

import logger from '@/lib/shared/logger';

const LAW_FETCHER_URL = process.env.LAW_FETCHER_URL || 'http://10.0.0.3:3100';
const LAW_FETCHER_KEY = process.env.LAW_FETCHER_KEY || '';

if (!LAW_FETCHER_URL) {
  logger.warn('[laws/fetcher-client] LAW_FETCHER_URL not set, using default');
}

interface FetcherOptions {
  timeout?: number;
}

async function fetcherRequest<T>(path: string, body: Record<string, unknown>, opts?: FetcherOptions): Promise<T> {
  if (!LAW_FETCHER_KEY) {
    throw new Error('LAW_FETCHER_KEY is not configured');
  }

  const timeout = opts?.timeout ?? 90_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(`${LAW_FETCHER_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Key': LAW_FETCHER_KEY,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error((err as { error?: string }).error || `law-fetcher ${path} failed: ${res.status}`);
    }

    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LawSearchResult {
  title: string;
  url: string;
  docId: string;
}

export interface LawFetchResult {
  title: string;
  markdown: string;
  lineCount: number;
  charCount: number;
}

export interface LawRelatedResult {
  title: string;
  url: string;
  docType: string;
}

export interface LawCheckUpdateResult {
  lastRevisionDate: string | null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function searchLaws(query: string): Promise<LawSearchResult[]> {
  logger.info(`[laws/fetcher-client] search: ${query}`);
  const data = await fetcherRequest<{ results: LawSearchResult[] }>('/search', { query });
  return data.results;
}

export async function fetchLaw(url: string): Promise<LawFetchResult> {
  logger.info(`[laws/fetcher-client] fetch: ${url}`);
  return fetcherRequest<LawFetchResult>('/fetch', { url }, { timeout: 120_000 });
}

export async function getRelatedLaws(url: string): Promise<LawRelatedResult[]> {
  logger.info(`[laws/fetcher-client] related: ${url}`);
  const data = await fetcherRequest<{ results: LawRelatedResult[] }>('/related', { url });
  return data.results;
}

export async function checkLawUpdate(url: string): Promise<LawCheckUpdateResult> {
  logger.info(`[laws/fetcher-client] check-update: ${url}`);
  return fetcherRequest<LawCheckUpdateResult>('/check-update', { url });
}
