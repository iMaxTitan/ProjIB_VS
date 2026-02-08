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
import { CompanyReportData, EmployeeReportData, MONTH_NAMES_UK, formatHours } from './monthly-report.service';
import logger from '@/lib/logger';
import {
  groupTasksByProcess,
  prepareProcessDataForAI,
  DEFAULT_EXECUTOR,
  TaskDataForAI,
  ProcessGroup,
  ContractTaskLike
} from './contract-services';

// Конфигурация AI
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const AI_PROVIDER = process.env.AI_PROVIDER || 'anthropic';

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

/**
 * Проверяет наличие шрифтов
 */
function checkFonts(): { regular: boolean; bold: boolean } {
  const regular = fs.existsSync(FONT_REGULAR);
  const bold = fs.existsSync(FONT_BOLD);
  logger.log(`[PDF] Шрифти: regular=${regular}, bold=${bold}`);
  return { regular, bold };
}

/**
 * Генерирует название месяца в родительном падеже
 */
function getMonthGenitive(month: number): string {
  const months = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
  ];
  return months[month - 1] || '';
}

/**
 * Форматирует дату как "31 декабря 2025 г."
 */
function formatDateUkrainian(date: Date): string {
  const day = date.getDate();
  const month = getMonthGenitive(date.getMonth() + 1);
  const year = date.getFullYear();
  return `${day} ${month} ${year} р.`;
}

/**
 * Рисует горизонтальную линию таблицы
 */
function drawTableLine(doc: PDFKit.PDFDocument, y: number, startX: number, width: number) {
  doc.moveTo(startX, y)
    .lineTo(startX + width, y)
    .stroke();
}

/**
 * Рисует вертикальные линии таблицы
 */
function drawTableVerticals(doc: PDFKit.PDFDocument, startY: number, endY: number, startX: number, cols: number[]) {
  let x = startX;
  doc.moveTo(x, startY).lineTo(x, endY).stroke();

  for (const width of cols) {
    x += width;
    doc.moveTo(x, startY).lineTo(x, endY).stroke();
  }
}

const AI_SYSTEM_PROMPT = `Ты профессиональный копирайтер для официальных документов в сфере информационной безопасности.
Твоя задача - создать ДЕТАЛЬНЫЕ, РАЗВЕРНУТЫЕ описания выполненных работ для официальных актов между предприятиями.

ВАЖНЫЕ ПРАВИЛА:
1. Пиши официально-деловым стилем, но показывай ЦЕННОСТЬ и ЭКСПЕРТНОСТЬ оказанных услуг
2. Используй русский язык
3. Каждое описание должно быть ДЕТАЛЬНЫМ - 4-6 абзацев, 400-600 слов
4. Описывай РЕЗУЛЬТАТЫ и ДОСТИЖЕНИЯ ("Обеспечена надежная защита...", "Достигнут высокий уровень...")
5. Используй конкретные цифры: количество проверок, выявленных угроз, обработанных событий
6. Структура опису:
   - Абзац 1: Общий обзор направления работ и их важности
   - Абзац 2: Конкретные выполненные работы и их объем
   - Абзац 3: Достигнутые результаты и улучшения
   - Абзац 4: Выявленные проблемы и принятые меры (если есть)
   - Абзац 5: Выводы и рекомендации
7. НЕ придумывай факты, которых нет в данных
8. Начинай каждый абзац с новой строки
9. Подчеркивай профессионализм команды и качество услуг

Формат ответа - JSON-массив:
[{"serviceId": 1, "text": "Детальное описание на несколько абзацев..."}]`;

/**
 * Вызывает AI для форматирования описаний
 */
async function callAIForDescriptions(services: TaskDataForAI[], companyName: string): Promise<Map<number, string>> {
  const result = new Map<number, string>();

  if (services.length === 0) return result;

  const prompt = `Создай ДЕТАЛЬНЫЕ описания выполненных работ для официального акта.

ЗАМОВНИК: ${companyName}

ПЕРЕЧЕНЬ УСЛУГ И ВЫПОЛНЕННЫХ РАБОТ:

${services.map((s, i) => `
═══════════════════════════════════════════════════════
${i + 1}. ПОСЛУГА ID=${s.serviceId}: "${s.serviceName}"
═══════════════════════════════════════════════════════
   • Общий объем: ${s.taskCount} задач
   • Трудозатраты: ${s.totalHours.toFixed(1)} человеко-часов
   • Привлечено специалистов: ${s.employees.length} (${s.employees.slice(0, 5).join(', ')}${s.employees.length > 5 ? '...' : ''})

   ПРИМЕРЫ ВЫПОЛНЕННЫХ РАБОТ:
   ${s.taskDescriptions.slice(0, 10).map((d, j) => `   ${j + 1}. ${d}`).join('\n') || '   - данные отсутствуют'}
`).join('\n')}

ТРЕБОВАНИЯ К ОПИСАНИЯМ:
- Каждое описание должно быть 4-6 абзацев (400-600 слов)
- Показать ценность и профессионализм выполненных работ
- Использовать конкретные цифры из предоставленных данных

JSON-ответ:`;

  try {
    let aiResponse = '';

    if (AI_PROVIDER === 'anthropic' && ANTHROPIC_API_KEY) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 8000,
          system: AI_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        aiResponse = data.content?.[0]?.text || '';
      }
    } else if (OPENAI_API_KEY) {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: AI_SYSTEM_PROMPT },
            { role: 'user', content: prompt }
          ],
          max_tokens: 8000,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        aiResponse = data.choices?.[0]?.message?.content || '';
      }
    }

    if (aiResponse) {
      const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        for (const item of parsed) {
          if (item.serviceId !== undefined && item.text) {
            result.set(item.serviceId, item.text);
          }
        }
      }
    }
  } catch (error: unknown) {
    logger.warn('[PDF] Ошибка AI:', error);
  }

  return result;
}

/**
 * Генерирует базовое описание (fallback) - короткое
 */
function generateBasicDescription(tasks: ContractTaskLike[], serviceName: string): string {
  const taskCount = tasks.length;
  const totalHours = tasks.reduce((sum, t) => sum + (t.spent_hours || 0), 0);
  const employees = new Set(tasks.map(t => t.employee_name).filter(Boolean));

  // Выбираем глагол в зависимости от типа услуги
  let verb = 'Виконано роботи';
  const lowerName = serviceName.toLowerCase();

  if (lowerName.includes('моніторинг')) {
    verb = 'Обеспечен непрерывный мониторинг';
  } else if (lowerName.includes('аудит')) {
    verb = 'Проведено комплексний аудит';
  } else if (lowerName.includes('аналіз')) {
    verb = 'Выполнен детальный анализ';
  } else if (lowerName.includes('консульт')) {
    verb = 'Предоставлены экспертные консультации';
  }

  return `${verb}. Обработано ${taskCount} задач, привлечено ${employees.size} специалистов.`;
}

/**
 * Генерирует ДЕТАЛЬНОЕ описание (fallback) - для развернутого раздела
 */
function generateDetailedDescription(tasks: ContractTaskLike[], serviceName: string, totalHours: number, employeesCount: number): string {
  const taskCount = tasks.length;
  const descriptions = tasks.slice(0, 5).map(t => t.description).filter(Boolean);
  const lowerName = serviceName.toLowerCase();

  // Базовые шаблоны для разных типов процессов
  let intro = '';
  let workDone = '';
  let results = '';
  let conclusion = '';

  if (lowerName.includes('моніторинг') && lowerName.includes('інцидент')) {
    intro = `В отчетном периоде обеспечен непрерывный мониторинг событий информационной безопасности в информационно-коммуникационных системах Заказчика. Служба кибербезопасности осуществляла круглосуточное наблюдение за состоянием защищенности информационных ресурсов и оперативно реагировала на выявленные угрозы.`;
    workDone = `В течение отчетного периода обработан значительный объем событий безопасности. Общие трудозатраты составили ${totalHours.toFixed(1)} человеко-часов. К выполнению работ было привлечено ${employeesCount} квалифицированных специалистов с опытом работы в сфере кибербезопасности.`;
    results = `По результатам мониторинга своевременно выявлены и классифицированы потенциальные угрозы. Обеспечено оперативное информирование ответственных лиц Заказчика о критических событиях. Приняты необходимые меры по нейтрализации выявленных угроз и минимизации возможных последствий.`;
    conclusion = `В целом уровень защищенности информационных систем Заказчика поддерживался на надлежащем уровне. Рекомендовано продолжить мониторинг и усилить внимание к новым типам угроз.`;
  } else if (lowerName.includes('управління') && lowerName.includes('документац')) {
    intro = `В отчетном периоде выполнен комплекс работ по управлению документацией системы управления информационной безопасностью (СУИБ). Работы направлены на обеспечение актуальности, полноты и соответствия нормативной базы требованиям действующего законодательства и международных стандартов.`;
    workDone = `Выполнены анализ и актуализация внутренних нормативных документов. Общий объем трудозатрат составил ${totalHours.toFixed(1)} человеко-часов. В работах участвовало ${employeesCount} специалистов.`;
    results = `Актуализированы документы политики информационной безопасности. Обновлены инструкции и регламенты в соответствии с изменениями в инфраструктуре и организационной структуре. Обеспечено соответствие документации требованиям стандарта ISO 27001.`;
    conclusion = `Документация СУИБ приведена в соответствие с текущим состоянием информационной безопасности организации.`;
  } else if (lowerName.includes('ризик')) {
    intro = `В отчетном периоде выполнены работы по управлению рисками информационной безопасности. Проведены оценка и анализ рисков, связанных с обработкой информации в информационных системах Заказчика.`;
    workDone = `Выполнены идентификация и оценка рисков информационной безопасности. Общий объем работ составил ${totalHours.toFixed(1)} человеко-часов с привлечением ${employeesCount} специалистов.`;
    results = `Сформирован актуальный реестр рисков. Определены приоритетные направления для внедрения защитных мер. Разработаны рекомендации по минимизации выявленных рисков.`;
    conclusion = `Уровень рисков информационной безопасности остается контролируемым. Рекомендовано продолжить мониторинг и периодический пересмотр оценки рисков.`;
  } else if (lowerName.includes('навчання') || lowerName.includes('обізнаності')) {
    intro = `В отчетном периоде проведены мероприятия по повышению осведомленности персонала Заказчика в сфере информационной безопасности. Работы направлены на формирование культуры кибербезопасности и снижение рисков, связанных с человеческим фактором.`;
    workDone = `Подготовлены и проведены обучающие мероприятия для сотрудников. Общий объем работ составил ${totalHours.toFixed(1)} человеко-часов. К подготовке и проведению обучения привлечено ${employeesCount} специалистов.`;
    results = `Повышен уровень осведомленности персонала об актуальных киберугрозах. Сформированы навыки распознавания фишинговых атак и других методов социальной инженерии.`;
    conclusion = `Рекомендовано продолжить регулярное проведение обучающих мероприятий и тестирование осведомленности персонала.`;
  } else {
    intro = `В отчетном периоде выполнен комплекс работ по направлению "${serviceName}". Работы направлены на обеспечение надлежащего уровня информационной безопасности информационно-коммуникационных систем Заказчика.`;
    workDone = `Общий объем выполненных работ составил ${totalHours.toFixed(1)} человеко-часов. К выполнению работ привлечено ${employeesCount} квалифицированных специалистов службы кибербезопасности.`;
    results = `Обеспечено выполнение запланированных задач в полном объеме. Достигнуты установленные показатели качества и своевременности выполнения работ.`;
    conclusion = `Общее состояние информационной безопасности в рамках данного направления оценивается как удовлетворительное.`;
  }

  // Добавляем примеры работ, если есть
  let examples = '';
  if (descriptions.length > 0) {
    examples = `\n\nСреди выполненных работ: ${descriptions.slice(0, 3).join('; ')}.`;
  }

  return `${intro}\n\n${workDone}${examples}\n\n${results}\n\n${conclusion}`;
}

/**
 * Генерирует базовое описание (старый формат)
 */
function generateBasicDescriptionOld(tasks: ContractTaskLike[], serviceName: string): string {
  const taskCount = tasks.length;
  const totalHours = tasks.reduce((sum, t) => sum + (t.spent_hours || 0), 0);
  const employees = new Set(tasks.map(t => t.employee_name).filter(Boolean));

  // Выбираем глагол в зависимости от типа услуги
  let verb = 'Виконано роботи';
  const lowerName = serviceName.toLowerCase();

  if (lowerName.includes('моніторинг')) {
    verb = 'Обеспечен непрерывный мониторинг';
  } else if (lowerName.includes('аудит')) {
    verb = 'Проведено комплексний аудит';
  } else if (lowerName.includes('аналіз')) {
    verb = 'Выполнен детальный анализ';
  } else if (lowerName.includes('консульт')) {
    verb = 'Предоставлены экспертные консультации';
  } else if (lowerName.includes('перевірк')) {
    verb = 'Выполнена проверка';
  } else if (lowerName.includes('захист')) {
    verb = 'Обеспечена надежная защита';
  } else if (lowerName.includes('виявлення')) {
    verb = 'Проведены выявление и анализ';
  } else if (lowerName.includes('навчання') || lowerName.includes('обізнаності')) {
    verb = 'Организованы мероприятия по повышению осведомленности';
  }

  return `${verb}. Обработано ${taskCount} задач, привлечено ${employees.size} специалистов.`;
}

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

      // Используем АГРЕГИРОВАННЫЕ данные по процессам из RPC (там все часы корректные)
      // data.processes уже содержит sum(spent_hours) по всем задачам, без LIMIT 100
      const processes = data.processes || [];
      logger.log('[PDF] Процессов с агрегированными часами:', processes.length);

      // Группируем задачи для получения описаний и количества исполнителей
      const tasksByProcess = groupTasksByProcess(data.tasks || []);

      // Готовим данные для AI на основе процессов
      const tasksForAI: TaskDataForAI[] = processes
        .filter(p => p.process_name && p.hours > 0)
        .sort((a, b) => (b.hours || 0) - (a.hours || 0))
        .map((proc, idx) => {
          const processGroup = tasksByProcess.get(proc.process_name || '');
          return {
            serviceName: proc.process_name || 'Невизначений процес',
            serviceId: idx + 1,
            categoryName: 'Обеспечение кибербезопасности ИКС',
            taskCount: processGroup?.taskCount || 0,
            totalHours: proc.hours || 0,
            employees: processGroup ? Array.from(processGroup.employees) : [],
            taskDescriptions: processGroup?.descriptions?.slice(0, 15) || [],
            processName: proc.process_name
          };
        });

      // Получаем AI-описания
      logger.log('[PDF] Запрос AI-форматирования для', tasksForAI.length, 'процессов');
      const aiDescriptions = await callAIForDescriptions(tasksForAI, data.company.company_name);
      logger.log('[PDF] AI вернул', aiDescriptions.size, 'описаний');

      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
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

      const monthName = MONTH_NAMES_UK[data.period.month - 1];
      const lastDay = new Date(data.period.year, data.period.month, 0).getDate();
      const reportDate = new Date(data.period.year, data.period.month - 1, lastDay);

      // ============ ЗАГОЛОВОК ДОКУМЕНТА ============
      // Центрируем относительно всей ширины страницы
      const centerX = 0;
      const fullWidth = doc.page.width;

      doc.fontSize(PDF_CONFIG.fontSize.header);
      doc.text('Приложение к Акту', centerX, y, { width: fullWidth, align: 'center' });
      y += 14;

      doc.text(`приема-передачи услуг от ${lastDay}.${String(data.period.month).padStart(2, '0')}.${data.period.year} г.`,
        centerX, y, { width: fullWidth, align: 'center' });
      y += 22;

      // ОТЧЕТ - крупный заголовок
      doc.fontSize(PDF_CONFIG.fontSize.title);
      if (fonts.bold) doc.font('Roboto-Bold');
      doc.text('ОТЧЕТ', centerX, y, { width: fullWidth, align: 'center' });
      y += 18;
      doc.font('Roboto');

      doc.fontSize(PDF_CONFIG.fontSize.heading);
      doc.text('об оказании услуг по обеспечению кибербезопасности информационно-коммуникационных систем,',
        centerX, y, { width: fullWidth, align: 'center' });
      y += 13;
      doc.text('программных продуктов и информации, обрабатываемой в них',
        centerX, y, { width: fullWidth, align: 'center' });
      y += 15;
      doc.text(`за ${monthName.toLowerCase()} ${data.period.year} года`,
        centerX, y, { width: fullWidth, align: 'center' });
      y += 22;

      // Город и дата
      doc.fontSize(PDF_CONFIG.fontSize.body);
      doc.text(`г. Днепр`, startX, y);
      doc.text(formatDateUkrainian(reportDate), startX + pageWidth - 100, y);
      y += 18;

      // ============ СТОРОНИ ДОГОВОРУ ============
      doc.fontSize(PDF_CONFIG.fontSize.body);

      if (fonts.bold) doc.font('Roboto-Bold');
      doc.text('Исполнитель:', startX, y);
      doc.font('Roboto');
      doc.text(DEFAULT_EXECUTOR.name, startX + 75, y);
      y += 13;

      if (fonts.bold) doc.font('Roboto-Bold');
      doc.text('Заказчик:', startX, y);
      doc.font('Roboto');
      doc.text(data.company.company_name, startX + 75, y);
      y += 18;

      // ============ СВОДНАЯ ИНФОРМАЦИЯ ============
      if (fonts.bold) doc.font('Roboto-Bold');
      doc.text('Сводная информация за отчетный период:', startX, y);
      doc.font('Roboto');
      y += 13;

      doc.text(`• Общий объем оказанных услуг: ${data.summary.tasks_count} работ`, startX + 10, y);
      y += 11;
      doc.text(`• Общие трудозатраты: ${formatHours(data.summary.total_hours)}`, startX + 10, y);
      y += 11;
      doc.text(`• Количество привлеченных специалистов: ${data.summary.employees_count}`, startX + 10, y);
      y += 18;

      // ============ ТАБЛИЦЯ ПОСЛУГ (скорочена) ============
      if (fonts.bold) doc.font('Roboto-Bold');
      doc.text('Перечень оказанных услуг', centerX, y, { width: fullWidth, align: 'center' });
      y += 15;
      doc.font('Roboto');

      // Ширини колонок (4 колонки без опису)
      const colWidths = [25, 330, 60, 60];
      const tableWidth = colWidths.reduce((a, b) => a + b, 0);
      const tableStartX = startX + (pageWidth - tableWidth) / 2; // Центрируем таблицу

      doc.fontSize(PDF_CONFIG.fontSize.table);

      // Заголовок таблицы
      const headerY = y;
      drawTableLine(doc, y, tableStartX, tableWidth);
      y += 2;

      let colX = tableStartX + 2;
      doc.text('№', colX, y + 6, { width: colWidths[0] - 4, align: 'center' });
      colX += colWidths[0];
      doc.text('Наименование услуг', colX, y + 3, { width: colWidths[1] - 4, align: 'center' });
      colX += colWidths[1];
      doc.text('?/?', colX, y + 6, { width: colWidths[2] - 4, align: 'center' });
      colX += colWidths[2];
      doc.text('Специалистов', colX, y + 6, { width: colWidths[3] - 4, align: 'center' });

      y += 22;
      drawTableLine(doc, y, tableStartX, tableWidth);
      drawTableVerticals(doc, headerY, y, tableStartX, colWidths);

      // ============ СТРОКИ ТАБЛИЦЫ (сокращенные, без описаний) ============
      let rowNum = 1;

      for (const processData of tasksForAI) {
        // Проверка новой страницы
        if (y > doc.page.height - 60) {
          doc.addPage();
          y = doc.page.margins.top;

          // Заголовок таблицы на новой странице
          const newHeaderY = y;
          drawTableLine(doc, y, tableStartX, tableWidth);
          y += 2;

          colX = tableStartX + 2;
          doc.text('№', colX, y + 6, { width: colWidths[0] - 4, align: 'center' });
          colX += colWidths[0];
          doc.text('Наименование услуг', colX, y + 3, { width: colWidths[1] - 4, align: 'center' });
          colX += colWidths[1];
          doc.text('?/?', colX, y + 6, { width: colWidths[2] - 4, align: 'center' });
          colX += colWidths[2];
          doc.text('Специалистов', colX, y + 6, { width: colWidths[3] - 4, align: 'center' });

          y += 22;
          drawTableLine(doc, y, tableStartX, tableWidth);
          drawTableVerticals(doc, newHeaderY, y, tableStartX, colWidths);
        }

        const rowY = y;

        // Назва процесу
        const displayName = processData.serviceName.length > 80
          ? processData.serviceName.substring(0, 80) + '...'
          : processData.serviceName;

        // Висота рядка
        const nameHeight = doc.heightOfString(displayName, { width: colWidths[1] - 4 });
        const rowHeight = Math.max(nameHeight, 16) + 4;

        y += 2;

        // Текст рядка (4 колонки)
        colX = tableStartX + 2;
        doc.text(String(rowNum), colX, y, { width: colWidths[0] - 4, align: 'center' });
        colX += colWidths[0];
        doc.text(displayName, colX, y, { width: colWidths[1] - 4 });
        colX += colWidths[1];
        doc.text(processData.totalHours.toFixed(1), colX, y, { width: colWidths[2] - 4, align: 'center' });
        colX += colWidths[2];
        doc.text(String(processData.employees.length), colX, y, { width: colWidths[3] - 4, align: 'center' });

        y = rowY + rowHeight;

        drawTableLine(doc, y, tableStartX, tableWidth);
        drawTableVerticals(doc, rowY, y, tableStartX, colWidths);

        rowNum++;
      }

      // Если процессов нет
      if (tasksForAI.length === 0) {
        const rowY = y;
        y += 2;
        doc.text('Работы за отчетный период отсутствуют', tableStartX + 3, y, { width: tableWidth - 6, align: 'center' });
        y += 16;
        drawTableLine(doc, y, tableStartX, tableWidth);
        drawTableVerticals(doc, rowY, y, tableStartX, colWidths);
      }

      // ============ ИТОГ ТАБЛИЦЫ ============
      y += 12;
      doc.fontSize(PDF_CONFIG.fontSize.body);
      if (fonts.bold) doc.font('Roboto-Bold');
      doc.text(`ИТОГО: ${formatHours(data.summary.total_hours)}`, startX, y);
      doc.font('Roboto');

      // ============ ДЕТАЛЬНОЕ ОПИСАНИЕ ВЫПОЛНЕННЫХ РАБОТ ============
      y += 25;
      doc.addPage();
      y = doc.page.margins.top;

      doc.fontSize(PDF_CONFIG.fontSize.title);
      if (fonts.bold) doc.font('Roboto-Bold');
      doc.text('ДЕТАЛЬНОЕ ОПИСАНИЕ ВЫПОЛНЕННЫХ РАБОТ', centerX, y, { width: fullWidth, align: 'center' });
      y += 25;
      doc.font('Roboto');

      // Виводимо детальний опис для кожного процесу
      rowNum = 1;
      for (const processData of tasksForAI) {
        // Проверка новой страницы
        if (y > doc.page.height - 150) {
          doc.addPage();
          y = doc.page.margins.top;
        }

        // Заголовок процесу
        doc.fontSize(PDF_CONFIG.fontSize.subtitle);
        if (fonts.bold) doc.font('Roboto-Bold');
        doc.text(`${rowNum}. ${processData.serviceName}`, startX, y, { width: pageWidth });
        y += 16;
        doc.font('Roboto');

        // Метрики
        doc.fontSize(PDF_CONFIG.fontSize.small);
        doc.fillColor(PDF_CONFIG.colors.gray);
        doc.text(`Трудозатраты: ${processData.totalHours.toFixed(1)} ч/ч  |  Специалистов: ${processData.employees.length}  |  Задач: ${processData.taskCount}`, startX, y);
        y += 14;
        doc.fillColor(PDF_CONFIG.colors.black);

        // Детальний опис (AI або базовий)
        let detailedText = aiDescriptions.get(processData.serviceId);
        if (!detailedText) {
          const processGroup = tasksByProcess.get(processData.serviceName);
          detailedText = generateDetailedDescription(
            processGroup?.tasks || [],
            processData.serviceName,
            processData.totalHours,
            processData.employees.length
          );
        }

        // Виводимо опис з переносами
        doc.fontSize(PDF_CONFIG.fontSize.body);
        const textHeight = doc.heightOfString(detailedText, { width: pageWidth });

        // Если текст не помещается - новая страница
        if (y + textHeight > doc.page.height - 60) {
          doc.addPage();
          y = doc.page.margins.top;
        }

        doc.text(detailedText, startX, y, { width: pageWidth, align: 'justify' });
        y += textHeight + 20;

        // Разделитель
        doc.moveTo(startX, y - 10)
          .lineTo(startX + pageWidth, y - 10)
          .strokeColor('#E5E7EB')
          .stroke();
        doc.strokeColor(PDF_CONFIG.colors.black);

        rowNum++;
      }

      // ============ ПРИВЛЕЧЕННЫЕ СПЕЦИАЛИСТЫ (с разбивкой по отделам) ============
      if (data.employees && data.employees.length > 0) {
        // Новая страница для раздела специалистов
        doc.addPage();
        y = doc.page.margins.top;

        doc.fontSize(PDF_CONFIG.fontSize.title);
        if (fonts.bold) doc.font('Roboto-Bold');
        doc.text('ПРИВЛЕЧЕННЫЕ СПЕЦИАЛИСТЫ ИСПОЛНИТЕЛЯ', centerX, y, { width: fullWidth, align: 'center' });
        y += 25;
        doc.font('Roboto');

        // Группируем сотрудников по отделам
        const employeesByDept = new Map<string, typeof data.employees>();
        for (const emp of data.employees) {
          const deptName = emp.department_name || 'Другие подразделения';
          if (!employeesByDept.has(deptName)) {
            employeesByDept.set(deptName, []);
          }
          employeesByDept.get(deptName)!.push(emp);
        }

        // Выводим по отделам
        for (const [deptName, employees] of Array.from(employeesByDept.entries())) {
          if (y > doc.page.height - 100) {
            doc.addPage();
            y = doc.page.margins.top;
          }

          // Название отдела
          doc.fontSize(PDF_CONFIG.fontSize.subtitle);
          if (fonts.bold) doc.font('Roboto-Bold');
          doc.text(deptName, startX, y);
          doc.font('Roboto');
          y += 15;

          // Сортируем по часам
          const sortedEmps = employees.sort((a, b) => (b.hours || 0) - (a.hours || 0));

          // Сумма часов отдела
          const deptTotalHours = sortedEmps.reduce((sum, e) => sum + (e.hours || 0), 0);
          doc.fontSize(PDF_CONFIG.fontSize.small);
          doc.fillColor(PDF_CONFIG.colors.gray);
          doc.text(`Итого: ${formatHours(deptTotalHours)} (${sortedEmps.length} специалистов)`, startX, y);
          y += 12;
          doc.fillColor(PDF_CONFIG.colors.black);

          // Таблица сотрудников отдела
          doc.fontSize(PDF_CONFIG.fontSize.body);
          for (const emp of sortedEmps) {
            if (y > doc.page.height - 50) {
              doc.addPage();
              y = doc.page.margins.top;
            }
            const position = emp.position || 'Специалист';
            doc.text(`• ${emp.full_name}`, startX + 10, y);
            doc.fillColor(PDF_CONFIG.colors.gray);
            doc.text(`${position} — ${formatHours(emp.hours || 0)}`, startX + 200, y);
            doc.fillColor(PDF_CONFIG.colors.black);
            y += 12;
          }
          y += 10;
        }

        // Общий итог
        y += 10;
        if (fonts.bold) doc.font('Roboto-Bold');
        doc.text(`ВСЕГО ПРИВЛЕЧЕНО: ${data.employees.length} специалистов`, startX, y);
        doc.font('Roboto');
      }

      // ============ ПОДПИСИ ============
      y += 30;
      if (y > doc.page.height - 90) {
        doc.addPage();
        y = doc.page.margins.top + 15;
      }

      doc.fontSize(PDF_CONFIG.fontSize.body);
      const halfWidth = pageWidth / 2 - 15;

      if (fonts.bold) doc.font('Roboto-Bold');
      doc.text('От Исполнителя:', startX, y);
      doc.text('От Заказчика:', startX + halfWidth + 30, y);
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
      doc.text('(подпись)              (Ф.И.О.)', startX + 15, y);
      doc.text('(подпись)              (Ф.И.О.)', startX + halfWidth + 45, y);
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

