/**
 * API endpoint для генерации AI-примечаний к квартальному отчёту.
 * POST /api/reports/quarterly-notes
 *
 * Вызывается из UI по кнопке "Згенерувати".
 * Генерирует AI ноты → сохраняет в БД (quarterly_plans.note) → возвращает клиенту.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isRequestAuthorized, getRequesterKey, checkRateLimit } from '@/lib/api/request-guards';
import { collectTasksForQuarterlyPlans, generateAINotesForQuarterlyReport, generateFallbackNote } from '@/lib/services/quarterly-notes.service';
import { getReportClient } from '@/lib/services/monthly-report.service';
import logger from '@/lib/logger';

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

interface QuarterlyNotesRequest {
  quarterly_ids: string[];
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
    const body: QuarterlyNotesRequest = await request.json();
    const { quarterly_ids } = body;

    if (!Array.isArray(quarterly_ids) || quarterly_ids.length === 0) {
      return NextResponse.json({ error: 'quarterly_ids is required' }, { status: 400 });
    }

    if (quarterly_ids.length > 50) {
      return NextResponse.json({ error: 'Too many quarterly_ids (max 50)' }, { status: 400 });
    }

    logger.log(`[API/quarterly-notes] Generating notes for ${quarterly_ids.length} plans`);

    // Собираем контекст задач
    const tasksContexts = await collectTasksForQuarterlyPlans(quarterly_ids);
    const contextsArray = Array.from(tasksContexts.values());

    // Генерируем AI ноты
    const aiNotes = await generateAINotesForQuarterlyReport(contextsArray);

    // Объединяем: AI нота || fallback
    const notes: Record<string, string> = {};
    for (const qId of quarterly_ids) {
      const ctx = tasksContexts.get(qId);
      notes[qId] = aiNotes.get(qId)
        || (ctx ? generateFallbackNote(ctx) : '—');
    }

    logger.log(`[API/quarterly-notes] Done: ${aiNotes.size} AI + ${quarterly_ids.length - aiNotes.size} fallback`);

    // Сохраняем ноты в БД (quarterly_plans.note)
    const db = getReportClient();
    const saveResults = await Promise.allSettled(
      Object.entries(notes).map(([qId, noteText]) =>
        db.from('quarterly_plans').update({ note: noteText }).eq('quarterly_id', qId)
      )
    );
    const savedCount = saveResults.filter(r => r.status === 'fulfilled').length;
    logger.log(`[API/quarterly-notes] Saved ${savedCount}/${Object.keys(notes).length} notes to DB`);

    return NextResponse.json({ notes });
  } catch (error: unknown) {
    logger.error('[API/quarterly-notes] Error:', error);
    return NextResponse.json({ error: 'Ошибка генерации примечаний' }, { status: 500 });
  }
}
