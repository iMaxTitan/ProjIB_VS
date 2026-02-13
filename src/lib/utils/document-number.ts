/**
 * Извлечь номер документа из текста.
 * Форматы: "Регистрационний № 123/2026", "СЗ-123/2026", "СЗ №123", "№ СЗ-123",
 *          "ПРОТОКОЛ № E-2026-000012", "№ E-2025-011726"
 */
export function extractDocumentNumberFromText(text: string): string | null {
  const patterns = [
    // E-номер (протоколы, наради и т.д.): "№ E-2026-000012"
    /№\s*(E-\d{4}-\d+)/i,
    /Регистрацион(?:ный|ний)\s*№\s*:?\s*([^\n\r,;]+)/i,
    /СЗ[-\s]*№?\s*:?\s*([^\n\r,;]+)/i,
    /№\s*СЗ[-\s]*:?\s*([^\n\r,;]+)/i,
    /Служебн(?:ая|а)\s+записк(?:а|а)\s*№?\s*:?\s*([^\n\r,;]+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      let result = match[1].trim();
      result = result.replace(/^[:\s]+/, '');
      return result.substring(0, 50);
    }
  }
  return null;
}
