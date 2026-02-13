/**
 * API endpoint для генерации AI-примечаний к отчёту по предприятию.
 * POST /api/reports/company-notes
 *
 * Генерирует AI ноты по мероприятиям → сохраняет в company_report_notes → возвращает клиенту.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isRequestAuthorized, getRequesterKey, checkRateLimit } from '@/lib/api/request-guards';
import {
  collectTasksForCompanyMeasures,
  generateAINotesForCompanyReport,
  generateFallbackNote,
} from '@/lib/services/company-notes.service';
import { getReportClient } from '@/lib/services/monthly-report.service';
import logger from '@/lib/logger';

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

interface CompanyNotesRequest {
  company_id: string;
  measure_ids: string[];
  year: number;
  month: number;
}

export async function POST(request: NextRequest) {
  if (!isRequestAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rateLimit = checkRateLimit(getRequesterKey(request), RATE_LIMIT, RATE_WINDOW_MS);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too Many Requests' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSec) } }
    );
  }

  try {
    const body: CompanyNotesRequest = await request.json();
    const { company_id, measure_ids, year, month } = body;

    if (!company_id || !Array.isArray(measure_ids) || measure_ids.length === 0 || !year || !month) {
      return NextResponse.json({ error: 'company_id, measure_ids, year, month are required' }, { status: 400 });
    }

    if (measure_ids.length > 50) {
      return NextResponse.json({ error: 'Too many measure_ids (max 50)' }, { status: 400 });
    }

    logger.log(`[API/company-notes] Generating notes for ${measure_ids.length} measures, company=${company_id}`);

    // Собираем контекст задач
    const tasksContexts = await collectTasksForCompanyMeasures(company_id, measure_ids, year, month);
    const contextsArray = Array.from(tasksContexts.values());

    // Генерируем AI ноты
    const aiNotes = await generateAINotesForCompanyReport(contextsArray);

    // Объединяем: AI нота || fallback
    const notes: Record<string, string> = {};
    for (const mId of measure_ids) {
      const ctx = tasksContexts.get(mId);
      notes[mId] = aiNotes.get(mId)
        || (ctx ? generateFallbackNote(ctx) : '—');
    }

    logger.log(`[API/company-notes] Done: ${aiNotes.size} AI + ${measure_ids.length - aiNotes.size} fallback`);

    // UPSERT ноты в company_report_notes
    const db = getReportClient();
    const saveResults = await Promise.allSettled(
      Object.entries(notes).map(([measureId, noteText]) =>
        db.from('company_report_notes').upsert(
          {
            company_id,
            measure_id: measureId,
            year,
            month,
            note: noteText,
          },
          { onConflict: 'company_id,measure_id,year,month' }
        )
      )
    );
    const savedCount = saveResults.filter(r => r.status === 'fulfilled').length;
    logger.log(`[API/company-notes] Saved ${savedCount}/${Object.keys(notes).length} notes to DB`);

    return NextResponse.json({ notes });
  } catch (error: unknown) {
    logger.error('[API/company-notes] Error:', error);
    return NextResponse.json({ error: 'Ошибка генерации примечаний' }, { status: 500 });
  }
}
