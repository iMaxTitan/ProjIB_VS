/**
 * PDF generation helpers — shared config, fonts, and drawing utilities.
 */
import path from 'path';
import fs from 'fs';

export const PDF_CONFIG = {
  margin: 40,
  fontSize: {
    header: 11,
    title: 14,
    subtitle: 12,
    heading: 10,
    body: 9,
    small: 8,
    table: 8,
  },
  colors: {
    black: '#000000',
    gray: '#666666',
  },
};

const FONTS_DIR = path.join(process.cwd(), 'public', 'fonts');
export const FONT_REGULAR = path.join(FONTS_DIR, 'Roboto-Regular.ttf');
export const FONT_BOLD = path.join(FONTS_DIR, 'Roboto-Bold.ttf');

export function checkFonts(): { regular: boolean; bold: boolean } {
  return {
    regular: fs.existsSync(FONT_REGULAR),
    bold: fs.existsSync(FONT_BOLD),
  };
}

export function drawTableLine(doc: PDFKit.PDFDocument, y: number, x: number, width: number): void {
  doc.moveTo(x, y).lineTo(x + width, y).strokeColor('#000000').lineWidth(0.5).stroke();
}

export function drawTableVerticals(
  doc: PDFKit.PDFDocument,
  startY: number,
  endY: number,
  startX: number,
  colWidths: number[]
): void {
  let x = startX;
  doc.moveTo(x, startY).lineTo(x, endY).strokeColor('#000000').lineWidth(0.5).stroke();
  for (const width of colWidths) {
    x += width;
    doc.moveTo(x, startY).lineTo(x, endY).strokeColor('#000000').lineWidth(0.5).stroke();
  }
}

export function formatDateUkrainian(date: Date): string {
  return date.toLocaleDateString('uk-UA');
}

export const MONTHS_UA = [
  'січень', 'лютий', 'березень', 'квітень', 'травень', 'червень',
  'липень', 'серпень', 'вересень', 'жовтень', 'листопад', 'грудень',
];

export const MONTHS_UA_GEN = [
  'січня', 'лютого', 'березня', 'квітня', 'травня', 'червня',
  'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня',
];
