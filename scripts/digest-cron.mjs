/**
 * Weekly digest cron script.
 * Calls POST /api/digest/weekly to send personalized digests to all users.
 *
 * Setup on Hetzner VPS (run once after deploy):
 *   pm2 start /opt/cs-platform/scripts/digest-cron.mjs \
 *     --name digest-cron --cron "0 6 * * 1" --no-autorestart
 *   pm2 save
 *
 * Safety: script checks day-of-week and hour before sending.
 * Even if PM2 restarts it after reboot, it will skip silently.
 *
 * Reads CRON_SECRET and APP_URL from .env.local automatically.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Safety guard: only send on Monday 05:00–09:59 UTC (08:00–12:59 Kyiv)
const now = new Date();
const dayOfWeek = now.getUTCDay(); // 0=Sun, 1=Mon
const hour = now.getUTCHours();

if (dayOfWeek !== 1 || hour < 5 || hour > 9) {
  console.log(`[digest-cron] Skipped — not Monday morning (day=${dayOfWeek}, hour=${hour} UTC). Safe exit.`);
  process.exit(0);
}

// Load .env.local (pm2 doesn't load it automatically)
try {
  const dir = dirname(fileURLToPath(import.meta.url));
  const envPath = join(dir, '..', '.env.local');
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#\s][^=]*)=(.*)$/);
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
} catch { /* .env.local not found — use process.env as-is */ }

// Allow self-signed cert for internal localhost call
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const url = process.env.APP_URL || 'https://localhost:443';
const secret = process.env.CRON_SECRET || '';

if (!secret) {
  console.error('[digest-cron] CRON_SECRET is not set in .env.local');
  process.exit(1);
}

try {
  const res = await fetch(`${url}/api/digest/weekly`, {
    method: 'POST',
    headers: { 'x-cron-secret': secret },
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[digest-cron] HTTP ${res.status}: ${text}`);
    process.exit(1);
  }

  const data = await res.json();
  console.log(`[digest-cron] Done — sent=${data.sent}, failed=${data.failed}, skipped=${data.skipped}`);
} catch (err) {
  console.error('[digest-cron] Request failed:', err);
  process.exit(1);
}
