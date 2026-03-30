/**
 * Shared JSON cleaning utilities for KB module.
 * AI models return JSON wrapped in markdown fences or with extra text —
 * these helpers extract valid JSON from noisy responses.
 */

/** Strip markdown fences and extract first JSON object from AI response. */
export function cleanJsonResponse(raw: string): string {
  let s = raw.replace(/```json\n?|\n?```/g, '').trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  return s;
}

/**
 * Sanitize JSON string: escape literal control characters (newlines, tabs)
 * inside string values. LLMs occasionally emit unescaped control chars.
 */
export function sanitizeJsonString(input: string): string {
  let result = '';
  let inString = false;
  let backslash = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (backslash) {
      result += ch;
      backslash = false;
      continue;
    }
    if (ch === '\\' && inString) {
      backslash = true;
      result += ch;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      result += ch;
      continue;
    }
    if (inString) {
      if (ch === '\n') { result += '\\n'; continue; }
      if (ch === '\r') { result += '\\r'; continue; }
      if (ch === '\t') { result += '\\t'; continue; }
    }
    result += ch;
  }
  return result;
}
