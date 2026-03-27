/**
 * fetch-law.ts — Fetch a Ukrainian law from zakon.rada.gov.ua and save as clean .md
 *
 * Usage:
 *   npx tsx scripts/fetch-law.ts "https://zakon.rada.gov.ua/laws/show/322-08#Text" output.md
 *   npx tsx scripts/fetch-law.ts "https://zakon.rada.gov.ua/laws/show/2163-19#Text" cybersecurity.md
 */

import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const url = process.argv[2];
const outputFile = process.argv[3];

if (!url || !outputFile) {
  console.error('Usage: npx tsx scripts/fetch-law.ts <url> <output.md>');
  console.error('Example: npx tsx scripts/fetch-law.ts "https://zakon.rada.gov.ua/laws/show/322-08#Text" kzot.md');
  process.exit(1);
}

async function fetchLaw() {
  console.log(`Fetching: ${url}`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });

  // Wait for the law text to render (JS-loaded content)
  console.log('Waiting for content to load...');
  await page.waitForSelector('#article_text, .txt-c, .document-text, .card_text, [id*="Text"]', { timeout: 30_000 }).catch(() => {
    console.log('Warning: main text selector not found, will try alternatives');
  });

  // Extra wait for dynamic rendering
  await page.waitForTimeout(5000);

  const bodyLen = await page.evaluate('document.body.textContent.length');
  console.log(`Page loaded: ${bodyLen} chars`);

  // Extract clean text — use page.$eval to avoid tsx __name transform issue
  const title = await page.evaluate(`
    (function() {
      var h1 = document.querySelector('h1');
      if (h1 && h1.textContent.trim().length > 10) return h1.textContent.trim();
      var docTitle = document.querySelector('.doc_title, #doc_name, .card-title');
      if (docTitle && docTitle.textContent.trim().length > 10) return docTitle.textContent.trim();
      var t = document.title || '';
      return t.split('|')[0].trim();
    })()
  `);

  const text = await page.evaluate(`
    (function() {
      var selectors = ['#Document', '#article_text', '.txt-c', '.document-text', '.card-body', '#content'];
      var container = null;
      for (var i = 0; i < selectors.length; i++) {
        container = document.querySelector(selectors[i]);
        if (container && container.textContent && container.textContent.trim().length > 500) break;
      }
      if (!container) {
        var divs = Array.from(document.querySelectorAll('div'));
        var best = null, bestLen = 0;
        for (var j = 0; j < divs.length; j++) {
          var len = (divs[j].textContent || '').length;
          if (len > bestLen) { best = divs[j]; bestLen = len; }
        }
        container = best;
      }
      if (!container) return '';

      var clone = container.cloneNode(true);
      var junk = ['script','style','nav','header','footer','iframe','.navbar','.sidebar','.breadcrumb','.pagination','.cookie','.share-buttons','.social','.ad','.banner','#comments','.noprint','.d-print-none'];
      for (var k = 0; k < junk.length; k++) {
        clone.querySelectorAll(junk[k]).forEach(function(el) { el.remove(); });
      }

      function toMd(el) {
        var out = '';
        var nodes = Array.from(el.childNodes);
        for (var n = 0; n < nodes.length; n++) {
          var node = nodes[n];
          if (node.nodeType === 3) { out += node.textContent || ''; continue; }
          if (node.nodeType !== 1) continue;
          var tag = node.tagName.toLowerCase();
          var txt = (node.textContent || '').trim();
          if (!txt) continue;
          if (tag === 'h1') { out += '\\n# ' + txt + '\\n\\n'; }
          else if (tag === 'h2') { out += '\\n## ' + txt + '\\n\\n'; }
          else if (tag === 'h3') { out += '\\n### ' + txt + '\\n\\n'; }
          else if (tag === 'h4' || tag === 'h5' || tag === 'h6') { out += '\\n#### ' + txt + '\\n\\n'; }
          else if (tag === 'p') { out += toMd(node).trim() + '\\n\\n'; }
          else if (tag === 'br') { out += '\\n'; }
          else if (tag === 'b' || tag === 'strong') { out += '**' + txt + '**'; }
          else if (tag === 'i' || tag === 'em') { out += '*' + txt + '*'; }
          else if (tag === 'li') { out += '- ' + toMd(node).trim() + '\\n'; }
          else { out += toMd(node); }
        }
        return out;
      }
      return toMd(clone);
    })()
  `);

  await browser.close();

  const textStr = typeof text === 'string' ? text : '';
  const titleStr = typeof title === 'string' ? title : '';

  if (!textStr || textStr.trim().length < 100) {
    console.error('Error: extracted text is too short, page might not have loaded properly');
    console.error('Try opening the URL in browser first to verify it works');
    process.exit(1);
  }

  // ─── Post-processing ──────────────────────────────────────────────────────
  let md = textStr.trim();

  // 1. Strip TOC/navigation preamble
  const textStart = md.search(/\n(?:Стаття 1[\.\s]|Глава [IІ1]\b|Розділ [IІ1]\b|ЗАГАЛЬНІ ПОЛОЖЕННЯ)/);
  if (textStart > 500) {
    const beforeArticle = md.lastIndexOf('\n', textStart - 1);
    const cutPoint = beforeArticle > 0 ? beforeArticle : textStart;
    const preambleLines = md.substring(0, cutPoint).split('\n').length;
    console.log(`Stripped ${preambleLines} lines of TOC/navigation preamble`);
    md = md.substring(cutPoint).trim();
  }

  // 2. Strip footer junk (search form, navigation)
  const footerPatterns = [
    /\n#{1,4}\s*Пошук у тексті[\s\S]*$/,
    /\n\s*×\s*\n[\s\S]*Знайти:[\s\S]*$/,
    /\n\s*Пошук\s*\n\s*закрити\s*$/,
  ];
  for (const pattern of footerPatterns) {
    md = md.replace(pattern, '');
  }

  // 3. Separate notes from next article: "*{...}*Стаття" → "*{...}*\n\nСтаття"
  md = md.replace(/\}\*\s*(Стаття\s)/g, '}*\n\n$1');
  md = md.replace(/\}\*\s*(Глава\s)/g, '}*\n\n$1');
  md = md.replace(/\}\*\s*(Розділ\s)/g, '}*\n\n$1');

  // 4. Mark chapters as ## headings for chunker
  // "Глава I\nЗАГАЛЬНІ ПОЛОЖЕННЯ" → "## Глава I. ЗАГАЛЬНІ ПОЛОЖЕННЯ"
  md = md.replace(/(^|\n)(Глава\s+[IVXLC\d]+[-\d]*)\s*\n\s*([А-ЯІЇЄҐ][А-ЯІЇЄҐ\s,'-]+)/g,
    (_, pre, chapter, title) => `${pre}\n## ${chapter}. ${title.trim()}\n`);

  // Розділ → ##
  md = md.replace(/(^|\n)(Розділ\s+[IVXLC\d]+[-\d]*)\s*\n\s*([А-ЯІЇЄҐ][А-ЯІЇЄҐ\s,'-]+)/g,
    (_, pre, section, title) => `${pre}\n## ${section}. ${title.trim()}\n`);

  // 5. Fix drop-cap artifacts: "С\nтаття" → "Стаття"
  md = md.replace(/С\nтаття/g, 'Стаття');

  // 6. Mark articles as ### headings for chunker
  md = md.replace(/(^|\n)(Стаття\s+\d+[-\d]*\.\s)/g, '$1\n### $2');

  // 6. Remove empty headings (artifact from regex)
  md = md.replace(/\n##\s*\n/g, '\n');
  md = md.replace(/\n###\s*\n/g, '\n');

  // 7. Collapse multiple newlines
  md = md.replace(/\n{3,}/g, '\n\n');
  md = md.replace(/[ \t]+$/gm, '');
  md = md.trim();

  // 7. Add title
  // Clean: remove " | від 10.12.1971 № 322-VIII" suffix, trailing dots
  const cleanTitle = titleStr.replace(/\s*\|.*$/, '').replace(/\.{2,}$/, '').replace(/\s+$/, '');
  if (cleanTitle) {
    md = `# ${cleanTitle}\n\n${md}`;
  }

  // Resolve output path
  const outPath = path.resolve(outputFile);
  fs.writeFileSync(outPath, md, 'utf-8');

  const lines = md.split('\n').length;
  const chars = md.length;
  console.log(`Done: ${outPath}`);
  console.log(`  ${lines} lines, ${chars} chars`);
}

fetchLaw().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
