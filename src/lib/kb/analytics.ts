/**
 * KB Analytics utilities — k-means clustering on document embeddings.
 */

export type Vector = number[];

function normalizeVector(v: Vector): Vector {
  const mag = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  if (mag === 0) return v;
  return v.map((x) => x / mag);
}

function cosineSim(a: Vector, b: Vector): number {
  // Assumes normalized vectors
  return a.reduce((s, x, i) => s + x * b[i], 0);
}

function avgVector(vectors: Vector[]): Vector {
  if (vectors.length === 0) return [];
  const dim = vectors[0].length;
  const sum = new Array<number>(dim).fill(0);
  for (const v of vectors) {
    for (let i = 0; i < dim; i++) sum[i] += v[i];
  }
  return normalizeVector(sum.map((x) => x / vectors.length));
}

export interface KMeansResult {
  assignments: number[];
  centroids: Vector[];
}

/**
 * K-means clustering with cosine similarity (via normalization).
 * Uses k-means++ initialization for better convergence.
 */
export function kmeans(vectors: Vector[], k: number, maxIterations = 50): KMeansResult {
  const normalized = vectors.map(normalizeVector);
  const n = normalized.length;

  if (n === 0) return { assignments: [], centroids: [] };
  if (n <= k) {
    return { assignments: normalized.map((_, i) => i), centroids: normalized };
  }

  // k-means++ initialization
  const centroids: Vector[] = [];
  centroids.push(normalized[Math.floor(Math.random() * n)]);

  for (let c = 1; c < k; c++) {
    // Distance to nearest existing centroid (1 - cosine similarity)
    const distances = normalized.map((v) => {
      const maxSim = Math.max(...centroids.map((cent) => cosineSim(v, cent)));
      return Math.max(0, 1 - maxSim);
    });
    const totalDist = distances.reduce((s, d) => s + d, 0);
    let rand = Math.random() * totalDist;
    let chosen = 0;
    for (let i = 0; i < n; i++) {
      rand -= distances[i];
      if (rand <= 0) { chosen = i; break; }
    }
    centroids.push([...normalized[chosen]]);
  }

  let assignments = new Array<number>(n).fill(0);

  for (let iter = 0; iter < maxIterations; iter++) {
    // Assign each vector to nearest centroid
    const newAssignments: number[] = [];
    for (const v of normalized) {
      let best = 0;
      let bestSim = cosineSim(v, centroids[0]);
      for (let ci = 1; ci < centroids.length; ci++) {
        const sim = cosineSim(v, centroids[ci]);
        if (sim > bestSim) { best = ci; bestSim = sim; }
      }
      newAssignments.push(best);
    }

    const changed = newAssignments.some((a, i) => a !== assignments[i]);
    assignments = newAssignments;
    if (!changed) break;

    // Update centroids
    for (let c = 0; c < k; c++) {
      const members = normalized.filter((_, i) => assignments[i] === c);
      if (members.length > 0) centroids[c] = avgVector(members);
    }
  }

  return { assignments, centroids };
}

/**
 * Parse pgvector embedding string "[0.1,0.2,...]" or raw number[].
 */
export function parseEmbedding(raw: number[] | string): number[] {
  if (Array.isArray(raw)) return raw;
  return (raw as string).replace(/^\[/, '').replace(/\]$/, '').split(',').map(Number);
}
