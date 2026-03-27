/**
 * PDF generation — employee report.
 */
import PDFDocument from 'pdfkit';
import { EmployeeReportData, MONTH_NAMES_UK, formatHours } from './index';
import { PDF_CONFIG, FONT_REGULAR, FONT_BOLD, checkFonts, formatDateUkrainian } from './pdf-helpers';

export async function generateEmployeeReportPDF(data: EmployeeReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const fonts = checkFonts();
      if (!fonts.regular) throw new Error(`Шрифт Roboto-Regular.ttf не найден по пути: ${FONT_REGULAR}`);

      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
        autoFirstPage: false,
        info: {
          Title: `Отчет - ${data.employee.full_name} - ${MONTH_NAMES_UK[data.period.month - 1]} ${data.period.year}`,
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

      // Заголовок
      doc.fontSize(PDF_CONFIG.fontSize.title);
      if (fonts.bold) doc.font('Roboto-Bold');
      doc.text('ОТЧЕТ', 0, y, { width: doc.page.width, align: 'center' }); y += 18;
      doc.font('Roboto');
      doc.fontSize(PDF_CONFIG.fontSize.subtitle).text('о выполненной работе', 0, y, { width: doc.page.width, align: 'center' }); y += 20;
      const monthName = MONTH_NAMES_UK[data.period.month - 1];
      doc.fontSize(PDF_CONFIG.fontSize.body).text(`за ${monthName.toLowerCase()} ${data.period.year} года`, 0, y, { width: doc.page.width, align: 'center' }); y += 25;

      // Информация о сотруднике
      doc.fontSize(PDF_CONFIG.fontSize.body);
      if (fonts.bold) doc.font('Roboto-Bold');
      doc.text('Сотрудник:', startX, y); doc.font('Roboto'); doc.text(data.employee.full_name, startX + 90, y); y += 15;
      if (fonts.bold) doc.font('Roboto-Bold');
      doc.text('Отдел:', startX, y); doc.font('Roboto'); doc.text(data.employee.department_name || '-', startX + 90, y); y += 25;

      // Сводная информация
      if (fonts.bold) doc.font('Roboto-Bold');
      doc.text('Сводная информация:', startX, y); doc.font('Roboto'); y += 15;
      doc.text(`• Выполнено задач: ${data.summary.tasks_count}`, startX + 10, y); y += 12;
      doc.text(`• Общие трудозатраты: ${formatHours(data.summary.total_hours)}`, startX + 10, y); y += 12;
      doc.text(`• Задействовано планов: ${data.summary.plans_count}`, startX + 10, y); y += 25;

      // По компаниям
      if (data.companies && data.companies.length > 0) {
        if (fonts.bold) doc.font('Roboto-Bold');
        doc.text('Распределение по предприятиям:', startX, y); doc.font('Roboto'); y += 15;
        for (const comp of data.companies) {
          doc.text(`• ${comp.company_name}: ${formatHours(comp.hours || 0)} (${comp.tasks_count || 0} задач)`, startX + 10, y); y += 12;
        }
        y += 10;
      }

      // По процессам
      if (data.processes && data.processes.length > 0) {
        if (fonts.bold) doc.font('Roboto-Bold');
        doc.text('Распределение по процессам ИБ:', startX, y); doc.font('Roboto'); y += 15;
        for (const proc of data.processes) {
          if (proc.process_name) { doc.text(`• ${proc.process_name}: ${formatHours(proc.hours || 0)}`, startX + 10, y); y += 12; }
        }
        y += 10;
      }

      // Задачи
      if (data.tasks && data.tasks.length > 0) {
        if (y > doc.page.height - 150) { doc.addPage(); y = doc.page.margins.top; }
        if (fonts.bold) doc.font('Roboto-Bold');
        doc.text('Выполненные задачи:', startX, y); doc.font('Roboto'); y += 15;
        doc.fontSize(PDF_CONFIG.fontSize.small);
        const tasksToShow = data.tasks.slice(0, 20);
        for (let i = 0; i < tasksToShow.length; i++) {
          const task = tasksToShow[i];
          if (y > doc.page.height - 50) { doc.addPage(); y = doc.page.margins.top; }
          const taskText = `${i + 1}. ${task.description || 'Без описания'} (${formatHours(task.spent_hours || 0)})`;
          const textHeight = doc.heightOfString(taskText, { width: pageWidth - 20 });
          doc.text(taskText, startX + 10, y, { width: pageWidth - 20 }); y += textHeight + 5;
        }
        if (data.tasks.length > 20) {
          y += 5;
          doc.fillColor(PDF_CONFIG.colors.gray).text(`... и еще ${data.tasks.length - 20} задач`, startX + 10, y);
          doc.fillColor(PDF_CONFIG.colors.black);
        }
      }

      // Підпис
      y += 30;
      if (y > doc.page.height - 60) { doc.addPage(); y = doc.page.margins.top + 20; }
      doc.fontSize(PDF_CONFIG.fontSize.body);
      const lastDay = new Date(data.period.year, data.period.month, 0).getDate();
      const reportDate = new Date(data.period.year, data.period.month - 1, lastDay);
      doc.text(`Дата: ${formatDateUkrainian(reportDate)}`, startX, y, { align: 'right' }); y += 30;
      doc.text('Подпись: _______________________', startX, y, { align: 'right' });
      doc.end();
    } catch (error: unknown) { reject(error); }
  });
}
