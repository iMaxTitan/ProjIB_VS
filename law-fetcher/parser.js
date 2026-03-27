/**
 * parser.js — Title/text extraction scripts and post-processing for law documents.
 * Extracted from fetcher.js to keep file sizes manageable.
 */

// ─── Extract title from page ──────────────────────────────────────────────────

const EXTRACT_TITLE_JS = `(function() {
  var h1 = document.querySelector('h1');
  if (h1 && h1.textContent.trim().length > 10) return h1.textContent.trim();
  var docTitle = document.querySelector('.doc_title, #doc_name, .card-title');
  if (docTitle && docTitle.textContent.trim().length > 10) return docTitle.textContent.trim();
  var t = document.title || '';
  return t.split('|')[0].trim();
})()`;

// ─── Extract body text as markdown ────────────────────────────────────────────

const EXTRACT_TEXT_JS = `(function() {
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
})()`;

// ─── Post-processing: clean up MD for RAG chunker ────────────────────────────

function postProcess(rawMd, rawTitle) {
  let md = rawMd.trim();

  // 1a. Strip date list at the beginning (revision dates from zakon.rada.gov.ua)
  // Pattern: lines of "DD.MM.YYYY" optionally with " •" marker, repeated
  md = md.replace(/^(\d{2}\.\d{2}\.\d{4}\s*•?\s*\n)+/gm, '');

  // 1b. Strip "Зміст документа" block — remove the TOC section entirely
  // TOC = "Зміст документа" header + all "- " list items until first non-list block
  const tocIdx = md.indexOf('Зміст документа');
  if (tocIdx >= 0) {
    // Find where the bulleted list ends: two consecutive non-list lines
    const after = md.substring(tocIdx);
    // Match: "Зміст документа" + any lines starting with "- " or empty, until a line that doesn't
    const tocBlock = after.match(/^Зміст документа\s*\n([\s\S]*?\n)\n(?=\S)/m);
    if (tocBlock) {
      md = md.substring(0, tocIdx) + md.substring(tocIdx + tocBlock[0].length);
    }
  }
  // Strip truncated TOC lines (contain …)
  md = md.replace(/^-?\s*\*?\*?[^*\n]*…[^*\n]*\*?\*?\s*$/gm, '');

  // 1c. Strip TOC/navigation preamble — find where real content starts
  const textStart = md.search(/\n(?:Стаття 1[\.\s]|Глава [IІ1]\b|Розділ [IІ1]\b|ЗАГАЛЬНІ ПОЛОЖЕННЯ|Преамбула\b|Preamble\b|ЧАСТИНА|SECTION|CHAPTER)/i);
  if (textStart > 500) {
    const beforeArticle = md.lastIndexOf('\n', textStart - 1);
    const cutPoint = beforeArticle > 0 ? beforeArticle : textStart;
    md = md.substring(cutPoint).trim();
  }

  // 2. Strip footer junk
  const footerPatterns = [
    /\n#{1,4}\s*Пошук у тексті[\s\S]*$/,
    /\n\s*×\s*\n[\s\S]*Знайти:[\s\S]*$/,
    /\n\s*Пошук\s*\n\s*закрити\s*$/,
  ];
  for (const pattern of footerPatterns) {
    md = md.replace(pattern, '');
  }

  // 3. Separate notes from next article
  md = md.replace(/\}\*\s*(Стаття\s)/g, '}*\n\n$1');
  md = md.replace(/\}\*\s*(Глава\s)/g, '}*\n\n$1');
  md = md.replace(/\}\*\s*(Розділ\s)/g, '}*\n\n$1');

  // 4. Mark chapters as ## headings (UA + EN for conventions)
  md = md.replace(/(^|\n)(Глава\s+[IVXLC\d]+[-\d]*)\s*\n\s*([А-ЯІЇЄҐ][А-ЯІЇЄҐ\s,'-]+)/g,
    (_, pre, chapter, title) => `${pre}\n## ${chapter}. ${title.trim()}\n`);
  md = md.replace(/(^|\n)(Розділ\s+[IVXLC\d]+[-\d]*)\s*\n\s*([А-ЯІЇЄҐ][А-ЯІЇЄҐ\s,'-]+)/g,
    (_, pre, section, title) => `${pre}\n## ${section}. ${title.trim()}\n`);
  md = md.replace(/(^|\n)(Частина\s+[IVXLC\d]+[-\d]*)\s*\n\s*([А-ЯІЇЄҐ][А-ЯІЇЄҐ\s,'-]+)/g,
    (_, pre, part, title) => `${pre}\n## ${part}. ${title.trim()}\n`);
  // Преамбула as ##
  md = md.replace(/(^|\n)(Преамбула)\s*\n/g, '$1\n## $2\n\n');

  // 5. Fix drop-cap artifacts
  md = md.replace(/С\nтаття/g, 'Стаття');

  // 6. Mark articles as ### headings
  md = md.replace(/(^|\n)(Стаття\s+\d+[-\d]*[\.\s])/g, '$1\n### $2');

  // 7. Remove empty headings
  md = md.replace(/\n##\s*\n/g, '\n');
  md = md.replace(/\n###\s*\n/g, '\n');

  // 8. Collapse whitespace
  md = md.replace(/\n{3,}/g, '\n\n');
  md = md.replace(/[ \t]+$/gm, '');
  md = md.trim();

  // 9. Add title
  const cleanTitle = rawTitle.replace(/\s*\|.*$/, '').replace(/\.{2,}$/, '').replace(/\s+$/, '');
  if (cleanTitle) {
    md = `# ${cleanTitle}\n\n${md}`;
  }

  return md;
}

/**
 * Post-process plain text from data.rada.gov.ua API (.txt endpoint).
 * Cleaner input than HTML — no TOC, no navigation, just law text.
 */
function postProcessTxt(rawText, title) {
  let md = rawText.trim();

  // 1. Strip references like ( 2824-15 ) — inline law references in brackets
  // Keep them as-is, they're useful context

  // 2. Mark sections as ## headings
  md = md.replace(/(^|\n)(Глава\s+[IVXLC\d]+[-\d]*)\s*[\.\-]\s*([^\n]+)/gm,
    (_, pre, chapter, name) => `${pre}\n## ${chapter}. ${name.trim()}\n`);
  md = md.replace(/(^|\n)(Розділ\s+[IVXLC\d]+[-\d]*)\s*[\.\-]\s*([^\n]+)/gm,
    (_, pre, section, name) => `${pre}\n## ${section}. ${name.trim()}\n`);
  md = md.replace(/(^|\n)(Частина\s+[IVXLC\d]+[-\d]*)\s*[\.\-]\s*([^\n]+)/gm,
    (_, pre, part, name) => `${pre}\n## ${part}. ${name.trim()}\n`);

  // 3. Преамбула as ##
  md = md.replace(/(^|\n)(Преамбула)\s*\n/g, '$1\n## $2\n\n');

  // 4. Mark articles as ### headings
  md = md.replace(/(^|\n)(Стаття\s+\d+[-\d]*[\.\s])/g, '$1\n### $2');

  // 5. Remove empty headings
  md = md.replace(/\n##\s*\n/g, '\n');
  md = md.replace(/\n###\s*\n/g, '\n');

  // 6. Collapse whitespace
  md = md.replace(/\n{3,}/g, '\n\n');
  md = md.replace(/[ \t]+$/gm, '');
  md = md.trim();

  // 7. Add title
  if (title) {
    md = `# ${title}\n\n${md}`;
  }

  return md;
}

module.exports = { EXTRACT_TITLE_JS, EXTRACT_TEXT_JS, postProcess, postProcessTxt };
