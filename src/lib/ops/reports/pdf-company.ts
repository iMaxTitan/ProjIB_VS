/**
 * PDF generation — company report (Додаток до Акту).
 */
import PDFDocument from 'pdfkit';
import { CompanyReportData, MONTH_NAMES_UK } from './index';
import logger from '@/lib/shared/logger';
import { DEFAULT_EXECUTOR, DEFAULT_CONTRACT } from '../contracts';
import { PDF_CONFIG, FONT_REGULAR, FONT_BOLD, checkFonts, drawTableLine, drawTableVerticals, MONTHS_UA, MONTHS_UA_GEN } from './pdf-helpers';

export async function generateCompanyReportPDF(data: CompanyReportData): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    try {
      const fonts = checkFonts();
      if (!fonts.regular) {
        throw new Error(`Шрифт Roboto-Regular.ttf не знайдено за шляхом: ${FONT_REGULAR}`);
      }

      const procedures = data.procedures || [];
      logger.info('[PDF] Процедур для отчёта:', procedures.length);

      const doc = new PDFDocument({
        size: 'A4', layout: 'landscape',
        margins: { top: 40, bottom: 40, left: 40, right: 40 },
        autoFirstPage: false,
        info: {
          Title: `Додаток до Акту - ${data.company.company_name} - ${MONTH_NAMES_UK[data.period.month - 1]} ${data.period.year}`,
          Author: 'SOC System',
        },
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
      let y = doc.page.margins.top;

      const monthUA = MONTHS_UA[data.period.month - 1];
      const monthGen = MONTHS_UA_GEN[data.period.month - 1];
      const lastDay = new Date(data.period.year, data.period.month, 0).getDate();

      // Заголовок — Додаток до Акту (правий верх)
      const dateStr = `${lastDay}.${String(data.period.month).padStart(2, '0')}.${data.period.year}`;
      doc.fontSize(PDF_CONFIG.fontSize.body);
      doc.text('Додаток до Акту', startX, y, { width: pageWidth, align: 'right' });
      y += 12;
      doc.text(`приймання-передачі послуг № ___ від ${dateStr} р.`, startX, y, { width: pageWidth, align: 'right' });
      y += 20;

      // ЗВІТ (центр, жирний)
      const fullWidth = doc.page.width;
      doc.fontSize(PDF_CONFIG.fontSize.title);
      if (fonts.bold) doc.font('Roboto-Bold');
      doc.text('ЗВІТ', 0, y, { width: fullWidth, align: 'center' });
      y += 16;
      doc.font('Roboto');
      doc.fontSize(PDF_CONFIG.fontSize.heading);
      doc.text('про надання послуг забезпечення кібербезпеки інформаційно-комунікаційних систем,', 0, y, { width: fullWidth, align: 'center' });
      y += 12;
      doc.text('програмних продуктів та інформації', 0, y, { width: fullWidth, align: 'center' });
      y += 14;
      if (fonts.bold) doc.font('Roboto-Bold');
      doc.text(`за ${monthUA} ${data.period.year} рік`, 0, y, { width: fullWidth, align: 'center' });
      doc.font('Roboto');
      y += 20;

      // Місто та дата
      doc.fontSize(PDF_CONFIG.fontSize.body);
      doc.text('м. Дніпро', startX, y);
      doc.text(`${lastDay} ${monthGen} ${data.period.year}`, startX + pageWidth - 140, y, { width: 140, align: 'right' });
      y += 12;

      // Реквізити
      const labelW = 200, labelX = startX, valueX = startX + labelW + 10, valueW = pageWidth - labelW - 10, lineH = 11;
      const drawField = (label: string, value: string) => {
        doc.fontSize(PDF_CONFIG.fontSize.body);
        const labelH = doc.heightOfString(label, { width: labelW });
        const valueH = doc.heightOfString(value, { width: valueW });
        doc.text(label, labelX, y, { width: labelW });
        doc.text(value, valueX, y, { width: valueW });
        y += Math.max(labelH, valueH, lineH) + 2;
      };

      const contractNum = data.company.contract_number || DEFAULT_CONTRACT.number;
      const contractDate = data.company.contract_date || DEFAULT_CONTRACT.date;
      drawField('Номер договору:', contractNum);
      drawField('Дата укладання договору:', contractDate);
      drawField('Код згідно з Державним класифікатором продукції та послуг, що надаються Виконавцем за цим договором:', `${DEFAULT_CONTRACT.dkCode} (${DEFAULT_CONTRACT.dkDescription}).`);
      drawField('Підстава:', `${DEFAULT_CONTRACT.pidstavaPrefix} 01 ${monthGen} ${data.period.year} року`);

      // Сума
      const rate = Number(data.company.rate_per_hour) || 0;
      const totalHours = data.summary.total_hours || 0;
      const sumWithoutVAT = Math.round(totalHours * rate * 100) / 100;
      const vat = Math.round(sumWithoutVAT * 0.2 * 100) / 100;
      const sumWithVAT = Math.round((sumWithoutVAT + vat) * 100) / 100;
      const fmtSum = (v: number) => v > 0 ? v.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '___';
      doc.fontSize(PDF_CONFIG.fontSize.body);
      const sumaLabelH = doc.heightOfString('Сума оплати наданих робіт, послуг:', { width: labelW });
      doc.text('Сума оплати наданих робіт, послуг:', labelX, y, { width: labelW });
      const sumaStartY = y;
      doc.text(`без ПДВ – ${fmtSum(sumWithoutVAT)} грн`, valueX, sumaStartY, { width: valueW });
      doc.text(`ПДВ, 20 % – ${fmtSum(vat)} грн`, valueX, sumaStartY + lineH, { width: valueW });
      doc.text(`разом з ПДВ – ${fmtSum(sumWithVAT)} грн`, valueX, sumaStartY + lineH * 2, { width: valueW });
      y += Math.max(sumaLabelH, lineH * 3) + 2;
      drawField('Найменування замовника:', data.company.company_name);
      drawField('Причини розірвання договору, якщо таке мало місце:', 'Відсутні');
      y += 4;

      // Надпис Таблиця № 1
      doc.text('Таблиця № 1', startX + pageWidth - 80, y, { width: 80, align: 'right' });
      y += 13;

      // Таблица процедур (6 колонок)
      const colWidths = [28, pageWidth * 0.22, pageWidth * 0.18, 55, 55, 0];
      colWidths[5] = pageWidth - colWidths[0] - colWidths[1] - colWidths[2] - colWidths[3] - colWidths[4];
      const tableWidth = pageWidth, tableStartX = startX;
      doc.fontSize(7);

      const drawProcedureTableHeader = () => {
        const hY = y;
        drawTableLine(doc, y, tableStartX, tableWidth);
        y += 2;
        if (fonts.bold) doc.font('Roboto-Bold');
        let cx = tableStartX + 3;
        doc.text('№\nп/п', cx, y, { width: colWidths[0] - 6, align: 'center' }); cx += colWidths[0];
        doc.text('Найменування робіт, послуг', cx, y + 2, { width: colWidths[1] - 6, align: 'center' }); cx += colWidths[1];
        doc.text('Відповідальні виконавці', cx, y + 2, { width: colWidths[2] - 6, align: 'center' }); cx += colWidths[2];
        doc.text('Задіяно\nспівроб\nтників', cx, y, { width: colWidths[3] - 6, align: 'center' }); cx += colWidths[3];
        doc.text('Трудо\nвитрати,\nл/годин', cx, y, { width: colWidths[4] - 6, align: 'center' }); cx += colWidths[4];
        doc.text('Інформація про виконання', cx, y + 2, { width: colWidths[5] - 6, align: 'center' });
        doc.font('Roboto');
        y = hY + 32;
        drawTableLine(doc, y, tableStartX, tableWidth);
        drawTableVerticals(doc, hY, y, tableStartX, colWidths);
      };

      drawProcedureTableHeader();

      let rowNum = 1;
      for (const proc of procedures) {
        const nameH = doc.heightOfString(proc.service_name || proc.procedure_name || '—', { width: colWidths[1] - 6 });
        const execH = doc.heightOfString(proc.responsible_executors || '—', { width: colWidths[2] - 6 });
        const noteText = proc.note || '—';
        const noteH = doc.heightOfString(noteText, { width: colWidths[5] - 6 });
        const rowHeight = Math.max(nameH, execH, noteH, 14) + 6;
        if (y + rowHeight > doc.page.height - 50) { doc.addPage(); y = doc.page.margins.top; drawProcedureTableHeader(); }
        const rowY = y; y += 3;
        let cx = tableStartX + 3;
        doc.text(String(rowNum), cx, y, { width: colWidths[0] - 6, align: 'center' }); cx += colWidths[0];
        doc.text(proc.service_name || proc.procedure_name || '—', cx, y, { width: colWidths[1] - 6 }); cx += colWidths[1];
        doc.text(proc.responsible_executors || '—', cx, y, { width: colWidths[2] - 6 }); cx += colWidths[2];
        doc.text(String(proc.employees_count), cx, y, { width: colWidths[3] - 6, align: 'center' }); cx += colWidths[3];
        doc.text(proc.hours.toFixed(2), cx, y, { width: colWidths[4] - 6, align: 'center' }); cx += colWidths[4];
        doc.text(noteText, cx, y, { width: colWidths[5] - 6 });
        y = rowY + rowHeight;
        drawTableLine(doc, y, tableStartX, tableWidth);
        drawTableVerticals(doc, rowY, y, tableStartX, colWidths);
        rowNum++;
      }

      if (procedures.length === 0) {
        const rowY = y; y += 3;
        doc.text('Роботи за звітний період відсутні', tableStartX + 3, y, { width: tableWidth - 6, align: 'center' });
        y += 16; drawTableLine(doc, y, tableStartX, tableWidth); drawTableVerticals(doc, rowY, y, tableStartX, colWidths);
      }

      // Підписи
      y += 30;
      if (y > doc.page.height - 90) { doc.addPage(); y = doc.page.margins.top + 15; }
      doc.fontSize(PDF_CONFIG.fontSize.body);
      const halfWidth = pageWidth / 2 - 15;
      if (fonts.bold) doc.font('Roboto-Bold');
      doc.text('Від Виконавця:', startX, y); doc.text('Від Замовника:', startX + halfWidth + 30, y);
      doc.font('Roboto'); y += 14;
      doc.fontSize(PDF_CONFIG.fontSize.small);
      doc.text(DEFAULT_EXECUTOR.name, startX, y, { width: halfWidth }); doc.text(data.company.company_name, startX + halfWidth + 30, y, { width: halfWidth });
      y += 28;
      doc.fontSize(PDF_CONFIG.fontSize.body);
      doc.text('_____________ / _____________ /', startX, y); doc.text('_____________ / _____________ /', startX + halfWidth + 30, y);
      y += 11;
      doc.fontSize(7);
      doc.fillColor(PDF_CONFIG.colors.gray);
      doc.text('(підпис)                (П.І.Б.)', startX + 15, y); doc.text('(підпис)                (П.І.Б.)', startX + halfWidth + 45, y);
      doc.fillColor(PDF_CONFIG.colors.black);
      doc.end();
    } catch (error: unknown) { reject(error); }
  });
}
