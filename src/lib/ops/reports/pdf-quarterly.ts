/**
 * PDF generation — quarterly plan and quarterly report.
 */
import PDFDocument from 'pdfkit';
import { QuarterlyPlanPDFData, QuarterlyReportPDFData } from './index';
import { FONT_REGULAR, FONT_BOLD, checkFonts, drawTableLine, drawTableVerticals } from './pdf-helpers';

const QUARTER_ROMAN: Record<number, string> = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV' };

/**
 * Генерирует PDF квартального плана (книжная ориентация).
 */
export async function generateQuarterlyPlanPDF(data: QuarterlyPlanPDFData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const fonts = checkFonts();
      if (!fonts.regular) throw new Error(`Шрифт Roboto-Regular.ttf не знайдено: ${FONT_REGULAR}`);

      const qLabel = QUARTER_ROMAN[data.quarter] || String(data.quarter);
      const doc = new PDFDocument({
        size: 'A4', layout: 'portrait',
        margins: { top: 40, bottom: 40, left: 40, right: 40 },
        autoFirstPage: false,
        info: { Title: `План роботи УІБК на ${qLabel} квартал ${data.year} р.`, Author: 'SOC System' },
      });

      doc.registerFont('Roboto', FONT_REGULAR);
      if (fonts.bold) doc.registerFont('Roboto-Bold', FONT_BOLD);
      doc.font('Roboto');
      doc.addPage();

      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const startX = doc.page.margins.left;
      const fullWidth = doc.page.width;
      let y = doc.page.margins.top;

      // Заголовок
      doc.fontSize(13);
      if (fonts.bold) doc.font('Roboto-Bold');
      doc.text('План роботи Управління інформаційної безпеки', 0, y, { width: fullWidth, align: 'center' }); y += 16;
      doc.text(`на ${qLabel} квартал ${data.year} р.`, 0, y, { width: fullWidth, align: 'center' }); y += 25;
      doc.font('Roboto');

      // Конфигурация таблицы
      const numberCol = 32, departmentCol = 72, termCol = 84;
      const flexibleCol = Math.max(80, (pageWidth - numberCol - departmentCol - termCol) / 2);
      const colWidths = [numberCol, flexibleCol, departmentCol, termCol, flexibleCol];
      const tableWidth = colWidths.reduce((a, b) => a + b, 0);
      const tableStartX = startX;
      doc.fontSize(8);

      const lastMonth = data.quarter * 3;
      const deadline = `19.${String(lastMonth).padStart(2, '0')}.${data.year}`;

      const drawHeader = (yPos: number): number => {
        const headerStartY = yPos;
        drawTableLine(doc, yPos, tableStartX, tableWidth);
        const headerTexts = ['№', 'Перелік завдань', 'Підрозділ', 'Термін', 'Очікуваний результат'];
        let maxH = 0;
        for (let i = 0; i < headerTexts.length; i++) {
          const h = doc.heightOfString(headerTexts[i], { width: colWidths[i] - 6 });
          if (h > maxH) maxH = h;
        }
        const headerH = maxH + 8;
        if (fonts.bold) doc.font('Roboto-Bold');
        let colX = tableStartX + 3;
        for (let i = 0; i < headerTexts.length; i++) {
          doc.text(headerTexts[i], colX, yPos + 4, { width: colWidths[i] - 6, align: 'center' });
          colX += colWidths[i];
        }
        doc.font('Roboto');
        yPos += headerH;
        drawTableLine(doc, yPos, tableStartX, tableWidth);
        drawTableVerticals(doc, headerStartY, yPos, tableStartX, colWidths);
        return yPos;
      };

      y = drawHeader(y);

      for (let i = 0; i < data.plans.length; i++) {
        const plan = data.plans[i];
        const goalH = doc.heightOfString(plan.goal, { width: colWidths[1] - 6 });
        const resultH = doc.heightOfString(plan.expected_result, { width: colWidths[4] - 6 });
        const rowH = Math.max(goalH, resultH, 14) + 8;
        if (y + rowH > doc.page.height - doc.page.margins.bottom) { doc.addPage(); y = doc.page.margins.top; y = drawHeader(y); }
        const rowY = y;
        let colX = tableStartX + 3;
        doc.text(String(i + 1), colX, y + 4, { width: colWidths[0] - 6, align: 'center' }); colX += colWidths[0];
        doc.text(plan.goal, colX, y + 4, { width: colWidths[1] - 6 }); colX += colWidths[1];
        doc.text(plan.department_code || plan.department_name, colX, y + 4, { width: colWidths[2] - 6, align: 'center' }); colX += colWidths[2];
        doc.text(deadline, colX, y + 4, { width: colWidths[3] - 6, align: 'center' }); colX += colWidths[3];
        doc.text(plan.expected_result, colX, y + 4, { width: colWidths[4] - 6 });
        y = rowY + rowH;
        drawTableLine(doc, y, tableStartX, tableWidth);
        drawTableVerticals(doc, rowY, y, tableStartX, colWidths);
      }

      if (data.plans.length === 0) {
        const rowY = y;
        doc.text('Завдання за цей квартал відсутні', tableStartX + 3, y + 4, { width: tableWidth - 6, align: 'center' });
        y += 20; drawTableLine(doc, y, tableStartX, tableWidth); drawTableVerticals(doc, rowY, y, tableStartX, colWidths);
      }

      doc.end();
    } catch (error: unknown) { reject(error); }
  });
}

/**
 * Генерирует PDF квартального отчёта (альбомная ориентация).
 */
export async function generateQuarterlyReportPDF(data: QuarterlyReportPDFData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const fonts = checkFonts();
      if (!fonts.regular) throw new Error(`Шрифт Roboto-Regular.ttf не знайдено: ${FONT_REGULAR}`);

      const qLabel = QUARTER_ROMAN[data.quarter] || String(data.quarter);
      const doc = new PDFDocument({
        size: 'A4', layout: 'landscape',
        margins: { top: 40, bottom: 40, left: 40, right: 40 },
        autoFirstPage: false,
        info: { Title: `Звіт про роботу УІБК за ${qLabel} квартал ${data.year} р.`, Author: 'SOC System' },
      });

      doc.registerFont('Roboto', FONT_REGULAR);
      if (fonts.bold) doc.registerFont('Roboto-Bold', FONT_BOLD);
      doc.font('Roboto');
      doc.addPage();

      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const startX = doc.page.margins.left;
      const fullWidth = doc.page.width;
      let y = doc.page.margins.top;

      // Заголовок
      doc.fontSize(13);
      if (fonts.bold) doc.font('Roboto-Bold');
      doc.text('ЗВІТ', 0, y, { width: fullWidth, align: 'center' }); y += 16;
      doc.text('про роботу Управління інформаційної безпеки', 0, y, { width: fullWidth, align: 'center' }); y += 16;
      doc.text(`за ${qLabel} квартал ${data.year} р.`, 0, y, { width: fullWidth, align: 'center' }); y += 25;
      doc.font('Roboto');

      // Конфигурация таблицы (6 колонок)
      const numberCol = 28, departmentCol = 72, deadlineCol = 80, statusCol = 68;
      const flexTotal = pageWidth - numberCol - departmentCol - deadlineCol - statusCol;
      const goalCol = Math.round(flexTotal * 0.4);
      const colWidths = [numberCol, goalCol, departmentCol, deadlineCol, statusCol, flexTotal - goalCol];
      const tableWidth = colWidths.reduce((a, b) => a + b, 0);
      const tableStartX = startX;
      doc.fontSize(8);

      const drawHeader = (yPos: number): number => {
        const headerStartY = yPos;
        drawTableLine(doc, yPos, tableStartX, tableWidth);
        const headerTexts = ['№', 'Перелік завдань', 'Відповідальний підрозділ', 'Плановий строк закінчення виконання', 'Результат виконання', 'Примітка'];
        let maxH = 0;
        for (let i = 0; i < headerTexts.length; i++) {
          const h = doc.heightOfString(headerTexts[i], { width: colWidths[i] - 6 });
          if (h > maxH) maxH = h;
        }
        const headerH = maxH + 8;
        if (fonts.bold) doc.font('Roboto-Bold');
        let colX = tableStartX + 3;
        for (let i = 0; i < headerTexts.length; i++) {
          doc.text(headerTexts[i], colX, yPos + 4, { width: colWidths[i] - 6, align: 'center' });
          colX += colWidths[i];
        }
        doc.font('Roboto');
        yPos += headerH;
        drawTableLine(doc, yPos, tableStartX, tableWidth);
        drawTableVerticals(doc, headerStartY, yPos, tableStartX, colWidths);
        return yPos;
      };

      y = drawHeader(y);

      for (let i = 0; i < data.plans.length; i++) {
        const plan = data.plans[i];
        const noteText = plan.ai_note || plan.expected_result;
        const goalH = doc.heightOfString(plan.goal, { width: colWidths[1] - 6 });
        const noteH = doc.heightOfString(noteText, { width: colWidths[5] - 6 });
        const rowH = Math.max(goalH, noteH, 14) + 8;
        if (y + rowH > doc.page.height - doc.page.margins.bottom) { doc.addPage(); y = doc.page.margins.top; y = drawHeader(y); }
        const rowY = y;
        let colX = tableStartX + 3;
        doc.text(String(i + 1), colX, y + 4, { width: colWidths[0] - 6, align: 'center' }); colX += colWidths[0];
        doc.text(plan.goal, colX, y + 4, { width: colWidths[1] - 6 }); colX += colWidths[1];
        doc.text(plan.department_code || plan.department_name, colX, y + 4, { width: colWidths[2] - 6, align: 'center' }); colX += colWidths[2];
        doc.text(plan.deadline, colX, y + 4, { width: colWidths[3] - 6, align: 'center' }); colX += colWidths[3];
        doc.text(plan.status, colX, y + 4, { width: colWidths[4] - 6, align: 'center' }); colX += colWidths[4];
        doc.text(noteText, colX, y + 4, { width: colWidths[5] - 6 });
        y = rowY + rowH;
        drawTableLine(doc, y, tableStartX, tableWidth);
        drawTableVerticals(doc, rowY, y, tableStartX, colWidths);
      }

      if (data.plans.length === 0) {
        const rowY = y;
        doc.text('Завдання за цей квартал відсутні', tableStartX + 3, y + 4, { width: tableWidth - 6, align: 'center' });
        y += 20; drawTableLine(doc, y, tableStartX, tableWidth); drawTableVerticals(doc, rowY, y, tableStartX, colWidths);
      }

      doc.end();
    } catch (error: unknown) { reject(error); }
  });
}
