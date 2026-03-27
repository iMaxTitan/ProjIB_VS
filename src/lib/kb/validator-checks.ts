/**
 * KB Validator — structural check rules (Document Guide v2).
 * Internal module for validator.ts — not part of the public KB API.
 */

import type { DocumentStats, DocumentMetadata, ValidationCheck } from './validator';
import { isHeadingLine } from './chunker';
import {
  declension,
  LANG_LABEL,
  findRussianWords,
  hasPoorTableQuality,
  hasTableWithoutHeader,
} from './validator-stats';

// ── Constants ──────────────────────────────────────────────────────────────────

export const CHECK_LABELS: Record<string, string> = {
  METADATA: 'неповні метадані',
  NO_HEADINGS: 'відсутні заголовки',
  NO_HEADING_STYLES: 'заголовки без Word-стилів',
  TOO_SHORT: 'замалий обсяг',
  EMPTY_SECTIONS: 'порожні розділи',
  THIN_SECTIONS: 'розділи без розкриття',
  TABLE_NO_HEADER: 'таблиці без заголовків',
  ABBREVIATIONS_NOT_EXPANDED: 'нерозшифровані абревіатури',
};

const CROSS_REF_PATTERNS = [
  /відповідно до (розділу|пункту|підрозділу)\s+[\d.]+/i,
  /як (зазначено|описано|вказано) (вище|нижче|раніше)/i,
  /згідно з (розділом|пунктом)\s+[\d.]+/i,
  /дивіться (розділ|пункт)\s+[\d.]+/i,
  /дивись розділ/i,
  /див\.\s*(п\.|розд\.)/i,
  /у розділі\s+\d/i,
  /Додаток\s+[А-ЯІЇЄҐ]/,
  /Таблиця\s+\d+/,
];

// ── Section analysis (single pass) ────────────────────────────────────────────

interface SectionIssues {
  emptySections: string[];
  thinSections: string[];
}

function collectSectionIssues(text: string): SectionIssues {
  const emptySections: string[] = [];
  const thinSections: string[] = [];
  let currentHeading = '';
  let currentContent = '';

  const flush = () => {
    if (!currentHeading) return;
    if (/[\t.]\s*\d{1,3}\s*$/.test(currentHeading)) return; // skip TOC entries
    // Skip reference sections that are intentionally short (delegate to glossary/appendix)
    if (/терміни|визначення|глосарій|скорочення|абревіатур/i.test(currentHeading)) return;
    const trimmed = currentContent.trim();
    if (!trimmed) return;
    // Allow [ПОТРІБНО РОЗКРИТИ:] placeholder — AI marker for sections needing manual fill
    if (trimmed.includes('[ПОТРІБНО РОЗКРИТИ:')) return;
    if (trimmed.length < 50) {
      emptySections.push(currentHeading.trim().slice(0, 40));
    } else {
      const sentenceMatches = (trimmed.match(/[.!?][\s\n]/g) || []).length;
      const listItems = (trimmed.match(/[;:]\s*\n/g) || []).length;
      if (sentenceMatches + listItems < 3) thinSections.push(currentHeading.trim().slice(0, 40));
    }
  };

  for (const line of text.split('\n')) {
    if (isHeadingLine(line)) {
      flush();
      currentHeading = line;
      currentContent = '';
    } else {
      currentContent += line + '\n';
    }
  }
  flush();
  return { emptySections, thinSections };
}

// ── Metadata check ─────────────────────────────────────────────────────────────

function checkMetadata(metadata: DocumentMetadata): ValidationCheck {
  const missingMeta: string[] = [];
  if (!metadata.docType) missingMeta.push('тип документа');
  if (!metadata.docNumber) missingMeta.push('номер');
  if (!metadata.docDate) missingMeta.push('дата');
  if (!metadata.version) missingMeta.push('версія');
  if (!metadata.approver) missingMeta.push('хто затвердив');

  const detectedMeta = [
    metadata.docType,
    metadata.docNumber,
    metadata.docDate && `від ${metadata.docDate}`,
    metadata.version && `v${metadata.version}`,
    metadata.approver,
  ].filter(Boolean).join(' · ');

  if (missingMeta.length === 0) {
    return { id: 'METADATA', status: 'ok', label: 'Метадані титульної сторінки', detail: detectedMeta };
  }
  if (missingMeta.length === 5) {
    return {
      id: 'METADATA', status: 'warning', label: 'Метадані титульної сторінки',
      detail: 'Реквізити не розпізнані. Перевірте стилі Title/Subtitle на титульній сторінці',
    };
  }
  const info = detectedMeta ? `${detectedMeta} · ` : '';
  return {
    id: 'METADATA', status: 'warning', label: 'Метадані титульної сторінки',
    detail: `${info}Не знайдено: ${missingMeta.join(', ')}`,
  };
}

// ── Error checks ───────────────────────────────────────────────────────────────

function runErrorChecks(stats: DocumentStats, issues: SectionIssues): ValidationCheck[] {
  return [
    stats.sectionCount > 0
      ? { id: 'NO_HEADINGS', status: 'ok', label: 'Наявність заголовків',
          detail: `Знайдено ${stats.sectionCount} розділ${declension(stats.sectionCount, 'ів', '', 'и')}` }
      : { id: 'NO_HEADINGS', status: 'error', label: 'Наявність заголовків',
          detail: 'Заголовки розділів не знайдено. Структуруйте документ нумерованими розділами (1. Назва)' },

    stats.wordCount >= 300
      ? { id: 'TOO_SHORT', status: 'ok', label: 'Мінімальний обсяг', detail: `${stats.wordCount} слів` }
      : { id: 'TOO_SHORT', status: 'error', label: 'Мінімальний обсяг',
          detail: `${stats.wordCount} слів (мінімум 300)` },

    issues.emptySections.length === 0
      ? { id: 'EMPTY_SECTIONS', status: 'ok', label: 'Наповненість розділів',
          detail: 'Всі розділи мають достатній зміст' }
      : { id: 'EMPTY_SECTIONS', status: 'error', label: 'Наповненість розділів',
          detail: `Порожні або короткі розділи: ${issues.emptySections.slice(0, 3).join(', ')}` },
  ];
}

// ── Abbreviation check ──────────────────────────────────────────────────────────

const KNOWN_ABBREVIATIONS = new Set([
  'ІБ', 'СУІБ', 'ТОВ', 'АТ', 'ОС', 'ПК', 'ПЗ', 'IT', 'HR', 'ISO', 'GDPR',
  'ІТ', 'НД', 'БД', 'API', 'PDF', 'DOCX', 'URL', 'HTTP', 'HTTPS',
  'ЄС', 'ЗМІ', 'НБУ', 'КМУ', 'CEO', 'CTO', 'CFO', 'COO',
  'ДСТУ', 'ДБН', 'СОУ', 'МОЗ', 'МВС', 'СБУ', 'РНБО', 'SLA', 'KPI',
]);

function checkAbbreviations(cleanedText: string): ValidationCheck | null {
  // If document references a glossary, it's ok
  if (/глосарі[йю]/i.test(cleanedText) || /перелік\s+(скорочень|абревіатур)/i.test(cleanedText)) {
    return {
      id: 'ABBREVIATIONS_NOT_EXPANDED', status: 'ok',
      label: 'Розшифровка абревіатур',
      detail: 'Документ посилається на глосарій/перелік скорочень',
    };
  }

  const abbrs = new Set<string>();
  const matches = cleanedText.match(/(?<![А-ЯІЇЄҐа-яіїєґA-Za-z])[А-ЯІЇЄҐA-Z]{2,8}(?![А-ЯІЇЄҐа-яіїєґA-Za-z])/g);
  if (!matches) return null;

  for (const m of matches) {
    if (KNOWN_ABBREVIATIONS.has(m)) continue;
    // Check if expanded: "Повна Назва (АБВГ)" or "АБВГ — Повна Назва"
    const expanded = new RegExp(`[А-ЯІЇЄҐа-яіїєґ]{3,}[^(]*\\(${m}\\)|${m}\\s*[—–-]\\s*[А-ЯІЇЄҐа-яіїєґ]`);
    if (!expanded.test(cleanedText)) abbrs.add(m);
  }
  if (abbrs.size <= 2) return null;

  const list = [...abbrs].slice(0, 5).join(', ');
  return {
    id: 'ABBREVIATIONS_NOT_EXPANDED', status: 'warning',
    label: 'Розшифровка абревіатур',
    detail: `${abbrs.size} абревіатур без розшифровки: ${list}. Розшифруйте при першому вживанні або додайте глосарій`,
  };
}

// ── Warning checks ─────────────────────────────────────────────────────────────

function runWarningChecks(
  stats: DocumentStats,
  cleanedText: string,
  issues: SectionIssues,
  headingsFromStyles?: boolean,
): ValidationCheck[] {
  const checks: ValidationCheck[] = [];

  if (stats.sectionCount >= 3) {
    const avgWordsPerSection = Math.round(stats.wordCount / stats.sectionCount);
    if (stats.subsectionCount > 0) {
      checks.push({ id: 'NO_SUBHEADINGS', status: 'ok', label: 'Підрозділи (H2)',
        detail: `Знайдено ${stats.subsectionCount} підрозділ${declension(stats.subsectionCount, 'ів', '', 'и')}` });
    } else if (avgWordsPerSection >= 150) {
      checks.push({ id: 'NO_SUBHEADINGS', status: 'warning', label: 'Підрозділи (H2)',
        detail: `Відсутні підрозділи (формат 1.1, 1.2). Середній розмір розділу ~${avgWordsPerSection} сл. — рекомендовано розбити` });
    } else {
      checks.push({ id: 'NO_SUBHEADINGS', status: 'ok', label: 'Підрозділи (H2)',
        detail: `Підрозділи не потрібні — середній розмір розділу ~${avgWordsPerSection} сл.` });
    }
  }

  if (issues.thinSections.length > 0) {
    checks.push({ id: 'THIN_SECTIONS', status: 'warning', label: 'Розкриття розділів',
      detail: `Менше 3 речень у: ${issues.thinSections.slice(0, 3).join(', ')}` });
  }

  const ruWords = findRussianWords(cleanedText);
  const mixedDetail = ruWords.length > 0
    ? `Рос. символи у словах: ${ruWords.map(w => `«${w}»`).join(', ')}`
    : 'Виявлено змішування мов (англ. символи). Рекомендована однорідна мова';
  checks.push(
    stats.language !== 'mixed'
      ? { id: 'MIXED_LANGUAGE', status: 'ok', label: 'Мова документа', detail: LANG_LABEL[stats.language] }
      : { id: 'MIXED_LANGUAGE', status: 'warning', label: 'Мова документа', detail: mixedDetail },
  );

  if (stats.tableCount > 0) {
    checks.push(
      !hasPoorTableQuality(cleanedText)
        ? { id: 'POOR_TABLE_QUALITY', status: 'ok', label: 'Заповненість таблиць',
            detail: `${stats.tableCount} таблиц${declension(stats.tableCount, 'ь', 'я', 'і')}, заповненість ≥30%` }
        : { id: 'POOR_TABLE_QUALITY', status: 'warning', label: 'Заповненість таблиць',
            detail: 'Є таблиці із заповненістю <30%. Можливо порожні шаблонні таблиці' },
    );
    if (hasTableWithoutHeader(cleanedText)) {
      checks.push({ id: 'TABLE_NO_HEADER', status: 'warning', label: 'Заголовки таблиць',
        detail: 'Є таблиці без рядка-заголовка. Додайте шапку згідно з вимогами гіду' });
    }
  }

  if (stats.hasArtifacts.toc) {
    checks.push({ id: 'TOC_DETECTED', status: 'warning', label: 'Зміст документа',
      detail: 'Виявлено зміст (TOC). Він буде виключений з індексації автоматично' });
  }

  const shortParas = cleanedText.split(/\n{2,}/)
    .filter(p => p.trim().length > 0 && p.trim().length < 10).length;
  if (stats.paragraphCount > 0 && shortParas / stats.paragraphCount > 0.30) {
    checks.push({ id: 'MANY_ARTIFACTS', status: 'warning', label: 'Мікро-фрагменти',
      detail: `${shortParas} коротких фрагментів (<10 символів). Можливі артефакти форматування` });
  }

  // NO_HEADING_STYLES: headings found by bold heuristic, not Word styles
  if (headingsFromStyles === false && stats.sectionCount > 0) {
    checks.push({ id: 'NO_HEADING_STYLES', status: 'warning', label: 'Word Heading стилі',
      detail: 'Заголовки розпізнано за bold-форматуванням, а не Word-стилями. Для надійного парсингу застосуйте стилі Heading 1/2/3' });
  }

  // ABBREVIATIONS: check for unexpanded abbreviations
  const abbrCheck = checkAbbreviations(cleanedText);
  if (abbrCheck) checks.push(abbrCheck);

  return checks;
}

// ── Info checks ────────────────────────────────────────────────────────────────

function runInfoChecks(stats: DocumentStats, cleanedText: string): ValidationCheck[] {
  const checks: ValidationCheck[] = [];

  if (CROSS_REF_PATTERNS.some(re => re.test(cleanedText))) {
    checks.push({ id: 'CROSS_REFERENCES', status: 'warning', label: 'Самодостатність розділів',
      detail: 'Виявлено посилання «як зазначено вище», «відповідно до розділу X». При пошуку контекст між розділами губиться' });
  }

  if (stats.sectionCount > 5 && !stats.hasArtifacts.toc) {
    checks.push({ id: 'TOC_REQUIRED', status: 'info', label: 'Рекомендовано зміст',
      detail: `${stats.sectionCount} розділів — рекомендовано додати зміст (TOC) згідно з Document Guide` });
  }

  return checks;
}

// ── Main export ────────────────────────────────────────────────────────────────

export function runChecks(
  stats: DocumentStats,
  cleanedText: string,
  metadata: DocumentMetadata,
  headingsFromStyles?: boolean,
): ValidationCheck[] {
  // Single pass for empty/thin section detection — shared by error + warning checks.
  const issues = collectSectionIssues(cleanedText);

  return [
    checkMetadata(metadata),
    ...runErrorChecks(stats, issues),
    ...runWarningChecks(stats, cleanedText, issues, headingsFromStyles),
    ...runInfoChecks(stats, cleanedText),
  ];
}
