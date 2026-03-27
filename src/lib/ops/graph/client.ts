/**
 * Microsoft Graph API client — app-level (client_credentials).
 * Token is cached in-memory for ~55 minutes.
 */

import { fetchWithTimeout } from '@/lib/shared/utils/fetch-with-timeout';
import logger from '@/lib/shared/logger';
import { config } from '@/lib/shared/config';

let tokenCache: { token: string; expires: number } | null = null;

// 429 retry constants
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1500;

export async function getGraphToken(): Promise<string | null> {
  if (tokenCache && Date.now() < tokenCache.expires) return tokenCache.token;

  const tenantId = config.azure.tenantId;
  const clientId = config.azure.clientId;
  const clientSecret = config.azure.clientSecret;

  if (!tenantId || !clientId || !clientSecret) {
    logger.error('[Graph] Missing AZURE_AD env vars');
    return null;
  }

  try {
    const res = await fetchWithTimeout(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret,
          scope: 'https://graph.microsoft.com/.default',
        }).toString(),
      },
      15_000,
    );

    const data = await res.json() as { access_token?: string; expires_in?: number; error?: string };
    if (!data.access_token) {
      logger.error('[Graph] Token error:', data.error);
      return null;
    }

    tokenCache = {
      token: data.access_token,
      expires: Date.now() + ((data.expires_in ?? 3600) - 60) * 1000,
    };
    return tokenCache.token;
  } catch (err) {
    logger.error('[Graph] getGraphToken error:', err);
    return null;
  }
}

export async function graphGet<T>(token: string, url: string): Promise<{ ok: boolean; status: number; data: T | null }> {
  try {
    const res = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${token}` } }, 20_000);
    if (!res.ok) {
      logger.warn(`[Graph] GET ${url.slice(0, 80)} → ${res.status}`);
      return { ok: false, status: res.status, data: null };
    }
    const data = await res.json() as T;
    return { ok: true, status: res.status, data };
  } catch (err) {
    logger.error('[Graph] graphGet error:', err);
    return { ok: false, status: 0, data: null };
  }
}

export async function graphPost<T>(
  token: string,
  url: string,
  body: unknown,
): Promise<{ ok: boolean; status: number; data: T | null }> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
        20_000,
      );
      if (res.status === 429 && attempt < MAX_RETRIES) {
        const ra = parseInt(res.headers.get('Retry-After') || '0', 10);
        const delay = ra > 0 ? ra * 1000 : RETRY_BASE_MS * (attempt + 1);
        logger.info(`[Graph] POST 429, retry in ${delay}ms (${attempt + 1}/${MAX_RETRIES})`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        logger.error(`[Graph] POST ${url.slice(0, 80)} → ${res.status} ${errBody.slice(0, 300)}`);
        return { ok: false, status: res.status, data: null };
      }
      const data = await res.json() as T;
      return { ok: true, status: res.status, data };
    } catch (err) {
      if (attempt < MAX_RETRIES) continue;
      logger.error('[Graph] graphPost error:', err);
      return { ok: false, status: 0, data: null };
    }
  }
  return { ok: false, status: 0, data: null };
}

export async function graphPatch<T>(
  token: string,
  url: string,
  body: unknown,
): Promise<{ ok: boolean; status: number; data: T | null }> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetchWithTimeout(
        url,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
        20_000,
      );
      if (res.status === 429 && attempt < MAX_RETRIES) {
        const ra = parseInt(res.headers.get('Retry-After') || '0', 10);
        const delay = ra > 0 ? ra * 1000 : RETRY_BASE_MS * (attempt + 1);
        logger.info(`[Graph] PATCH 429, retry in ${delay}ms (${attempt + 1}/${MAX_RETRIES})`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      if (!res.ok) {
        logger.warn(`[Graph] PATCH ${url.slice(0, 80)} → ${res.status}`);
        return { ok: false, status: res.status, data: null };
      }
      const data = await res.json() as T;
      return { ok: true, status: res.status, data };
    } catch (err) {
      if (attempt < MAX_RETRIES) continue;
      logger.error('[Graph] graphPatch error:', err);
      return { ok: false, status: 0, data: null };
    }
  }
  return { ok: false, status: 0, data: null };
}

export async function graphDelete(
  token: string,
  url: string,
): Promise<{ ok: boolean; status: number }> {
  try {
    const res = await fetchWithTimeout(
      url,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      },
      20_000,
    );
    if (!res.ok) {
      logger.warn(`[Graph] DELETE ${url.slice(0, 80)} → ${res.status}`);
      return { ok: false, status: res.status };
    }
    return { ok: true, status: res.status };
  } catch (err) {
    logger.error('[Graph] graphDelete error:', err);
    return { ok: false, status: 0 };
  }
}

export async function graphGetText(token: string, url: string): Promise<{ ok: boolean; text: string }> {
  try {
    const res = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${token}` } }, 20_000);
    if (!res.ok) return { ok: false, text: `Error ${res.status}` };
    return { ok: true, text: await res.text() };
  } catch (err) {
    logger.error('[Graph] graphGetText error:', err);
    return { ok: false, text: 'Network error' };
  }
}
