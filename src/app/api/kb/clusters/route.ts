/**
 * GET /api/kb/clusters
 * Thematic clustering of KB documents via k-means on avg chunk embeddings.
 * Chief only. Results cached 24h in memory.
 * DELETE — invalidate cache.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isRequestAuthorized, getDbUserId, checkRateLimit, getRequesterKey } from '@/lib/shared/api/request-guards';
import { getServerDb } from '@/lib/shared/db-server';
import { generateAIText } from '@/lib/shared/ai/client';
import { config } from '@/lib/shared/config';
import { kmeans, parseEmbedding } from '@/lib/kb/analytics';
import logger from '@/lib/shared/logger';

export interface DocInfo {
  id: string;
  title: string;
  category: string;
}

export interface DocCluster {
  label: string;
  docs: DocInfo[];
}

// In-memory cache (24h)
let cache: { data: DocCluster[]; builtAt: number; expiresAt: number } | null = null;

async function checkChiefRole(db: ReturnType<typeof getServerDb>, userId: string): Promise<boolean> {
  const { data } = await db.from('user_profiles').select('role').eq('user_id', userId).single();
  return data?.role === 'chief';
}

export async function GET(req: NextRequest) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = getDbUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Missing user ID' }, { status: 401 });
  }
  const rl = checkRateLimit(getRequesterKey(req), 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too Many Requests' }, { status: 429 });
  }

  const db = getServerDb();
  if (!await checkChiefRole(db, userId)) {
    return NextResponse.json({ error: 'Forbidden — chief only' }, { status: 403 });
  }

  if (cache && cache.expiresAt > Date.now()) {
    return NextResponse.json({ clusters: cache.data, cached: true, builtAt: cache.builtAt });
  }

  // Fetch avg embeddings per document via RPC
  const { data: rows, error } = await db.rpc('get_document_avg_embeddings');

  if (error) {
    logger.error('[kb/clusters] RPC error:', error);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }

  if (!rows || rows.length === 0) {
    return NextResponse.json({ clusters: [], cached: false, builtAt: Date.now() });
  }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vectors = (rows as any[]).map((r: { avg_embedding: number[] | string }) =>
    parseEmbedding(r.avg_embedding)
  );

  // k = sqrt(n) clamped to [3, 8]
  const k = Math.max(3, Math.min(8, Math.round(Math.sqrt(rows.length))));
  const { assignments } = kmeans(vectors, k);

  // Group docs by cluster id
  const clusterMap = new Map<number, Array<{ document_id: string; doc_title: string; category_slug: string }>>();
  assignments.forEach((cid, i) => {
    if (!clusterMap.has(cid)) clusterMap.set(cid, []);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    clusterMap.get(cid)!.push((rows as any[])[i]);
  });

  const clusterEntries = Array.from(clusterMap.entries()).map(([id, docs]) => ({
    id,
    docTitles: docs.map((d) => d.doc_title).join(', '),
    docs: docs.map((d) => ({ id: d.document_id, title: d.doc_title, category: d.category_slug })),
  }));

  // AI label each cluster
  let clusters: DocCluster[] = [];
  try {
    if (config.openai.apiKey && clusterEntries.length > 0) {
      const prompt = `Назви кожну тематичну групу документів (2-5 слів, інформативно, українською).

Групи:
${clusterEntries.map((c) => `Група ${c.id}: ${c.docTitles}`).join('\n')}

Поверни JSON масив (без markdown):
[{"id": 0, "label": "Назва теми"}, ...]`;

      const text = await generateAIText({
        messages: [{ role: 'user', content: prompt }],
        openAIModel: 'gpt-4o-mini',
        maxTokens: 300,
        temperature: 0.2,
        timeoutMs: 15_000,
      });

      const jsonStr = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
      const labels: Array<{ id: number; label: string }> = JSON.parse(jsonStr);
      const labelMap = new Map(labels.map((l) => [l.id, l.label]));

      clusters = clusterEntries.map((c) => ({
        label: labelMap.get(c.id) ?? `Кластер ${c.id + 1}`,
        docs: c.docs,
      }));
    } else {
      clusters = clusterEntries.map((c, i) => ({ label: `Кластер ${i + 1}`, docs: c.docs }));
    }
  } catch (e) {
    logger.error('[kb/clusters] AI labeling error:', e);
    clusters = clusterEntries.map((c, i) => ({ label: `Кластер ${i + 1}`, docs: c.docs }));
  }

  clusters.sort((a, b) => b.docs.length - a.docs.length);

  const builtAt = Date.now();
  cache = { data: clusters, builtAt, expiresAt: builtAt + 86_400_000 };
  return NextResponse.json({ clusters, cached: false, builtAt });
}

/** Invalidate cache */
export async function DELETE(req: NextRequest) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  cache = null;
  return NextResponse.json({ ok: true });
}
