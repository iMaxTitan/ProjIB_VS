/**
 * Draft task creation from a simple text message.
 *
 * Pattern: "[дата] описание Nч"
 * Examples:
 *   "аудит сервера 2ч"           → description="аудит сервера", hours=2, date=today
 *   "вчера совещание по КЕДО 1.5ч" → description="совещание по КЕДО", hours=1.5, date=yesterday
 *   "07.03 настройка фаервола 3ч"  → description="настройка фаервола", hours=3, date=2026-03-07
 *
 * Returns true if the message matched the pattern (consumed), false otherwise.
 */

import type { PostgrestClient } from '@/lib/shared/postgrest-client';
import { sendMessage } from '@/lib/bot/telegram/bot';
import { esc } from '@/lib/bot/shared/format-helpers';
import { fmtH } from '@/lib/bot/telegram/task-wizard/step-helpers';
import logger from '@/lib/shared/logger';

// ─── Hours pattern: "2ч", "1.5ч", "3,5г", "2 год", "0.5 часа" ──────────────

const HOURS_RE = /(\d+(?:[.,]\d+)?)\s*(?:ч(?:ас(?:а|ов|і?в)?)?|год(?:ин[иу]?)?|г)\s*$/i;

// ─── Date prefixes ───────────────────────────────────────────────────────────

const DATE_WORDS: Record<string, number> = {
  'вчера': -1, 'вчора': -1,
  'позавчера': -2, 'позавчора': -2,
};

const DATE_DD_MM_RE = /^(\d{1,2})[./](\d{1,2})\s+/;

function parseDate(text: string): { date: string; rest: string } {
  const today = new Date();

  // Check word-based dates: "вчера", "позавчера"
  for (const [word, offset] of Object.entries(DATE_WORDS)) {
    if (text.toLowerCase().startsWith(word)) {
      const rest = text.slice(word.length).trim();
      if (rest.length > 0) {
        const d = new Date(today);
        d.setDate(d.getDate() + offset);
        return { date: d.toISOString().slice(0, 10), rest };
      }
    }
  }

  // Check DD.MM format: "07.03 описание"
  const ddMmMatch = text.match(DATE_DD_MM_RE);
  if (ddMmMatch) {
    const day = parseInt(ddMmMatch[1], 10);
    const month = parseInt(ddMmMatch[2], 10);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      const year = today.getFullYear();
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      return { date: dateStr, rest: text.slice(ddMmMatch[0].length) };
    }
  }

  return { date: today.toISOString().slice(0, 10), rest: text };
}

// ─── Main handler ────────────────────────────────────────────────────────────

export async function tryCreateDraftTask(
  chatId: number,
  text: string,
  userId: string,
  db: PostgrestClient,
): Promise<boolean> {
  const hoursMatch = text.match(HOURS_RE);
  if (!hoursMatch) return false;

  // Extract hours
  const hoursRaw = parseFloat(hoursMatch[1].replace(',', '.'));
  if (isNaN(hoursRaw) || hoursRaw <= 0 || hoursRaw > 24) return false;
  const hours = Math.round(hoursRaw * 10) / 10;

  // Remove hours suffix from text
  const textWithoutHours = text.slice(0, hoursMatch.index).trim();
  if (textWithoutHours.length < 3) return false;

  // Parse optional date prefix
  const { date: taskDate, rest: description } = parseDate(textWithoutHours);
  if (description.length < 3) return false;

  try {
    const { error } = await db
      .from('daily_tasks')
      .insert({
        monthly_plan_id: null,
        user_id: userId,
        task_date: taskDate,
        description: description.slice(0, 500),
        spent_hours: hours,
      });

    if (error) throw error;

    const datePart = taskDate === new Date().toISOString().slice(0, 10)
      ? ''
      : `\n📅 ${taskDate.slice(8, 10)}.${taskDate.slice(5, 7)}`;

    const doneText = [
      '✅ <b>Чернетку створено</b>',
      '',
      `📝 ${esc(description)}`,
      `⏱ ${fmtH(hours)}${datePart}`,
      '',
      '📌 <i>Розберіть у планувальнику або натисніть ➕ для прив\'язки до плану</i>',
    ].join('\n');

    await sendMessage(chatId, doneText, 'HTML');
    logger.info(`[TG Bot] ${userId} created draft task: "${description.substring(0, 50)}" · ${hours}h`);

    return true;
  } catch (err) {
    logger.error('[TG Bot] Draft task creation error:', err);
    await sendMessage(chatId, '⚠️ Не вдалося створити чернетку. Спробуйте пізніше.');
    return true;
  }
}
