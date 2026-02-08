/**
 * API endpoint для генерации PDF/Word отчетов
 * POST /api/reports/generate
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCompanyReportData, getEmployeeReportData, MONTH_NAMES_UK } from '@/lib/services/monthly-report.service';
import { generateCompanyReportPDF, generateEmployeeReportPDF } from '@/lib/services/pdf-report.service';
import { getErrorMessage } from '@/lib/utils/error-message';
import { isRequestAuthorized } from '@/lib/api/request-guards';
import logger from '@/lib/logger';

interface GenerateReportRequest {
  type: 'company' | 'employee';
  id: string; // company_id или user_id
  year: number;
  month: number;
  format: 'pdf' | 'docx';
}

export async function POST(request: NextRequest) {
  if (!isRequestAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const body: GenerateReportRequest = await request.json();
    const { type, id, year, month, format } = body;

    // Валидация
    if (!type || !id || !year || !month) {
      return NextResponse.json(
        { error: 'Отсутствуют обязательные параметры: type, id, year, month' },
        { status: 400 }
      );
    }

    if (type !== 'company' && type !== 'employee') {
      return NextResponse.json(
        { error: 'Неверный тип отчета. Допустимые значения: company, employee' },
        { status: 400 }
      );
    }

    if (format !== 'pdf' && format !== 'docx') {
      return NextResponse.json(
        { error: 'Неверный формат. Допустимые значения: pdf, docx' },
        { status: 400 }
      );
    }

    let pdfBuffer: Buffer;
    let fileName: string;

    if (type === 'company') {
      // Получаем данные для отчета по предприятию
      logger.log(`[API/reports/generate] Запрос данных для компании: ${id}, период: ${month}/${year}`);

      let reportData;
      try {
        reportData = await getCompanyReportData(id, year, month);
        logger.log('[API/reports/generate] Получены данные:', reportData ? 'OK' : 'NULL');
      } catch (rpcError: unknown) {
        logger.error('[API/reports/generate] Ошибка RPC:', rpcError);
        return NextResponse.json(
          { error: 'Ошибка получения данных из базы', details: getErrorMessage(rpcError) },
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
          { error: 'Ошибка генерации PDF', details: getErrorMessage(pdfError) },
          { status: 500 }
        );
      }

      const companyName = reportData.company.company_name
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .substring(0, 30);
      const monthName = MONTH_NAMES_UK[month - 1];
      fileName = `Акт_${companyName}_${monthName}_${year}`;
    } else {
      // Получаем данные для отчета по сотруднику
      logger.log(`[API/reports/generate] Запрос данных для сотрудника: ${id}, период: ${month}/${year}`);

      let reportData;
      try {
        reportData = await getEmployeeReportData(id, year, month);
        logger.log('[API/reports/generate] Получены данные:', reportData ? 'OK' : 'NULL');
      } catch (rpcError: unknown) {
        logger.error('[API/reports/generate] Ошибка RPC:', rpcError);
        return NextResponse.json(
          { error: 'Ошибка получения данных из базы', details: getErrorMessage(rpcError) },
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
          { error: 'Ошибка генерации PDF', details: getErrorMessage(pdfError) },
          { status: 500 }
        );
      }

      const employeeName = reportData.employee.full_name
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .substring(0, 30);
      const monthName = MONTH_NAMES_UK[month - 1];
      fileName = `Отчет_${employeeName}_${monthName}_${year}`;
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
      { error: 'Ошибка генерации отчета', details: getErrorMessage(error) },
      { status: 500 }
    );
  }
}

