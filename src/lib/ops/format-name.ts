/**
 * Утилита для форматирования ФИО.
 */

/** "Бондаренко Людмила Іванівна" → "Бондаренко Л.І." */
export function toShortName(fullName: string | null | undefined): string {
  if (!fullName) return 'Без імені';
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Без імені';
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} ${parts[1][0]}.`;
  return `${parts[0]} ${parts[1][0]}.${parts[2][0]}.`;
}
