const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const TARGET_DIRS = ['src', 'supabase', 'docs'];
const EXTS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.css',
  '.scss',
  '.md',
  '.sql',
  '.yml',
  '.yaml',
]);

const ignored = new Set(['node_modules', '.next', '.git', 'dist', 'build']);
const badFiles = [];

function isUtf8(buffer) {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return true;
  } catch {
    return false;
  }
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!ignored.has(entry.name)) {
        walk(fullPath);
      }
      continue;
    }
    if (!entry.isFile()) continue;
    if (!EXTS.has(path.extname(entry.name))) continue;
    const content = fs.readFileSync(fullPath);
    if (!isUtf8(content)) {
      badFiles.push(path.relative(ROOT, fullPath));
    }
  }
}

for (const dir of TARGET_DIRS) {
  const full = path.join(ROOT, dir);
  if (fs.existsSync(full) && fs.statSync(full).isDirectory()) {
    walk(full);
  }
}

if (badFiles.length) {
  console.error('Non-UTF-8 files found:');
  for (const file of badFiles) console.error(`- ${file}`);
  process.exit(1);
}

console.log('Encoding check passed: all scanned files are valid UTF-8.');

