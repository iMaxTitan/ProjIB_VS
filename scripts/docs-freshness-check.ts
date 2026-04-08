/**
 * Docs freshness checker.
 *
 * Scans docs/*.md for YAML frontmatter and verifies:
 *   1. last_verified + freshness_ttl_days has not expired
 *   2. all "verified_against" file paths still exist
 *   3. tables/RPCs mentioned in the doc actually exist in the live DB
 *
 * Exit codes:
 *   0 — all docs fresh and references valid
 *   1 — at least one doc is stale or has broken references
 *
 * Usage:
 *   npx tsx scripts/docs-freshness-check.ts             — check all docs/
 *   npx tsx scripts/docs-freshness-check.ts --doc KB_RAG.md — single doc
 *   npx tsx scripts/docs-freshness-check.ts --quiet     — only print failures
 *
 * Suitable for CI: returns non-zero on any staleness so a workflow can block merges.
 */
import './eval-env';

import { readdirSync, readFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';

const QUIET = process.argv.includes('--quiet');
const SINGLE_DOC = process.argv.includes('--doc') ? process.argv[process.argv.indexOf('--doc') + 1] : null;

const ROOT = resolve(__dirname, '..');
const DOCS_DIR = join(ROOT, 'docs');

interface Frontmatter {
  doc_type?: string;
  last_verified?: string; // ISO date
  verified_against?: string[];
  freshness_ttl_days?: number;
  on_change_required?: string[];
  [key: string]: unknown;
}

interface CheckResult {
  file: string;
  hasFrontmatter: boolean;
  staleness: 'fresh' | 'stale' | 'never_verified' | 'no_frontmatter';
  daysSinceVerified: number | null;
  ttl: number | null;
  missingFiles: string[];
  missingDbObjects: string[];
  errors: string[];
}

// ── Frontmatter parser (minimal, no yaml dep) ──────────────────────────────

function parseFrontmatter(content: string): Frontmatter | null {
  if (!content.startsWith('---\n') && !content.startsWith('---\r\n')) return null;
  const end = content.indexOf('\n---', 4);
  if (end === -1) return null;
  const yamlBlock = content.slice(4, end);

  const fm: Record<string, unknown> = {};
  const lines = yamlBlock.split('\n');
  let currentKey: string | null = null;
  let currentList: string[] | null = null;

  for (const rawLine of lines) {
    const line = rawLine.replace('\r', '');
    if (!line.trim()) continue;

    // List item under previous key
    if (line.startsWith('  - ') && currentList !== null) {
      currentList.push(line.slice(4).trim());
      continue;
    }
    // Multi-line `|` block — we don't fully parse, just skip its content lines
    if (line.startsWith('  ') && currentKey && fm[currentKey] === '__multiline__') {
      continue;
    }

    // key: value or key: |  or key:
    const m = line.match(/^([a-z_]+):\s*(.*)$/);
    if (!m) continue;
    const [, key, rawValue] = m;
    currentKey = key;
    currentList = null;

    if (rawValue === '') {
      // expect a list on next lines
      currentList = [];
      fm[key] = currentList;
    } else if (rawValue === '|') {
      fm[key] = '__multiline__';
    } else {
      // Try to parse as number
      const num = Number(rawValue);
      fm[key] = Number.isFinite(num) && rawValue.trim() !== '' && !rawValue.includes('-') ? num : rawValue.replace(/^["']|["']$/g, '');
    }
  }
  return fm as Frontmatter;
}

// ── Reference extractors ───────────────────────────────────────────────────

function extractTables(content: string): string[] {
  const tables = new Set<string>();
  // Strict lowercase match — `KB_MATCH_COUNT` env vars must NOT match.
  // Backticked form: `kb_chunks`
  const reBT = /`(kb_[a-z][a-z_]*)`/g;
  let m: RegExpExecArray | null;
  while ((m = reBT.exec(content)) !== null) tables.add(m[1]);
  // SQL form: FROM/JOIN/UPDATE/INTO followed by kb_<lowercase>
  const reSql = /(?:FROM|JOIN|UPDATE|INTO|from|join|update|into|From|Join|Update|Into)\s+(kb_[a-z][a-z_]*)/g;
  while ((m = reSql.exec(content)) !== null) tables.add(m[1]);
  return [...tables];
}

function extractRpcs(content: string): string[] {
  const rpcs = new Set<string>();
  const re = /`(match_kb_[a-z][a-z_]*)`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) rpcs.add(m[1]);
  return [...rpcs];
}

// ── DB checks ──────────────────────────────────────────────────────────────

async function checkTablesExist(db: unknown, tables: string[]): Promise<string[]> {
  if (tables.length === 0) return [];
  type DbLike = {
    from: (t: string) => {
      select: (cols: string) => {
        in: (col: string, vals: string[]) => Promise<{ data: Array<{ table_name: string }> | null; error: unknown }>;
      };
    };
  };
  const d = db as DbLike;
  // Use information_schema.tables via PostgREST? Not exposed by default.
  // Workaround: try a HEAD select on each table; PostgREST returns 404 if it doesn't exist.
  const missing: string[] = [];
  for (const t of tables) {
    try {
      const res = await (d.from(t).select('*') as unknown as { limit: (n: number) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }> }).limit(1);
      if (res.error && (res.error.code === '42P01' || res.error.message?.includes('does not exist') || res.error.message?.includes('Not Found'))) {
        missing.push(t);
      }
    } catch {
      missing.push(t);
    }
  }
  return missing;
}

async function checkRpcsExist(db: unknown, rpcs: string[]): Promise<string[]> {
  if (rpcs.length === 0) return [];
  type DbLike = { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }> };
  const d = db as DbLike;
  const missing: string[] = [];
  for (const name of rpcs) {
    try {
      // Call with empty args; we expect either 400 (bad args) which means RPC exists,
      // or 404 / "not found" which means it doesn't.
      const res = await d.rpc(name, {});
      if (res.error && (res.error.code === '42883' || res.error.message?.toLowerCase().includes('not found') || res.error.message?.toLowerCase().includes('does not exist'))) {
        missing.push(name);
      }
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.toLowerCase().includes('not found') || msg.toLowerCase().includes('does not exist')) {
        missing.push(name);
      }
    }
  }
  return missing;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function checkOne(filePath: string, db: unknown): Promise<CheckResult> {
  const content = readFileSync(filePath, 'utf8');
  const result: CheckResult = {
    file: filePath.replace(ROOT + '\\', '').replace(ROOT + '/', ''),
    hasFrontmatter: false,
    staleness: 'no_frontmatter',
    daysSinceVerified: null,
    ttl: null,
    missingFiles: [],
    missingDbObjects: [],
    errors: [],
  };

  const fm = parseFrontmatter(content);
  if (!fm) return result;
  result.hasFrontmatter = true;

  // Freshness check
  if (fm.last_verified && typeof fm.last_verified === 'string') {
    const verifiedDate = new Date(fm.last_verified);
    if (isNaN(verifiedDate.getTime())) {
      result.errors.push(`invalid last_verified: ${fm.last_verified}`);
    } else {
      const days = Math.floor((Date.now() - verifiedDate.getTime()) / (1000 * 60 * 60 * 24));
      result.daysSinceVerified = days;
      const ttl = typeof fm.freshness_ttl_days === 'number' ? fm.freshness_ttl_days : 30;
      result.ttl = ttl;
      result.staleness = days > ttl ? 'stale' : 'fresh';
    }
  } else {
    result.staleness = 'never_verified';
  }

  // verified_against files exist?
  if (Array.isArray(fm.verified_against)) {
    for (const path of fm.verified_against) {
      const full = join(ROOT, path);
      // Skip schema-style entries that contain spaces or 'via'
      if (path.includes(' ')) continue;
      if (!existsSync(full)) {
        result.missingFiles.push(path);
      }
    }
  }

  // DB references
  const tables = extractTables(content);
  const rpcs = extractRpcs(content);
  const missingTables = await checkTablesExist(db, tables);
  const missingRpcs = await checkRpcsExist(db, rpcs);
  result.missingDbObjects = [...missingTables, ...missingRpcs];

  return result;
}

async function main() {
  const { getServerDb } = await import('../src/lib/shared/db-server');
  const db = getServerDb();

  let files: string[];
  if (SINGLE_DOC) {
    files = [join(DOCS_DIR, SINGLE_DOC)];
  } else {
    files = readdirSync(DOCS_DIR)
      .filter(f => f.endsWith('.md'))
      .map(f => join(DOCS_DIR, f));
  }

  console.log(`\n  Docs Freshness Check — ${files.length} file(s)\n`);

  const results: CheckResult[] = [];
  for (const f of files) {
    const r = await checkOne(f, db);
    results.push(r);
  }

  // Summary
  const stale = results.filter(r => r.staleness === 'stale');
  const noFm = results.filter(r => !r.hasFrontmatter);
  const noVerified = results.filter(r => r.hasFrontmatter && r.staleness === 'never_verified');
  const withErrors = results.filter(r => r.errors.length > 0 || r.missingFiles.length > 0 || r.missingDbObjects.length > 0);
  const fresh = results.filter(r => r.staleness === 'fresh' && r.errors.length === 0 && r.missingFiles.length === 0 && r.missingDbObjects.length === 0);

  if (!QUIET) {
    console.log(`  ${'File'.padEnd(36)} | Status         | Refs`);
    console.log('  ' + '-'.repeat(72));
    for (const r of results) {
      const statusStr =
        r.staleness === 'fresh' ? `fresh (${r.daysSinceVerified}d/${r.ttl}d)` :
        r.staleness === 'stale' ? `STALE (${r.daysSinceVerified}d/${r.ttl}d)` :
        r.staleness === 'never_verified' ? 'no last_verified' :
        'no frontmatter';
      const refsStr = r.missingFiles.length + r.missingDbObjects.length === 0
        ? 'ok'
        : `${r.missingFiles.length}f ${r.missingDbObjects.length}db missing`;
      console.log(`  ${r.file.padEnd(36)} | ${statusStr.padEnd(14)} | ${refsStr}`);
    }
    console.log();
  }

  if (withErrors.length > 0) {
    console.log(`  Issues:\n`);
    for (const r of withErrors) {
      console.log(`  ❌ ${r.file}`);
      for (const e of r.errors) console.log(`     error: ${e}`);
      for (const f of r.missingFiles) console.log(`     missing file: ${f}`);
      for (const o of r.missingDbObjects) console.log(`     missing DB object: ${o}`);
    }
    console.log();
  }

  console.log(`  ${'═'.repeat(64)}`);
  console.log(`  fresh:           ${fresh.length}`);
  console.log(`  stale (TTL):     ${stale.length}`);
  console.log(`  never verified:  ${noVerified.length}`);
  console.log(`  no frontmatter:  ${noFm.length}`);
  console.log(`  with broken refs:${withErrors.length}`);
  console.log(`  ${'═'.repeat(64)}\n`);

  // Exit non-zero on staleness OR broken refs
  if (stale.length > 0 || withErrors.length > 0) {
    process.exit(1);
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
