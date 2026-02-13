import { NextRequest, NextResponse } from 'next/server';
import { ExcelReportGenerator } from '@/lib/reports/excel-report-generator';
import { GraphSharePointService } from '@/services/graph/sharepoint-service';
import { supabase } from '@/lib/supabase';
import logger from '@/lib/logger';
import { isRequestAuthorized, getRequesterKey, checkRateLimit } from '@/lib/api/request-guards';

/**
 * Секретный ключ для защиты cron endpoint.
 * Должен быть установлен в переменных окружения.
 */
const CRON_SECRET = process.env.CRON_SECRET;

/**
 * Возвращает предыдущий месяц (для автоматического отчета)
 */
function getPreviousMonth(): { year: number; month: number } {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth(); // 0-indexed, поэтому это предыдущий месяц

  if (month === 0) {
    month = 12;
    year -= 1;
  }

  return { year, month };
}

/**
 * Логирование генерации отчета
 */
async function logReportGeneration(
  year: number,
  month: number,
  departmentId: string | undefined,
  uploadResult: { success: boolean; webUrl?: string; error?: string } | null,
  isAutomatic: boolean
): Promise<void> {
  try {
    await supabase.from('activities').insert({
      action_type: 'report_generated',
      target_type: 'monthly_report',
      target_id: departmentId || '00000000-0000-0000-0000-000000000000',
      user_id: '00000000-0000-0000-0000-000000000000', // Системный пользователь
      details: {
        year,
        month,
        department_id: departmentId,
        uploaded_to_sharepoint: uploadResult?.success || false,
        sharepoint_url: uploadResult?.webUrl || null,
        error: uploadResult?.error || null,
        is_automatic: isAutomatic
      }
    });
  } catch (error: unknown) {
    logger.error('[logReportGeneration] Error:', error);
  }
}

/**
 * POST - ручной запуск генерации отчета.
 * Требует авторизацию пользователя через cookie.
 *
 * Body:
 * - year: number (обязательно)
 * - month: number (обязательно, 1-12)
 * - departmentId?: string (опционально, для фильтрации по отделу)
 * - uploadToSharePoint?: boolean (по умолчанию true)
 */
const REPORT_RATE_LIMIT = 5;
const REPORT_RATE_WINDOW_MS = 60_000;

export async function POST(request: NextRequest) {
  try {
    if (!isRequestAuthorized(request)) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    }

    const rateLimit = checkRateLimit(getRequesterKey(request), REPORT_RATE_LIMIT, REPORT_RATE_WINDOW_MS);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too Many Requests' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSec) } }
      );
    }

    const body = await request.json();
    const { year, month, departmentId, uploadToSharePoint = true } = body;

    // Валидация параметров
    if (!year || !month) {
      return NextResponse.json(
        { error: 'Параметры year и month обязательны' },
        { status: 400 }
      );
    }

    if (month < 1 || month > 12) {
      return NextResponse.json(
        { error: 'Месяц должен быть от 1 до 12' },
        { status: 400 }
      );
    }

    logger.log(`[Monthly Report] Генерация отчета: ${month}/${year}, отдел: ${departmentId || 'все'}`);

    // Генерируем данные отчета
    const reportData = await ExcelReportGenerator.getMonthlyReportData(
      year,
      month,
      departmentId
    );

    if (!reportData) {
      return NextResponse.json(
        { error: 'Не удалось получить данные для отчета' },
        { status: 500 }
      );
    }

    // Генерируем Excel
    const excelBuffer = await ExcelReportGenerator.generateExcel(reportData);

    // Загружаем в SharePoint если требуется
    let sharePointResult = null;
    if (uploadToSharePoint) {
      sharePointResult = await GraphSharePointService.uploadMonthlyReport(
        year,
        month,
        reportData.department.code,
        excelBuffer
      );

      if (!sharePointResult.success) {
        logger.error('[Monthly Report] Ошибка загрузки в SharePoint:', sharePointResult.error);
      }
    }

    // Логируем действие
    await logReportGeneration(year, month, departmentId, sharePointResult, false);

    return NextResponse.json({
      success: true,
      report: {
        period: reportData.period,
        department: reportData.department,
        summary: reportData.summary
      },
      sharePoint: sharePointResult ? {
        uploaded: sharePointResult.success,
        url: sharePointResult.webUrl,
        error: sharePointResult.error
      } : null
    });
  } catch (error: unknown) {
    logger.error('[Monthly Report API] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Ошибка генерации отчета';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * GET - cron endpoint для автоматической генерации отчетов.
 * Защищен секретным ключом через заголовок Authorization.
 *
 * Запускается 1-го числа каждого месяца через Vercel Cron.
 * Генерирует отчеты за предыдущий месяц для всех отделов.
 */
export async function GET(request: NextRequest) {
  try {
    // Проверяем секретный ключ для cron
    const authHeader = request.headers.get('authorization');

    // Vercel Cron отправляет CRON_SECRET в заголовке
    if (!CRON_SECRET) {
      logger.error('[Monthly Report Cron] CRON_SECRET не настроен');
      return NextResponse.json(
        { error: 'CRON_SECRET не настроен' },
        { status: 500 }
      );
    }

    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json(
        { error: 'Не авторизован' },
        { status: 401 }
      );
    }

    const { year, month } = getPreviousMonth();
    logger.log(`[Monthly Report Cron] Генерация отчетов за ${month}/${year}`);

    // Получаем все отделы для генерации отчетов
    const { data: departments, error: deptError } = await supabase
      .from('departments')
      .select('department_id, department_code, department_name');

    if (deptError) {
      throw new Error(`Ошибка получения отделов: ${deptError.message}`);
    }

    const results: Array<{
      department: string;
      success: boolean;
      url?: string;
      error?: string;
    }> = [];

    // Генерируем отчет для каждого отдела
    for (const dept of departments || []) {
      try {
        logger.log(`[Monthly Report Cron] Обработка отдела: ${dept.department_name}`);

        const reportData = await ExcelReportGenerator.getMonthlyReportData(
          year,
          month,
          dept.department_id
        );

        if (!reportData || reportData.summary.totalPlans === 0) {
          results.push({
            department: dept.department_name,
            success: false,
            error: 'Нет данных для отчета'
          });
          continue;
        }

        const excelBuffer = await ExcelReportGenerator.generateExcel(reportData);

        const uploadResult = await GraphSharePointService.uploadMonthlyReport(
          year,
          month,
          dept.department_code || dept.department_name.substring(0, 10),
          excelBuffer
        );

        results.push({
          department: dept.department_name,
          success: uploadResult.success,
          url: uploadResult.webUrl,
          error: uploadResult.error
        });

        // Логируем
        await logReportGeneration(year, month, dept.department_id, uploadResult, true);
      } catch (deptError: unknown) {
        const errorMessage = deptError instanceof Error ? deptError.message : 'Неизвестная ошибка';
        logger.error(`[Monthly Report Cron] Ошибка для ${dept.department_name}:`, deptError);
        results.push({
          department: dept.department_name,
          success: false,
          error: errorMessage
        });
      }
    }

    // Также генерируем сводный отчет по всем отделам
    try {
      logger.log('[Monthly Report Cron] Генерация сводного отчета');

      const allReportData = await ExcelReportGenerator.getMonthlyReportData(year, month);
      if (allReportData && allReportData.summary.totalPlans > 0) {
        const allExcelBuffer = await ExcelReportGenerator.generateExcel(allReportData);
        const allUploadResult = await GraphSharePointService.uploadMonthlyReport(
          year,
          month,
          'UIBK_ALL', // Код для сводного отчета
          allExcelBuffer
        );
        results.push({
          department: 'Сводный отчет',
          success: allUploadResult.success,
          url: allUploadResult.webUrl,
          error: allUploadResult.error
        });

        await logReportGeneration(year, month, undefined, allUploadResult, true);
      }
    } catch (allError: unknown) {
      const errorMessage = allError instanceof Error ? allError.message : 'Неизвестная ошибка';
      logger.error('[Monthly Report Cron] Ошибка сводного отчета:', allError);
      results.push({
        department: 'Сводный отчет',
        success: false,
        error: errorMessage
      });
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    logger.log(`[Monthly Report Cron] Завершено. Успешно: ${successCount}, Ошибок: ${failCount}`);

    return NextResponse.json({
      success: true,
      period: { year, month },
      summary: {
        total: results.length,
        success: successCount,
        failed: failCount
      },
      results
    });
  } catch (error: unknown) {
    logger.error('[Monthly Report Cron] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Ошибка cron-задачи';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

