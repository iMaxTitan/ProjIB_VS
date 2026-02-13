/**
 * API endpoint для генерации PDF/Word отчетов
 * POST /api/reports/generate
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCompanyReportData, getEmployeeReportData, getQuarterlyPlanReportData, getQuarterlyReportData } from '@/lib/services/monthly-report.service';
import { generateCompanyReportPDF, generateEmployeeReportPDF, generateQuarterlyPlanPDF, generateQuarterlyReportPDF } from '@/lib/services/pdf-report.service';
import { isRequestAuthorized, getRequesterKey, checkRateLimit } from '@/lib/api/request-guards';
import logger from '@/lib/logger';

const MONTHS_UA = [
  'січень', 'лютий', 'березень', 'квітень', 'травень', 'червень',
  'липень', 'серпень', 'вересень', 'жовтень', 'листопад', 'грудень'
];

/** Санітизація імені для файлу: залишаємо кирилицю, латиницю, цифри, дефіс */
function sanitizeFileName(name: string, maxLen = 40): string {
  return name
    .replace(/[^a-zA-Zа-яА-ЯіІїЇєЄґҐ0-9\s-]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, maxLen);
}

function getTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}`;
}

interface GenerateReportRequest {
  type: 'company' | 'employee' | 'quarterly_plan' | 'quarterly_report';
  id?: string; // company_id или user_id (не нужен для quarterly_plan)
  year: number;
  month?: number;
  quarter?: number; // Для quarterly_plan (1-4)
  format: 'pdf' | 'docx';
}

const PDF_RATE_LIMIT = 10;
const PDF_RATE_WINDOW_MS = 60_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  if (!isRequestAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rateLimit = checkRateLimit(getRequesterKey(request), PDF_RATE_LIMIT, PDF_RATE_WINDOW_MS);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too Many Requests' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSec) } }
    );
  }

  try {
    const body: GenerateReportRequest = await request.json();
    const { type, id, format } = body;

    // Валидация обязательных полей
    if (!type) {
      return NextResponse.json(
        { error: 'Отсутствует обязательный параметр: type' },
        { status: 400 }
      );
    }

    // Валидация типов и диапазонов
    if (type !== 'company' && type !== 'employee' && type !== 'quarterly_plan' && type !== 'quarterly_report') {
      return NextResponse.json(
        { error: 'Неверный тип отчета. Допустимые значения: company, employee, quarterly_plan, quarterly_report' },
        { status: 400 }
      );
    }

    if (format !== 'pdf' && format !== 'docx') {
      return NextResponse.json(
        { error: 'Неверный формат. Допустимые значения: pdf, docx' },
        { status: 400 }
      );
    }

    // Для company/employee обязателен id (UUID)
    if (type !== 'quarterly_plan' && type !== 'quarterly_report') {
      if (!id || !UUID_RE.test(id)) {
        return NextResponse.json({ error: 'Неверный формат ID' }, { status: 400 });
      }
      const { year, month } = body;
      if (!year || !month) {
        return NextResponse.json(
          { error: 'Отсутствуют обязательные параметры: year, month' },
          { status: 400 }
        );
      }
      const yearNum = Number(year);
      const monthNum = Number(month);
      if (!Number.isInteger(yearNum) || yearNum < 2000 || yearNum > 2100) {
        return NextResponse.json({ error: 'Неверный год (2000-2100)' }, { status: 400 });
      }
      if (!Number.isInteger(monthNum) || monthNum < 1 || monthNum > 12) {
        return NextResponse.json({ error: 'Неверный месяц (1-12)' }, { status: 400 });
      }
    }

    let pdfBuffer: Buffer;
    let fileName: string;
    const year = body.year || 0;
    const month = body.month || 0;

    if (type === 'quarterly_plan' || type === 'quarterly_report') {
      // Генерация квартального документа (по году + кварталу)
      const quarterNum = Number(body.quarter);
      if (!Number.isInteger(quarterNum) || quarterNum < 1 || quarterNum > 4) {
        return NextResponse.json({ error: 'Неверный квартал (1-4)' }, { status: 400 });
      }
      const yearNum = Number(body.year);
      if (!Number.isInteger(yearNum) || yearNum < 2000 || yearNum > 2100) {
        return NextResponse.json({ error: 'Неверный год (2000-2100)' }, { status: 400 });
      }

      logger.log(`[API/reports/generate] Квартальный документ (${type}): год=${yearNum}, Q${quarterNum}`);

      if (type === 'quarterly_report') {
        // Генерация ОТЧЁТА (6 колонок, note из БД)
        let reportData;
        try {
          reportData = await getQuarterlyReportData(yearNum, quarterNum);
        } catch (rpcError: unknown) {
          logger.error('[API/reports/generate] Ошибка данных квартального отчёта:', rpcError);
          return NextResponse.json({ error: 'Ошибка получения данных из базы' }, { status: 500 });
        }
        if (!reportData) {
          return NextResponse.json({ error: 'Данные для квартального отчёта не найдены' }, { status: 404 });
        }

        try {
          pdfBuffer = await generateQuarterlyReportPDF(reportData);
          logger.log(`[API/reports/generate] PDF квартального отчёта: ${pdfBuffer.length} байт`);
        } catch (pdfError: unknown) {
          logger.error('[API/reports/generate] Ошибка генерации PDF отчёта:', pdfError);
          return NextResponse.json({ error: 'Ошибка генерации PDF' }, { status: 500 });
        }
      } else {
        // Генерация ПЛАНА (5 колонок, approved/active)
        let reportData;
        try {
          reportData = await getQuarterlyPlanReportData(yearNum, quarterNum);
        } catch (rpcError: unknown) {
          logger.error('[API/reports/generate] Ошибка данных квартального плана:', rpcError);
          return NextResponse.json({ error: 'Ошибка получения данных из базы' }, { status: 500 });
        }
        if (!reportData) {
          return NextResponse.json({ error: 'Данные для квартального плана не найдены' }, { status: 404 });
        }
        try {
          pdfBuffer = await generateQuarterlyPlanPDF(reportData);
          logger.log(`[API/reports/generate] PDF квартального плана: ${pdfBuffer.length} байт`);
        } catch (pdfError: unknown) {
          logger.error('[API/reports/generate] Ошибка генерации PDF:', pdfError);
          return NextResponse.json({ error: 'Ошибка генерации PDF' }, { status: 500 });
        }
      }

      const ts = getTimestamp();
      fileName = type === 'quarterly_report'
        ? `Звіт_УІБК_Q${quarterNum}_${yearNum}(${ts})`
        : `План_УІБК_Q${quarterNum}_${yearNum}(${ts})`;
    } else if (type === 'company') {
      // Получаем данные для отчета по предприятию
      logger.log(`[API/reports/generate] Запрос данных для компании: ${id}, период: ${month}/${year}`);

      let reportData;
      try {
        reportData = await getCompanyReportData(id!, year, month);
        logger.log('[API/reports/generate] Получены данные:', reportData ? 'OK' : 'NULL');
      } catch (rpcError: unknown) {
        logger.error('[API/reports/generate] Ошибка RPC:', rpcError);
        return NextResponse.json(
          { error: 'Ошибка получения данных из базы' },
          { status: 500 }
        );
      }

      if (!reportData) {
        return NextResponse.json(
          { error: 'Данные для отчета не найдены' },
          { status: 404 }
        );
      }

      logger.log(`[API/reports/generate] Генерация PDF для: ${reportData.company?.company_name}`);
      try {
        pdfBuffer = await generateCompanyReportPDF(reportData);
        logger.log(`[API/reports/generate] PDF сгенерирован, размер: ${pdfBuffer.length}`);
      } catch (pdfError: unknown) {
        logger.error('[API/reports/generate] Ошибка генерации PDF:', pdfError);
        return NextResponse.json(
          { error: 'Ошибка генерации PDF' },
          { status: 500 }
        );
      }

      const companyName = sanitizeFileName(reportData.company.company_name);
      const monthUA = MONTHS_UA[month - 1];
      const ts = getTimestamp();
      fileName = `Звіт_${companyName}_${monthUA}_${year}(${ts})`;
    } else {
      // Получаем данные для отчета по сотруднику
      logger.log(`[API/reports/generate] Запрос данных для сотрудника: ${id}, период: ${month}/${year}`);

      let reportData;
      try {
        reportData = await getEmployeeReportData(id!, year, month);
        logger.log('[API/reports/generate] Получены данные:', reportData ? 'OK' : 'NULL');
      } catch (rpcError: unknown) {
        logger.error('[API/reports/generate] Ошибка RPC:', rpcError);
        return NextResponse.json(
          { error: 'Ошибка получения данных из базы' },
          { status: 500 }
        );
      }

      if (!reportData) {
        return NextResponse.json(
          { error: 'Данные для отчета не найдены' },
          { status: 404 }
        );
      }

      logger.log(`[API/reports/generate] Генерация PDF для: ${reportData.employee?.full_name}`);
      try {
        pdfBuffer = await generateEmployeeReportPDF(reportData);
        logger.log(`[API/reports/generate] PDF сгенерирован, размер: ${pdfBuffer.length}`);
      } catch (pdfError: unknown) {
        logger.error('[API/reports/generate] Ошибка генерации PDF:', pdfError);
        return NextResponse.json(
          { error: 'Ошибка генерации PDF' },
          { status: 500 }
        );
      }

      const employeeName = sanitizeFileName(reportData.employee.full_name);
      const monthUA = MONTHS_UA[month - 1];
      const ts = getTimestamp();
      fileName = `Звіт_${employeeName}_${monthUA}_${year}(${ts})`;
    }

    if (format === 'pdf') {
      return new NextResponse(pdfBuffer as unknown as BodyInit, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}.pdf"`,
          'Content-Length': String(pdfBuffer.length),
        },
      });
    }

    if (format === 'docx') {
      return NextResponse.json(
        { error: 'Формат DOCX временно недоступен. Используйте PDF.' },
        { status: 501 }
      );
    }

    return NextResponse.json({ error: 'Неизвестный формат' }, { status: 400 });
  } catch (error: unknown) {
    logger.error('[API/reports/generate] Ошибка:', error);
    return NextResponse.json(
      { error: 'Ошибка генерации отчета' },
      { status: 500 }
    );
  }
}
