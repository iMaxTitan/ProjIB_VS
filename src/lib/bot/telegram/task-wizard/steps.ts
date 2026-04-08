/**
 * Task creation wizard — step handlers.
 *
 * Entry points (called from webhook/route.ts):
 *   handleTaskWizardCallback(chatId, callbackData, userId, db)
 *   handleWizardTextInput(chatId, text, userId, db) → boolean (consumed?)
 */

import type { PostgrestClient } from '@/lib/shared/postgrest-client';
import { getWizardSession, setWizardSession, clearWizardSession } from './session';
import { getActivePlansForWizard, findPlanInProcesses, type WizardProcess } from './queries';
import {
  sendMessage,
  sendMessageWithInlineKeyboardReturn,
  editMessageWithInlineKeyboard,
  type InlineKeyboard,
} from '@/lib/bot/telegram/bot';
import { esc } from '@/lib/bot/shared/format-helpers';
import logger from '@/lib/shared/logger';
import {
  trunc, fmtH, CANCEL_ROW, editOrSend,
  showPlanSelection, showDescriptionOptions, showHoursPrompt, showConfirmation,
} from './step-helpers';

// ─── Step: Start ──────────────────────────────────────────────────────────────

export async function handleTaskStart(
  chatId: number,
  userId: string,
  db: PostgrestClient,
): Promise<void> {
  let processes: WizardProcess[];
  try {
    processes = await getActivePlansForWizard(db, userId);
  } catch (err) {
    logger.error('[TaskWizard] load plans error:', err);
    await sendMessage(chatId, '⚠️ Не вдалося завантажити плани. Спробуйте пізніше.');
    return;
  }

  if (processes.length === 0) {
    const now = new Date();
    const MONTHS = ['січня','лютого','березня','квітня','травня','червня',
                    'липня','серпня','вересня','жовтня','листопада','грудня'];
    const text = [
      `📋 У вас немає активних планів на ${MONTHS[now.getMonth()]} ${now.getFullYear()}.`,
      '',
      '💡 Ви можете створити <b>чернетку</b> — просто напишіть:',
      '<code>аудит сервера 2ч</code>',
      '',
      'Чернетку потім можна привʼязати до плану в кабінеті.',
    ].join('\n');
    await sendMessage(chatId, text, 'HTML');
    return;
  }

  if (processes.length === 1) {
    await showPlanSelection(chatId, processes[0], undefined);
    return;
  }

  const keyboard: InlineKeyboard = processes.map(p => [
    { text: trunc(p.processName, 35), callback_data: `task:process:${p.processId}` },
  ]);
  keyboard.push(CANCEL_ROW);

  const msgId = await sendMessageWithInlineKeyboardReturn(
    chatId,
    '➕ <b>Нова задача</b>\n\nОберіть напрямок роботи:',
    keyboard,
    'HTML',
  );

  setWizardSession(chatId, { step: 'select_process', wizardMessageId: msgId ?? undefined });
}

// ─── Step: Select process ─────────────────────────────────────────────────────

export async function handleSelectProcess(
  chatId: number,
  processId: string,
  userId: string,
  db: PostgrestClient,
): Promise<void> {
  const session = getWizardSession(chatId);
  let processes: WizardProcess[];
  try {
    processes = await getActivePlansForWizard(db, userId);
  } catch (err) {
    logger.error('[TaskWizard] load plans error:', err);
    await sendMessage(chatId, '⚠️ Не вдалося завантажити плани. Спробуйте пізніше.');
    clearWizardSession(chatId);
    return;
  }

  const proc = processes.find(p => p.processId === processId);
  if (!proc) {
    await sendMessage(chatId, '⚠️ Процес не знайдено. Спробуйте знову.');
    clearWizardSession(chatId);
    return;
  }

  await showPlanSelection(chatId, proc, session?.wizardMessageId);
}

// ─── Step: Select plan ────────────────────────────────────────────────────────

export async function handleSelectPlan(
  chatId: number,
  planId: string,
  userId: string,
  db: PostgrestClient,
): Promise<void> {
  const session = getWizardSession(chatId);
  let processes: WizardProcess[];
  try {
    processes = await getActivePlansForWizard(db, userId);
  } catch (err) {
    logger.error('[TaskWizard] load plans error:', err);
    await sendMessage(chatId, '⚠️ Не вдалося завантажити плани. Спробуйте пізніше.');
    clearWizardSession(chatId);
    return;
  }

  const plan = findPlanInProcesses(processes, planId);
  if (!plan) {
    await sendMessage(chatId, '⚠️ План не знайдено. Спробуйте знову.');
    clearWizardSession(chatId);
    return;
  }

  const proc: WizardProcess = {
    processId: plan.processId,
    processName: plan.processName,
    plans: [plan],
  };

  const msgId = await showDescriptionOptions(chatId, planId, session?.wizardMessageId, proc);
  setWizardSession(chatId, {
    step: 'input_description',
    processId: plan.processId,
    processName: plan.processName,
    planId,
    planTitle: plan.displayTitle,
    procedureName: plan.procedureName,
    wizardMessageId: msgId ?? session?.wizardMessageId,
  });
}

// ─── Step: Description — template ─────────────────────────────────────────────

export async function handleDescTemplate(chatId: number): Promise<void> {
  const session = getWizardSession(chatId);
  if (!session?.planId) {
    await sendMessage(chatId, '⚠️ Сесію втрачено. Натисніть ℹ️ Довідка і почніть знову.');
    clearWizardSession(chatId);
    return;
  }

  const description = session.planTitle || session.procedureName || 'Задача';
  setWizardSession(chatId, { step: 'input_hours', description });
  await showHoursPrompt(chatId, session.wizardMessageId, session.procedureName ?? '', description);
}

// ─── Step: Description — custom ───────────────────────────────────────────────

export async function handleDescCustom(chatId: number): Promise<void> {
  const session = getWizardSession(chatId);
  if (!session?.planId) {
    await sendMessage(chatId, '⚠️ Сесію втрачено. Натисніть ℹ️ Довідка і почніть знову.');
    clearWizardSession(chatId);
    return;
  }

  setWizardSession(chatId, { step: 'input_description' });

  const text = `➕ <b>Нова задача</b>\n📋 ${esc(session.procedureName ?? '')}\n\n✏️ Введіть опис задачі:`;
  await editOrSend(chatId, session.wizardMessageId, text, [CANCEL_ROW]);
}

// ─── Text input handler ───────────────────────────────────────────────────────

/** Returns true if the text was consumed by the wizard (caller should skip further processing). */
export async function handleWizardTextInput(
  chatId: number,
  text: string,
  _userId: string,
  _db: PostgrestClient,
): Promise<boolean> {
  const session = getWizardSession(chatId);
  if (!session) return false;

  if (session.step === 'input_description') {
    const desc = text.trim();
    if (desc.length < 3) {
      await sendMessage(chatId, '⚠️ Опис занадто короткий. Мінімум 3 символи.');
      return true;
    }
    if (desc.length > 500) {
      await sendMessage(chatId, '⚠️ Опис занадто довгий. Максимум 500 символів.');
      return true;
    }
    setWizardSession(chatId, { step: 'input_hours', description: desc });
    await showHoursPrompt(chatId, session.wizardMessageId, session.procedureName ?? '', desc);
    return true;
  }

  if (session.step === 'input_hours') {
    const hours = parseFloat(text.trim().replace(',', '.'));
    if (isNaN(hours) || hours <= 0 || hours > 24) {
      await sendMessage(chatId, '⚠️ Введіть число від 0.5 до 24. Наприклад: 3 або 1.5');
      return true;
    }
    const rounded = Math.round(hours * 10) / 10;
    setWizardSession(chatId, { step: 'confirm', hours: rounded });
    await showConfirmation(
      chatId,
      session.wizardMessageId,
      session.procedureName ?? '',
      session.description ?? '',
      rounded,
    );
    return true;
  }

  return false;
}

// ─── Confirm: save to DB ──────────────────────────────────────────────────────

export async function handleConfirm(
  chatId: number,
  userId: string,
  db: PostgrestClient,
): Promise<void> {
  const session = getWizardSession(chatId);
  if (!session?.planId || !session.description || session.hours === undefined) {
    await sendMessage(chatId, '⚠️ Сесію втрачено. Натисніть ℹ️ Довідка і почніть знову.');
    clearWizardSession(chatId);
    return;
  }

  const taskDate = new Date().toISOString().slice(0, 10);

  try {
    // Insert task and get ID back
    const { data: inserted, error } = await db
      .from('daily_tasks')
      .insert({
        monthly_plan_id: session.planId,
        user_id: userId,
        task_date: taskDate,
        description: session.description,
        spent_hours: session.hours,
      })
      .select('daily_task_id')
      .single();

    if (error) throw error;

    // Copy companies from plan → task
    if (inserted?.daily_task_id) {
      const { data: planCompanies } = await db
        .from('monthly_plan_companies')
        .select('company_id')
        .eq('monthly_plan_id', session.planId);

      const companyIds = (planCompanies || []).map(c => c.company_id);
      if (companyIds.length > 0) {
        await db.from('daily_task_companies').insert(
          companyIds.map(id => ({ daily_task_id: inserted.daily_task_id, company_id: id })),
        );
      }
    }

    clearWizardSession(chatId);

    const doneText = [
      '✅ <b>Задачу додано!</b>',
      '',
      `📋 ${esc(session.procedureName ?? '')}`,
      `📝 ${esc(session.description)}`,
      `⏱ ${fmtH(session.hours)}`,
    ].join('\n');

    if (session.wizardMessageId) {
      await editMessageWithInlineKeyboard(chatId, session.wizardMessageId, doneText, [], 'HTML');
    } else {
      await sendMessage(chatId, doneText, 'HTML');
    }

    logger.info(`[TaskWizard] ${userId} added task → plan ${session.planId} · ${session.hours}h`);
  } catch (err) {
    logger.error('[TaskWizard] insert error:', err);
    await sendMessage(chatId, '⚠️ Не вдалося зберегти задачу. Можливо, план більше не активний.');
    clearWizardSession(chatId);
  }
}

// ─── Cancel ───────────────────────────────────────────────────────────────────

export async function handleCancel(chatId: number): Promise<void> {
  const session = getWizardSession(chatId);
  clearWizardSession(chatId);

  const text = '❌ Додавання задачі скасовано.';
  if (session?.wizardMessageId) {
    await editMessageWithInlineKeyboard(chatId, session.wizardMessageId, text, [], 'HTML');
  } else {
    await sendMessage(chatId, text);
  }
}

// ─── Main callback dispatcher ─────────────────────────────────────────────────

export async function handleTaskWizardCallback(
  chatId: number,
  data: string,
  userId: string,
  db: PostgrestClient,
): Promise<void> {
  if (data === 'task:start') {
    await handleTaskStart(chatId, userId, db);
    return;
  }

  if (data.startsWith('task:process:')) {
    const processId = data.slice('task:process:'.length);
    await handleSelectProcess(chatId, processId, userId, db);
    return;
  }

  if (data.startsWith('task:plan:')) {
    const planId = data.slice('task:plan:'.length);
    await handleSelectPlan(chatId, planId, userId, db);
    return;
  }

  if (data === 'task:desc:template') {
    await handleDescTemplate(chatId);
    return;
  }

  if (data === 'task:desc:custom') {
    await handleDescCustom(chatId);
    return;
  }

  if (data === 'task:confirm') {
    await handleConfirm(chatId, userId, db);
    return;
  }

  if (data === 'task:cancel') {
    await handleCancel(chatId);
    return;
  }
}
