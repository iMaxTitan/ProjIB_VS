/**
 * law-fetcher — Microservice for fetching Ukrainian laws from zakon.rada.gov.ua
 * Runs on DB VPS (port 3100), accessed by App VPS over internal network.
 */

const express = require('express');
const { fetchDocument, searchDocuments, getRelatedDocuments, checkUpdate } = require('./fetcher');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3100;
const SERVICE_KEY = process.env.SERVICE_KEY || 'law-fetcher-internal-key';

// ─── Auth middleware ──────────────────────────────────────────────────────────

function authMiddleware(req, res, next) {
  const key = req.headers['x-service-key'];
  if (key !== SERVICE_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

app.use(authMiddleware);

// ─── Request queue (one Playwright operation at a time) ───────────────────────

let _queue = Promise.resolve();

function enqueue(fn) {
  const task = _queue.then(fn).catch(err => { throw err; });
  _queue = task.catch(() => {}); // prevent unhandled rejection chain
  return task;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

app.post('/search', async (req, res) => {
  const { query } = req.body;
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'query is required' });
  }
  try {
    const results = await enqueue(() => searchDocuments(query));
    res.json({ results });
  } catch (err) {
    console.error('[/search] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/fetch', async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url is required' });
  }
  try {
    const result = await enqueue(() => fetchDocument(url));
    res.json(result);
  } catch (err) {
    console.error('[/fetch] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/related', async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url is required' });
  }
  try {
    const results = await enqueue(() => getRelatedDocuments(url));
    res.json({ results });
  } catch (err) {
    console.error('[/related] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/check-update', async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url is required' });
  }
  try {
    const result = await enqueue(() => checkUpdate(url));
    res.json(result);
  } catch (err) {
    console.error('[/check-update] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Health check ─────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[law-fetcher] Listening on port ${PORT}`);
});
