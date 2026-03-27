/**
 * fetcher.js — Core logic for fetching/parsing Ukrainian laws from zakon.rada.gov.ua
 * Extracted from scripts/fetch-law.ts, adapted for server use.
 */

const { chromium } = require('playwright');
const { EXTRACT_TITLE_JS, EXTRACT_TEXT_JS, postProcess, postProcessTxt } = require('./parser');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Shared browser instance (reused across requests to save memory)
let _browser = null;
let _browserLastUsed = 0;
const BROWSER_IDLE_MS = 5 * 60 * 1000; // close after 5 min idle

async function getBrowser() {
  if (_browser && _browser.isConnected()) {
    _browserLastUsed = Date.now();
    return _browser;
  }
  _browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  _browserLastUsed = Date.now();
  return _browser;
}

// Periodically close idle browser
setInterval(() => {
  if (_browser && _browser.isConnected() && Date.now() - _browserLastUsed > BROWSER_IDLE_MS) {
    _browser.close().catch(() => {});
    _browser = null;
    console.log('[fetcher] Closed idle browser');
  }
}, 60_000);

async function newPage() {
  const browser = await getBrowser();
  const context = await browser.newContext({ userAgent: UA });
  return context.newPage();
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Extract nreg (document ID) from zakon.rada.gov.ua URL.
 * E.g. "https://zakon.rada.gov.ua/laws/show/3543-12#Text" → "3543-12"
 */
function extractNreg(url) {
  const match = url.match(/\/laws\/show\/([^\/#?]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Fetch a law document via data.rada.gov.ua API (no Playwright needed).
 * Falls back to Playwright if API fails.
 */
async function fetchDocument(url) {
  const nreg = extractNreg(url);
  if (!nreg) throw new Error('Cannot extract document ID from URL');

  // 1. Try official API first (fast, clean text)
  try {
    const [cardRes, textRes] = await Promise.all([
      fetch(`https://data.rada.gov.ua/laws/card/${encodeURIComponent(nreg)}.json`, {
        headers: { 'User-Agent': 'OpenData' },
      }),
      fetch(`https://data.rada.gov.ua/laws/show/${encodeURIComponent(nreg)}.txt`, {
        headers: { 'User-Agent': 'OpenData' },
      }),
    ]);

    if (cardRes.ok && textRes.ok) {
      const card = await cardRes.json();
      const rawText = await textRes.text();

      if (rawText && rawText.trim().length > 100) {
        const title = card.nazva || '';
        const markdown = postProcessTxt(rawText, title);
        console.log(`[fetch] API OK: ${nreg} — ${markdown.length} chars`);
        return {
          title,
          markdown,
          lineCount: markdown.split('\n').length,
          charCount: markdown.length,
          datred: card.datred ? String(card.datred) : null,
        };
      }
    }
  } catch (apiErr) {
    console.log(`[fetch] API failed for ${nreg}, falling back to Playwright:`, apiErr.message);
  }

  // 2. Fallback: Playwright (for pages not available via API)
  const page = await newPage();
  try {
    const textUrl = url.includes('#Text') ? url : url + '#Text';
    await page.goto(textUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForSelector('#article_text, .txt-c, .document-text, .card_text, [id*="Text"]', { timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(5000);

    const title = await page.evaluate(EXTRACT_TITLE_JS);
    const text = await page.evaluate(EXTRACT_TEXT_JS);

    const titleStr = typeof title === 'string' ? title : '';
    const textStr = typeof text === 'string' ? text : '';

    if (!textStr || textStr.trim().length < 100) {
      throw new Error('Extracted text too short — page may not have loaded');
    }

    const markdown = postProcess(textStr, titleStr);
    return {
      title: titleStr.replace(/\s*\|.*$/, '').trim(),
      markdown,
      lineCount: markdown.split('\n').length,
      charCount: markdown.length,
    };
  } finally {
    await page.context().close();
  }
}

/**
 * Look up a document by nreg via data.rada.gov.ua API (no Playwright).
 */
async function searchByNreg(nreg, url) {
  try {
    const res = await fetch(`https://data.rada.gov.ua/laws/card/${encodeURIComponent(nreg)}.json`, {
      headers: { 'User-Agent': 'OpenData' },
    });
    if (!res.ok) return null;
    const card = await res.json();
    if (!card.nazva) return null;
    return {
      title: card.nazva,
      url: url || `https://zakon.rada.gov.ua/laws/show/${encodeURIComponent(nreg)}`,
      docId: decodeURIComponent(nreg),
    };
  } catch {
    return null;
  }
}

/**
 * Search for a document by URL, number, or free text.
 * URL and number use data.rada.gov.ua API (instant, no Playwright).
 * Free text falls back to Playwright.
 */
async function searchDocuments(query) {
  const trimmed = query.trim();

  // Direct URL — extract nreg, call API
  if (trimmed.includes('zakon.rada.gov.ua/laws/show/')) {
    const url = trimmed.replace(/#.*$/, '');
    const nreg = extractNreg(url);
    if (nreg) {
      const result = await searchByNreg(nreg, url);
      if (result) return [result];
    }
  }

  // Doc number pattern (e.g. "1023-XII", "3543-12", "76-2023-п")
  const docNumPattern = /^[\d]+-[\dIVXLCDMivxlcdmа-яА-ЯіїєґІЇЄҐ\/%]+$/;
  if (docNumPattern.test(trimmed)) {
    const nreg = trimmed;
    const url = `https://zakon.rada.gov.ua/laws/show/${encodeURIComponent(trimmed)}`;
    const result = await searchByNreg(nreg, url);
    if (result) return [result];
  }

  // Free text search
  const page = await newPage();
  try {
    // Search zakon.rada.gov.ua by document NAME (nm=1) — much more relevant than full-text
    const searchUrl = `https://zakon.rada.gov.ua/laws/main/page?find=1&nm=1&text=${encodeURIComponent(query)}`;
    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForTimeout(3000);

    const results = await page.evaluate(`(function() {
      var items = document.querySelectorAll('a[href*="/laws/show/"]');
      var seen = {};
      var out = [];
      for (var i = 0; i < items.length && out.length < 20; i++) {
        var a = items[i];
        var href = a.href || '';
        if (!href.includes('/laws/show/')) continue;
        var key = href.replace(/#.*$/, '');
        if (seen[key]) continue;
        seen[key] = true;
        var text = a.textContent.trim();
        if (text.length < 10) continue;
        out.push({ title: text.substring(0, 300), url: key });
      }
      return out;
    })()`);

    // Extract doc number and date from URLs/titles
    return results.map(r => {
      const numMatch = r.url.match(/\/laws\/show\/([^\/#]+)/);
      return {
        title: r.title,
        url: r.url,
        docId: numMatch ? numMatch[1] : '',
      };
    });
  } finally {
    await page.context().close();
  }
}

/**
 * Get related documents (постанови, зміни) from the "Зв'язки" tab.
 */
async function getRelatedDocuments(url) {
  const page = await newPage();
  try {
    // Extract base URL without hash/fragment
    const baseUrl = url.replace(/#.*$/, '');
    const relationsUrl = baseUrl + '/card5#Links';

    await page.goto(relationsUrl, { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForTimeout(5000);

    const links = await page.evaluate(`(function() {
      var allLinks = Array.from(document.querySelectorAll('a'));
      var seen = {};
      var out = [];
      for (var i = 0; i < allLinks.length; i++) {
        var a = allLinks[i];
        var href = a.href || '';
        if (!href.includes('/laws/show/')) continue;
        var key = href.replace(/#.*$/, '');
        if (seen[key]) continue;
        seen[key] = true;
        var text = a.textContent.trim();
        if (text.length < 15) continue;
        out.push({ title: text.substring(0, 300), url: key });
      }
      return out;
    })()`);

    // Classify documents by type using both title and URL patterns
    return links
      .filter(l => !l.url.includes(baseUrl.split('/laws/show/')[1] || '___'))
      .map(l => {
        const t = l.title.toLowerCase();
        const u = l.url.toLowerCase();

        // URL-based classification (more reliable)
        // Постанови КМУ: /laws/show/XXX-YYYY-п (ends with %D0%BF or -п)
        const isKMU = u.includes('%d0%bf') || u.match(/\/laws\/show\/\d+-\d{4}-%D0%BF/i) || u.match(/\/laws\/show\/\d+-\d{4}-п/i);
        // Розпорядження: ends with -р
        const isRozp = u.includes('%d1%80') || u.match(/\/laws\/show\/\d+-\d{4}-р/i);
        // Закони ВР: /laws/show/XXXX-IX, XXXX-20, etc (4+ digits, dash, roman or 2-digit)
        const isLaw = u.match(/\/laws\/show\/\d{3,}-[IVXivx]+$/) || u.match(/\/laws\/show\/\d{4}-\d{2}$/);
        // Накази: /laws/show/zXXXX-YY (registered in MinJust)
        const isOrder = u.match(/\/laws\/show\/z\d+-\d{2}/i);
        // Укази: /laws/show/XXX/YYYY (slash format)
        const isUkaz = u.match(/\/laws\/show\/\d+\/\d{4}$/);

        let docType = 'інше';

        // Title-based override (most specific)
        if (t.includes('внесення змін') || t.includes('зміни до') || t.includes('зміни,')) {
          docType = 'Зміни';
        } else if (t.includes('постанов') && (t.includes('кабінет') || t.includes('кму'))) {
          docType = 'Постанова КМУ';
        } else if (t.includes('закон') || t.includes('кодекс')) {
          docType = 'Закон';
        } else if (t.includes('наказ')) {
          docType = 'Наказ';
        } else if (t.includes('указ')) {
          docType = 'Указ';
        } else if (t.includes('конвенці') || t.includes('договір') || t.includes('протокол')) {
          docType = 'Конвенція';
        } else if (t.includes('конституці')) {
          docType = 'Конституція';
        }
        // URL-based fallback for unclassified
        else if (isKMU) docType = 'Постанова КМУ';
        else if (isOrder) docType = 'Наказ';
        else if (isLaw) docType = 'Закон';
        else if (isUkaz) docType = 'Указ';
        else if (isRozp) docType = 'Розпорядження';
        // Title keywords for remaining
        else if (t.includes('затвердження') || t.includes('порядок') || t.includes('правил')) docType = 'Постанова КМУ';
        else if (t.includes('регламент') || t.includes('положення')) docType = 'Наказ';

        return { ...l, docType };
      });
  } finally {
    await page.context().close();
  }
}

/**
 * Check the last revision date of a document (without downloading full text).
 */
async function checkUpdate(url) {
  const nreg = extractNreg(url);
  if (!nreg) return { lastRevisionDate: null };

  // Use API card endpoint — datred field has last revision date (YYYYMMDD format)
  try {
    const res = await fetch(`https://data.rada.gov.ua/laws/card/${encodeURIComponent(nreg)}.json`, {
      headers: { 'User-Agent': 'OpenData' },
    });
    if (res.ok) {
      const card = await res.json();
      if (card.datred) {
        const d = String(card.datred);
        const formatted = `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`;
        return { lastRevisionDate: formatted };
      }
    }
  } catch { /* fall through to Playwright */ }

  // Fallback: Playwright
  const page = await newPage();
  try {
    const baseUrl = url.replace(/#.*$/, '');
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(3000);

    const lastDate = await page.evaluate(`(function() {
      var datePattern = /\\d{2}\\.\\d{2}\\.\\d{4}/g;
      var text = document.body.textContent.substring(0, 5000);
      var dates = text.match(datePattern) || [];
      if (dates.length === 0) return null;
      var latest = null;
      for (var i = 0; i < dates.length; i++) {
        var parts = dates[i].split('.');
        var d = new Date(parts[2], parts[1] - 1, parts[0]);
        if (!latest || d > latest) latest = d;
      }
      return latest ? latest.toISOString().split('T')[0] : null;
    })()`);

    return { lastRevisionDate: lastDate };
  } finally {
    await page.context().close();
  }
}

module.exports = { fetchDocument, searchDocuments, getRelatedDocuments, checkUpdate };
