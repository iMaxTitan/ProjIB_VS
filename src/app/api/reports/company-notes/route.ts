/**
 * API endpoint для примечаний к отчёту по предприятию.
 * POST /api/reports/company-notes — генерация AI нот → сохранение
 * PUT  /api/reports/company-notes — ручное сохранение одной ноты
 */

import { NextRequest, NextResponse } from 'next/server';
import { isRequestAuthorized, getRequesterKey, checkRateLimit } from '@/lib/shared/api/request-guards';
import {
  collectTasksForCompanyProcedures,
  generateAINotesForCompanyReport,
  generateFallbackNote,
} from '@/lib/ops/reports/company-notes';
import { getReportClient } from '@/lib/ops';
import logger from '@/lib/shared/logger';

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

interface CompanyNotesRequest {
  company_id: string;
  procedure_ids: string[];
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
    const { company_id, procedure_ids, year, month } = body;

    if (!company_id || !Array.isArray(procedure_ids) || procedure_ids.length === 0 || !year || !month) {
      return NextResponse.json({ error: 'company_id, procedure_ids, year, month are required' }, { status: 400 });
    }

    if (procedure_ids.length > 50) {
      return NextResponse.json({ error: 'Too many procedure_ids (max 50)' }, { status: 400 });
    }

    logger.log(`[API/company-notes] Generating notes for ${procedure_ids.length} procedures, company=${company_id}`);

    // Собираем контекст задач
    const tasksContexts = await collectTasksForCompanyProcedures(company_id, procedure_ids, year, month);
    const contextsArray = Array.from(tasksContexts.values());

    // Генерируем AI ноты
    const aiResult = await generateAINotesForCompanyReport(contextsArray);
    const aiNotes = aiResult.notes;

    // Объединяем: AI нота || fallback
    const notes: Record<string, string> = {};
    for (const procedureId of procedure_ids) {
      const ctx = tasksContexts.get(procedureId);
      notes[procedureId] = aiNotes.get(procedureId)
        || (ctx ? generateFallbackNote(ctx) : '—');
    }

    logger.log(`[API/company-notes] Done: ${aiNotes.size} AI + ${procedure_ids.length - aiNotes.size} fallback`);

    // UPSERT ноты в company_report_notes
    const db = getReportClient();
    const saveResults = await Promise.allSettled(
      Object.entries(notes).map(([procedureId, noteText]) =>
        db.from('company_report_notes').upsert(
          {
            company_id,
            procedure_id: procedureId,
            year,
            month,
            note: noteText,
          },
          { onConflict: 'company_id,procedure_id,year,month' }
        )
      )
    );
    const savedCount = saveResults.filter(r => r.status === 'fulfilled').length;
    logger.log(`[API/company-notes] Saved ${savedCount}/${Object.keys(notes).length} notes to DB`);

    return NextResponse.json({ notes, usage: aiResult.usage });
  } catch (error: unknown) {
    logger.error('[API/company-notes] Error:', error);
    return NextResponse.json({ error: 'Ошибка генерации примечаний' }, { status: 500 });
  }
}

/**
 * PUT /api/reports/company-notes
 * Save a single note manually (etalon pick or manual edit).
 * Body: { company_id, procedure_id, year, month, note }
 */
export async function PUT(request: NextRequest) {
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
    const body = await request.json();
    const { company_id, procedure_id, year, month, note } = body;

    if (!company_id || !procedure_id || !year || !month || typeof note !== 'string') {
      return NextResponse.json(
        { error: 'company_id, procedure_id, year, month, note are required' },
        { status: 400 }
      );
    }

    const trimmed = note.trim();
    if (trimmed.length < 5) {
      return NextResponse.json({ error: 'Note must be at least 5 characters' }, { status: 400 });
    }

    const db = getReportClient();
    const { error: upsertError } = await db.from('company_report_notes').upsert(
      { company_id, procedure_id, year, month, note: trimmed },
      { onConflict: 'company_id,procedure_id,year,month' }
    );

    if (upsertError) {
      logger.error('[API/company-notes] PUT upsert error:', upsertError);
      return NextResponse.json({ error: 'Помилка збереження' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    logger.error('[API/company-notes] PUT error:', error);
    return NextResponse.json({ error: 'Помилка збереження' }, { status: 500 });
  }
}
