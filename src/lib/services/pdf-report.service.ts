/**
 * Сервис генерации PDF-отчетов
 * Формат: приложение к Акту приема-передачи услуг
 *
 * Документ формируется между предприятиями (Исполнитель - Заказчик)
 * Использует AI для качественного форматирования описаний работ
 */

import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';
import { CompanyReportData, EmployeeReportData, QuarterlyPlanPDFData, QuarterlyReportPDFData, MONTH_NAMES_UK, formatHours } from './monthly-report.service';
import logger from '@/lib/logger';
import {
  DEFAULT_EXECUTOR,
  DEFAULT_CONTRACT,
} from './contract-services';

// Конфигурация PDF
const PDF_CONFIG = {
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
  }
};

// Пути к шрифтам с поддержкой кириллицы
const FONTS_DIR = path.join(process.cwd(), 'public', 'fonts');
const FONT_REGULAR = path.join(FONTS_DIR, 'Roboto-Regular.ttf');
const FONT_BOLD = path.join(FONTS_DIR, 'Roboto-Bold.ttf');

function checkFonts(): { regular: boolean; bold: boolean } {
  return {
    regular: fs.existsSync(FONT_REGULAR),
    bold: fs.existsSync(FONT_BOLD),
  };
}

function drawTableLine(doc: PDFKit.PDFDocument, y: number, x: number, width: number): void {
  doc
    .moveTo(x, y)
    .lineTo(x + width, y)
    .strokeColor('#000000')
    .lineWidth(0.5)
    .stroke();
}

function drawTableVerticals(
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

function formatDateUkrainian(date: Date): string {
  return date.toLocaleDateString('uk-UA');
}

// Українські назви місяців (називний та родовий відмінки)
const MONTHS_UA = [
  'січень', 'лютий', 'березень', 'квітень', 'травень', 'червень',
  'липень', 'серпень', 'вересень', 'жовтень', 'листопад', 'грудень'
];
const MONTHS_UA_GEN = [
  'січня', 'лютого', 'березня', 'квітня', 'травня', 'червня',
  'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'
];


/**
 * Генерирует PDF-отчет по предприятию (приложение к Акту)
 */
export async function generateCompanyReportPDF(data: CompanyReportData): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    try {
      const fonts = checkFonts();
      if (!fonts.regular) {
        throw new Error(`Шрифт Roboto-Regular.ttf не знайдено за шляхом: ${FONT_REGULAR}`);
      }

      const measures = data.measures || [];
      logger.log('[PDF] Мероприятий для отчёта:', measures.length);

      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margins: { top: 40, bottom: 40, left: 40, right: 40 },
        autoFirstPage: false,
        info: {
          Title: `Додаток до Акту - ${data.company.company_name} - ${MONTH_NAMES_UK[data.period.month - 1]} ${data.period.year}`,
          Author: 'SOC System',
        }
      });

      doc.registerFont('Roboto', FONT_REGULAR);
      if (fonts.bold) {
        doc.registerFont('Roboto-Bold', FONT_BOLD);
      }
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

      // ============ ЗАГОЛОВОК — «Додаток до Акту» (правий верх) ============
      const centerX = 0;
      const fullWidth = doc.page.width;
      const dateStr = `${lastDay}.${String(data.period.month).padStart(2, '0')}.${data.period.year}`;

      doc.fontSize(PDF_CONFIG.fontSize.body);
      doc.text('Додаток до Акту', startX, y, { width: pageWidth, align: 'right' });
      y += 12;
      doc.text(`приймання-передачі послуг № ___ від ${dateStr} р.`, startX, y, { width: pageWidth, align: 'right' });
      y += 20;

      // ============ ЗВІТ (центр, жирний) ============
      doc.fontSize(PDF_CONFIG.fontSize.title);
      if (fonts.bold) doc.font('Roboto-Bold');
      doc.text('ЗВІТ', centerX, y, { width: fullWidth, align: 'center' });
      y += 16;
      doc.font('Roboto');

      doc.fontSize(PDF_CONFIG.fontSize.heading);
      doc.text(
        'про надання послуг забезпечення кібербезпеки інформаційно-комунікаційних систем,',
        centerX, y, { width: fullWidth, align: 'center' }
      );
      y += 12;
      doc.text(
        'програмних продуктів та інформації',
        centerX, y, { width: fullWidth, align: 'center' }
      );
      y += 14;
      if (fonts.bold) doc.font('Roboto-Bold');
      doc.text(`за ${monthUA} ${data.period.year} рік`, centerX, y, { width: fullWidth, align: 'center' });
      doc.font('Roboto');
      y += 20;

      // ============ Місто та дата ============
      doc.fontSize(PDF_CONFIG.fontSize.body);
      doc.text('м. Дніпро', startX, y);
      doc.text(`${lastDay} ${monthGen} ${data.period.year}`, startX + pageWidth - 140, y, { width: 140, align: 'right' });
      y += 12;

      // ============ Реквізити договору ============
      const labelW = 200;
      const labelX = startX;
      const valueX = startX + labelW + 10;
      const valueW = pageWidth - labelW - 10;
      const lineH = 11;

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
      drawField(
        'Код згідно з Державним класифікатором продукції та послуг, що надаються Виконавцем за цим договором:',
        `${DEFAULT_CONTRACT.dkCode} (${DEFAULT_CONTRACT.dkDescription}).`
      );
      drawField(
        'Підстава:',
        `${DEFAULT_CONTRACT.pidstavaPrefix} 01 ${monthGen} ${data.period.year} року`
      );

      // Сума — розрахунок за нормо-годину
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
      drawField(
        'Причини розірвання договору, якщо таке мало місце:',
        'Відсутні'
      );

      y += 4;

      // Надпис "Таблиця № 1" справа
      doc.text('Таблиця № 1', startX + pageWidth - 80, y, { width: 80, align: 'right' });
      y += 13;

      // ============ ТАБЛИЦА МЕРОПРИЯТИЙ (6 колонок) ============
      // Колонки: № | Найменування робіт | Відповідальні виконавці | Задіяно співроб. | Трудовитрати | Інформація про виконання
      const colWidths = [28, pageWidth * 0.22, pageWidth * 0.18, 55, 55, pageWidth * 0.35];
      // Корректируем последнюю колонку чтобы сумма = pageWidth
      colWidths[5] = pageWidth - colWidths[0] - colWidths[1] - colWidths[2] - colWidths[3] - colWidths[4];
      const tableWidth = pageWidth;
      const tableStartX = startX;

      doc.fontSize(7);

      // Функция рисования заголовка таблицы
      const drawMeasureTableHeader = () => {
        const hY = y;
        drawTableLine(doc, y, tableStartX, tableWidth);
        y += 2;

        if (fonts.bold) doc.font('Roboto-Bold');
        let colX2 = tableStartX + 3;
        doc.text('№\nп/п', colX2, y, { width: colWidths[0] - 6, align: 'center' });
        colX2 += colWidths[0];
        doc.text('Найменування робіт, послуг', colX2, y + 2, { width: colWidths[1] - 6, align: 'center' });
        colX2 += colWidths[1];
        doc.text('Відповідальні виконавці', colX2, y + 2, { width: colWidths[2] - 6, align: 'center' });
        colX2 += colWidths[2];
        doc.text('Задіяно\nспівроб\nтників', colX2, y, { width: colWidths[3] - 6, align: 'center' });
        colX2 += colWidths[3];
        doc.text('Трудо\nвитрати,\nл/годин', colX2, y, { width: colWidths[4] - 6, align: 'center' });
        colX2 += colWidths[4];
        doc.text('Інформація про виконання', colX2, y + 2, { width: colWidths[5] - 6, align: 'center' });
        doc.font('Roboto');

        y = hY + 32;
        drawTableLine(doc, y, tableStartX, tableWidth);
        drawTableVerticals(doc, hY, y, tableStartX, colWidths);
      };

      drawMeasureTableHeader();

      // ============ СТРОКИ ТАБЛИЦЫ ============
      let rowNum = 1;

      for (const measure of measures) {
        // Подсчёт высоты строки
        const nameH = doc.heightOfString(measure.measure_name || '—', { width: colWidths[1] - 6 });
        const execH = doc.heightOfString(measure.responsible_executors || '—', { width: colWidths[2] - 6 });
        const noteText = measure.note || '—';
        const noteH = doc.heightOfString(noteText, { width: colWidths[5] - 6 });
        const rowHeight = Math.max(nameH, execH, noteH, 14) + 6;

        // Проверка новой страницы
        if (y + rowHeight > doc.page.height - 50) {
          doc.addPage();
          y = doc.page.margins.top;
          drawMeasureTableHeader();
        }

        const rowY = y;
        y += 3;

        let colX2 = tableStartX + 3;
        doc.text(String(rowNum), colX2, y, { width: colWidths[0] - 6, align: 'center' });
        colX2 += colWidths[0];
        doc.text(measure.measure_name || '—', colX2, y, { width: colWidths[1] - 6 });
        colX2 += colWidths[1];
        doc.text(measure.responsible_executors || '—', colX2, y, { width: colWidths[2] - 6 });
        colX2 += colWidths[2];
        doc.text(String(measure.employees_count), colX2, y, { width: colWidths[3] - 6, align: 'center' });
        colX2 += colWidths[3];
        doc.text(measure.hours.toFixed(2), colX2, y, { width: colWidths[4] - 6, align: 'center' });
        colX2 += colWidths[4];
        doc.text(noteText, colX2, y, { width: colWidths[5] - 6 });

        y = rowY + rowHeight;
        drawTableLine(doc, y, tableStartX, tableWidth);
        drawTableVerticals(doc, rowY, y, tableStartX, colWidths);

        rowNum++;
      }

      // Если мероприятий нет
      if (measures.length === 0) {
        const rowY = y;
        y += 3;
        doc.text('Роботи за звітний період відсутні', tableStartX + 3, y, { width: tableWidth - 6, align: 'center' });
        y += 16;
        drawTableLine(doc, y, tableStartX, tableWidth);
        drawTableVerticals(doc, rowY, y, tableStartX, colWidths);
      }

      // ============ ПІДПИСИ ============
      y += 30;
      if (y > doc.page.height - 90) {
        doc.addPage();
        y = doc.page.margins.top + 15;
      }

      doc.fontSize(PDF_CONFIG.fontSize.body);
      const halfWidth = pageWidth / 2 - 15;

      if (fonts.bold) doc.font('Roboto-Bold');
      doc.text('Від Виконавця:', startX, y);
      doc.text('Від Замовника:', startX + halfWidth + 30, y);
      doc.font('Roboto');
      y += 14;

      doc.fontSize(PDF_CONFIG.fontSize.small);
      doc.text(DEFAULT_EXECUTOR.name, startX, y, { width: halfWidth });
      doc.text(data.company.company_name, startX + halfWidth + 30, y, { width: halfWidth });
      y += 28;

      doc.fontSize(PDF_CONFIG.fontSize.body);
      doc.text('_____________ / _____________ /', startX, y);
      doc.text('_____________ / _____________ /', startX + halfWidth + 30, y);
      y += 11;

      doc.fontSize(7);
      doc.fillColor(PDF_CONFIG.colors.gray);
      doc.text('(підпис)                (П.І.Б.)', startX + 15, y);
      doc.text('(підпис)                (П.І.Б.)', startX + halfWidth + 45, y);
      doc.fillColor(PDF_CONFIG.colors.black);

      doc.end();
    } catch (error: unknown) {
      reject(error);
    }
  });
}

/**
 * Генерирует PDF-отчет по сотруднику
 */
export async function generateEmployeeReportPDF(data: EmployeeReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const fonts = checkFonts();
      if (!fonts.regular) {
        throw new Error(`Шрифт Roboto-Regular.ttf не найден по пути: ${FONT_REGULAR}`);
      }

      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
        autoFirstPage: false,
        info: {
          Title: `Отчет - ${data.employee.full_name} - ${MONTH_NAMES_UK[data.period.month - 1]} ${data.period.year}`,
          Author: 'SOC System',
        }
      });

      doc.registerFont('Roboto', FONT_REGULAR);
      if (fonts.bold) {
        doc.registerFont('Roboto-Bold', FONT_BOLD);
      }
      doc.font('Roboto');
      doc.addPage();

      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const startX = doc.page.margins.left;
      let y = doc.page.margins.top;

      // ============ ЗАГОЛОВОК ============
      doc.fontSize(PDF_CONFIG.fontSize.title);
      if (fonts.bold) doc.font('Roboto-Bold');
      doc.text('ОТЧЕТ', 0, y, { width: doc.page.width, align: 'center' });
      y += 18;
      doc.font('Roboto');

      doc.fontSize(PDF_CONFIG.fontSize.subtitle)
        .text('о выполненной работе', 0, y, { width: doc.page.width, align: 'center' });
      y += 20;

      const monthName = MONTH_NAMES_UK[data.period.month - 1];
      doc.fontSize(PDF_CONFIG.fontSize.body)
        .text(`за ${monthName.toLowerCase()} ${data.period.year} года`, 0, y, { width: doc.page.width, align: 'center' });
      y += 25;

      // ============ ИНФОРМАЦИЯ О СОТРУДНИКЕ ============
      doc.fontSize(PDF_CONFIG.fontSize.body);

      if (fonts.bold) doc.font('Roboto-Bold');
      doc.text('Сотрудник:', startX, y);
      doc.font('Roboto');
      doc.text(data.employee.full_name, startX + 90, y);
      y += 15;

      if (fonts.bold) doc.font('Roboto-Bold');
      doc.text('Отдел:', startX, y);
      doc.font('Roboto');
      doc.text(data.employee.department_name || '-', startX + 90, y);
      y += 25;

      // ============ СВОДНАЯ ИНФОРМАЦИЯ ============
      if (fonts.bold) doc.font('Roboto-Bold');
      doc.text('Сводная информация:', startX, y);
      doc.font('Roboto');
      y += 15;

      doc.text(`• Выполнено задач: ${data.summary.tasks_count}`, startX + 10, y);
      y += 12;
      doc.text(`• Общие трудозатраты: ${formatHours(data.summary.total_hours)}`, startX + 10, y);
      y += 12;
      doc.text(`• Задействовано планов: ${data.summary.plans_count}`, startX + 10, y);
      y += 25;

      // ============ РАСПРЕДЕЛЕНИЕ ПО КОМПАНИЯМ ============
      if (data.companies && data.companies.length > 0) {
        if (fonts.bold) doc.font('Roboto-Bold');
        doc.text('Распределение по предприятиям:', startX, y);
        doc.font('Roboto');
        y += 15;

        for (const comp of data.companies) {
          doc.text(`• ${comp.company_name}: ${formatHours(comp.hours || 0)} (${comp.tasks_count || 0} задач)`,
            startX + 10, y);
          y += 12;
        }
        y += 10;
      }

      // ============ РАСПРЕДЕЛЕНИЕ ПО ПРОЦЕССАМ ============
      if (data.processes && data.processes.length > 0) {
        if (fonts.bold) doc.font('Roboto-Bold');
        doc.text('Распределение по процессам ИБ:', startX, y);
        doc.font('Roboto');
        y += 15;

        for (const proc of data.processes) {
          if (proc.process_name) {
            doc.text(`• ${proc.process_name}: ${formatHours(proc.hours || 0)}`, startX + 10, y);
            y += 12;
          }
        }
        y += 10;
      }

      // ============ ВЫПОЛНЕННЫЕ ЗАДАЧИ ============
      if (data.tasks && data.tasks.length > 0) {
        if (y > doc.page.height - 150) {
          doc.addPage();
          y = doc.page.margins.top;
        }

        if (fonts.bold) doc.font('Roboto-Bold');
        doc.text('Выполненные задачи:', startX, y);
        doc.font('Roboto');
        y += 15;

        doc.fontSize(PDF_CONFIG.fontSize.small);
        const tasksToShow = data.tasks.slice(0, 20);

        for (let i = 0; i < tasksToShow.length; i++) {
          const task = tasksToShow[i];

          if (y > doc.page.height - 50) {
            doc.addPage();
            y = doc.page.margins.top;
          }

          const taskText = `${i + 1}. ${task.description || 'Без описания'} (${formatHours(task.spent_hours || 0)})`;
          const textHeight = doc.heightOfString(taskText, { width: pageWidth - 20 });
          doc.text(taskText, startX + 10, y, { width: pageWidth - 20 });
          y += textHeight + 5;
        }

        if (data.tasks.length > 20) {
          y += 5;
          doc.fillColor(PDF_CONFIG.colors.gray)
            .text(`... и еще ${data.tasks.length - 20} задач`, startX + 10, y);
          doc.fillColor(PDF_CONFIG.colors.black);
        }
      }

      // ============ ПОДПИСЬ ============
      y += 30;
      if (y > doc.page.height - 60) {
        doc.addPage();
        y = doc.page.margins.top + 20;
      }

      doc.fontSize(PDF_CONFIG.fontSize.body);
      const lastDay = new Date(data.period.year, data.period.month, 0).getDate();
      const reportDate = new Date(data.period.year, data.period.month - 1, lastDay);
      doc.text(`Дата: ${formatDateUkrainian(reportDate)}`, startX, y, { align: 'right' });
      y += 30;
      doc.text('Подпись: _______________________', startX, y, { align: 'right' });

      doc.end();
    } catch (error: unknown) {
      reject(error);
    }
  });
}

/**
 * Генерирует PDF квартального плана (книжная ориентация).
 * Формат таблицы: №, Перелік завдань, Підрозділ, Термін, Очікуваний результат.
 */
export async function generateQuarterlyPlanPDF(data: QuarterlyPlanPDFData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const fonts = checkFonts();
      if (!fonts.regular) {
        throw new Error(`Шрифт Roboto-Regular.ttf не знайдено: ${FONT_REGULAR}`);
      }

      const quarterRoman: Record<number, string> = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV' };
      const qLabel = quarterRoman[data.quarter] || String(data.quarter);

      const doc = new PDFDocument({
        size: 'A4',
        layout: 'portrait',
        margins: { top: 40, bottom: 40, left: 40, right: 40 },
        autoFirstPage: false,
        info: {
          Title: `План роботи УІБК на ${qLabel} квартал ${data.year} р.`,
          Author: 'SOC System',
        }
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

      // === ЗАГОЛОВОК ===
      doc.fontSize(13);
      if (fonts.bold) doc.font('Roboto-Bold');
      doc.text(
        `План роботи Управління інформаційної безпеки`,
        0, y, { width: fullWidth, align: 'center' }
      );
      y += 16;
      doc.text(
        `на ${qLabel} квартал ${data.year} р.`,
        0, y, { width: fullWidth, align: 'center' }
      );
      y += 25;
      doc.font('Roboto');

      // === КОНФИГУРАЦИЯ ТАБЛИЦЫ ===
      // Логика как в UI: фиксированные Підрозділ/Термін,
      // остаток ширины поровну между Перелік завдань и Очікуваний результат.
      const numberCol = 32;
      const departmentCol = 72;
      const termCol = 84;
      const flexibleCol = Math.max(80, (pageWidth - numberCol - departmentCol - termCol) / 2);
      const colWidths = [numberCol, flexibleCol, departmentCol, termCol, flexibleCol];
      const tableWidth = colWidths.reduce((a, b) => a + b, 0);
      const tableStartX = startX;

      const fontSize = 8;
      doc.fontSize(fontSize);

      // Вычисляем плановый срок: 19-е число последнего месяца квартала
      const lastMonth = data.quarter * 3;
      const deadline = `19.${String(lastMonth).padStart(2, '0')}.${data.year}`;

      // === РИСУЕМ ЗАГОЛОВОК ТАБЛИЦЫ ===
      const drawHeader = (yPos: number): number => {
        const headerStartY = yPos;
        drawTableLine(doc, yPos, tableStartX, tableWidth);

        const headerTexts = [
          '№',
          'Перелік завдань',
          'Підрозділ',
          'Термін',
          'Очікуваний результат'
        ];

        // Вычисляем максимальную высоту заголовка
        let maxH = 0;
        for (let i = 0; i < headerTexts.length; i++) {
          const h = doc.heightOfString(headerTexts[i], { width: colWidths[i] - 6 });
          if (h > maxH) maxH = h;
        }
        const headerH = maxH + 8;

        // Текст заголовков
        if (fonts.bold) doc.font('Roboto-Bold');
        let colX = tableStartX + 3;
        for (let i = 0; i < headerTexts.length; i++) {
          doc.text(headerTexts[i], colX, yPos + 4, {
            width: colWidths[i] - 6,
            align: 'center'
          });
          colX += colWidths[i];
        }
        doc.font('Roboto');

        yPos += headerH;
        drawTableLine(doc, yPos, tableStartX, tableWidth);
        drawTableVerticals(doc, headerStartY, yPos, tableStartX, colWidths);
        return yPos;
      };

      y = drawHeader(y);

      // === СТРОКИ ТАБЛИЦЫ ===
      for (let i = 0; i < data.plans.length; i++) {
        const plan = data.plans[i];

        // Вычисляем высоту строки
        const goalH = doc.heightOfString(plan.goal, { width: colWidths[1] - 6 });
        const resultH = doc.heightOfString(plan.expected_result, { width: colWidths[4] - 6 });
        const rowH = Math.max(goalH, resultH, 14) + 8;

        // Проверка: если не помещается — новая страница
        if (y + rowH > doc.page.height - doc.page.margins.bottom) {
          doc.addPage();
          y = doc.page.margins.top;
          y = drawHeader(y);
        }

        const rowY = y;

        // Содержимое строки
        let colX = tableStartX + 3;

        // №
        doc.text(String(i + 1), colX, y + 4, { width: colWidths[0] - 6, align: 'center' });
        colX += colWidths[0];

        // Перелік завдань
        doc.text(plan.goal, colX, y + 4, { width: colWidths[1] - 6 });
        colX += colWidths[1];

        // Відповідальний підрозділ
        const deptLabel = plan.department_code || plan.department_name;
        doc.text(deptLabel, colX, y + 4, { width: colWidths[2] - 6, align: 'center' });
        colX += colWidths[2];

        // Плановий термін
        doc.text(deadline, colX, y + 4, { width: colWidths[3] - 6, align: 'center' });
        colX += colWidths[3];

        // Очікуваний результат
        doc.text(plan.expected_result, colX, y + 4, { width: colWidths[4] - 6 });

        y = rowY + rowH;
        drawTableLine(doc, y, tableStartX, tableWidth);
        drawTableVerticals(doc, rowY, y, tableStartX, colWidths);
      }

      // Пустая таблица
      if (data.plans.length === 0) {
        const rowY = y;
        doc.text('Завдання за цей квартал відсутні', tableStartX + 3, y + 4, {
          width: tableWidth - 6, align: 'center'
        });
        y += 20;
        drawTableLine(doc, y, tableStartX, tableWidth);
        drawTableVerticals(doc, rowY, y, tableStartX, colWidths);
      }

      doc.end();
    } catch (error: unknown) {
      reject(error);
    }
  });
}

/**
 * Генерирует PDF квартального ОТЧЁТА (альбомная ориентация).
 * Формат таблицы: №, Перелік завдань, Відповідальний підрозділ,
 * Плановий строк закінчення виконання, Результат виконання, Примітка.
 */
export async function generateQuarterlyReportPDF(data: QuarterlyReportPDFData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const fonts = checkFonts();
      if (!fonts.regular) {
        throw new Error(`Шрифт Roboto-Regular.ttf не знайдено: ${FONT_REGULAR}`);
      }

      const quarterRoman: Record<number, string> = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV' };
      const qLabel = quarterRoman[data.quarter] || String(data.quarter);

      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margins: { top: 40, bottom: 40, left: 40, right: 40 },
        autoFirstPage: false,
        info: {
          Title: `Звіт про роботу УІБК за ${qLabel} квартал ${data.year} р.`,
          Author: 'SOC System',
        }
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

      // === ЗАГОЛОВОК ===
      doc.fontSize(13);
      if (fonts.bold) doc.font('Roboto-Bold');
      doc.text('ЗВІТ', 0, y, { width: fullWidth, align: 'center' });
      y += 16;
      doc.text(
        `про роботу Управління інформаційної безпеки`,
        0, y, { width: fullWidth, align: 'center' }
      );
      y += 16;
      doc.text(
        `за ${qLabel} квартал ${data.year} р.`,
        0, y, { width: fullWidth, align: 'center' }
      );
      y += 25;
      doc.font('Roboto');

      // === КОНФИГУРАЦИЯ ТАБЛИЦЫ (6 колонок) ===
      const numberCol = 28;
      const departmentCol = 72;
      const deadlineCol = 80;
      const statusCol = 68;
      // Остаток делим между "Перелік завдань" и "Примітка"
      const flexTotal = pageWidth - numberCol - departmentCol - deadlineCol - statusCol;
      const goalCol = Math.round(flexTotal * 0.4);
      const noteCol = flexTotal - goalCol;

      const colWidths = [numberCol, goalCol, departmentCol, deadlineCol, statusCol, noteCol];
      const tableWidth = colWidths.reduce((a, b) => a + b, 0);
      const tableStartX = startX;

      const fontSize = 8;
      doc.fontSize(fontSize);

      // === РИСУЕМ ЗАГОЛОВОК ТАБЛИЦЫ ===
      const drawHeader = (yPos: number): number => {
        const headerStartY = yPos;
        drawTableLine(doc, yPos, tableStartX, tableWidth);

        const headerTexts = [
          '№',
          'Перелік завдань',
          'Відповідальний підрозділ',
          'Плановий строк закінчення виконання',
          'Результат виконання',
          'Примітка'
        ];

        // Вычисляем максимальную высоту заголовка
        let maxH = 0;
        for (let i = 0; i < headerTexts.length; i++) {
          const h = doc.heightOfString(headerTexts[i], { width: colWidths[i] - 6 });
          if (h > maxH) maxH = h;
        }
        const headerH = maxH + 8;

        if (fonts.bold) doc.font('Roboto-Bold');
        let colX = tableStartX + 3;
        for (let i = 0; i < headerTexts.length; i++) {
          doc.text(headerTexts[i], colX, yPos + 4, {
            width: colWidths[i] - 6,
            align: 'center'
          });
          colX += colWidths[i];
        }
        doc.font('Roboto');

        yPos += headerH;
        drawTableLine(doc, yPos, tableStartX, tableWidth);
        drawTableVerticals(doc, headerStartY, yPos, tableStartX, colWidths);
        return yPos;
      };

      y = drawHeader(y);

      // === СТРОКИ ТАБЛИЦЫ ===
      for (let i = 0; i < data.plans.length; i++) {
        const plan = data.plans[i];

        // Вычисляем высоту строки по всем текстовым колонкам
        const noteText = plan.ai_note || plan.expected_result;
        const goalH = doc.heightOfString(plan.goal, { width: colWidths[1] - 6 });
        const noteH = doc.heightOfString(noteText, { width: colWidths[5] - 6 });
        const rowH = Math.max(goalH, noteH, 14) + 8;

        // Проверка: если не помещается — новая страница
        if (y + rowH > doc.page.height - doc.page.margins.bottom) {
          doc.addPage();
          y = doc.page.margins.top;
          y = drawHeader(y);
        }

        const rowY = y;
        let colX = tableStartX + 3;

        // №
        doc.text(String(i + 1), colX, y + 4, { width: colWidths[0] - 6, align: 'center' });
        colX += colWidths[0];

        // Перелік завдань
        doc.text(plan.goal, colX, y + 4, { width: colWidths[1] - 6 });
        colX += colWidths[1];

        // Відповідальний підрозділ
        const deptLabel = plan.department_code || plan.department_name;
        doc.text(deptLabel, colX, y + 4, { width: colWidths[2] - 6, align: 'center' });
        colX += colWidths[2];

        // Плановий строк закінчення виконання
        doc.text(plan.deadline, colX, y + 4, { width: colWidths[3] - 6, align: 'center' });
        colX += colWidths[3];

        // Результат виконання
        doc.text(plan.status, colX, y + 4, { width: colWidths[4] - 6, align: 'center' });
        colX += colWidths[4];

        // Примітка (AI-generated or expected_result fallback)
        doc.text(noteText, colX, y + 4, { width: colWidths[5] - 6 });

        y = rowY + rowH;
        drawTableLine(doc, y, tableStartX, tableWidth);
        drawTableVerticals(doc, rowY, y, tableStartX, colWidths);
      }

      // Пустая таблица
      if (data.plans.length === 0) {
        const rowY = y;
        doc.text('Завдання за цей квартал відсутні', tableStartX + 3, y + 4, {
          width: tableWidth - 6, align: 'center'
        });
        y += 20;
        drawTableLine(doc, y, tableStartX, tableWidth);
        drawTableVerticals(doc, rowY, y, tableStartX, colWidths);
      }

      doc.end();
    } catch (error: unknown) {
      reject(error);
    }
  });
}
