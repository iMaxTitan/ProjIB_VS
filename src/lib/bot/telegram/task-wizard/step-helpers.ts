/**
 * Task wizard — private UI helpers and render functions.
 * Extracted from steps.ts to keep the main handler file under 300 lines.
 */

import {
  sendMessageWithInlineKeyboardReturn,
  editMessageWithInlineKeyboard,
  type InlineKeyboard,
} from '@/lib/bot/telegram/bot';
import { esc } from '@/lib/bot/shared/format-helpers';
import type { WizardProcess } from './queries';
import { setWizardSession } from './session';

// ─── Formatting helpers ────────────────────────────────────────────────────────

export function trunc(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

export function fmtH(h: number): string {
  return Number.isInteger(h) ? `${h}г` : `${h.toFixed(1)}г`;
}

export const CANCEL_ROW: InlineKeyboard[number] = [
  { text: '❌ Скасувати', callback_data: 'task:cancel' },
];

export async function editOrSend(
  chatId: number,
  msgId: number | undefined,
  text: string,
  keyboard: InlineKeyboard,
): Promise<number | undefined> {
  if (msgId) {
    await editMessageWithInlineKeyboard(chatId, msgId, text, keyboard, 'HTML');
    return msgId;
  }
  const newId = await sendMessageWithInlineKeyboardReturn(chatId, text, keyboard, 'HTML');
  return newId ?? undefined;
}

// ─── Step render functions ─────────────────────────────────────────────────────

export async function showPlanSelection(
  chatId: number,
  proc: WizardProcess,
  wizardMessageId: number | undefined,
): Promise<void> {
  if (proc.plans.length === 1) {
    const newMsgId = await showDescriptionOptions(chatId, proc.plans[0].monthlyPlanId, wizardMessageId, proc);
    setWizardSession(chatId, {
      step: 'input_description',
      processId: proc.processId,
      processName: proc.processName,
      planId: proc.plans[0].monthlyPlanId,
      planTitle: proc.plans[0].displayTitle,
      procedureName: proc.plans[0].procedureName,
      wizardMessageId: newMsgId ?? wizardMessageId,
    });
    return;
  }

  const keyboard: InlineKeyboard = proc.plans.map(p => [
    {
      text: `${trunc(p.procedureName, 28)} · ${fmtH(p.spentHours)}/${fmtH(p.plannedHours)}`,
      callback_data: `task:plan:${p.monthlyPlanId}`,
    },
  ]);
  keyboard.push(CANCEL_ROW);

  const text = `➕ <b>Нова задача</b>\n📂 ${esc(proc.processName)}\n\nОберіть план:`;
  const msgId = await editOrSend(chatId, wizardMessageId, text, keyboard);

  setWizardSession(chatId, {
    step: 'select_plan',
    processId: proc.processId,
    processName: proc.processName,
    wizardMessageId: msgId,
  });
}

export async function showDescriptionOptions(
  chatId: number,
  planId: string,
  wizardMessageId: number | undefined,
  proc: WizardProcess,
): Promise<number | undefined> {
  const plan = proc.plans.find(p => p.monthlyPlanId === planId) ?? proc.plans[0];
  const template = trunc(plan.displayTitle, 40);

  const keyboard: InlineKeyboard = [
    [{ text: `📝 «${template}»`, callback_data: 'task:desc:template' }],
    [{ text: '✏️ Написати своє', callback_data: 'task:desc:custom' }],
    CANCEL_ROW,
  ];

  const text = `➕ <b>Нова задача</b>\n📋 ${esc(plan.procedureName)}\n\nОберіть опис задачі:`;
  return await editOrSend(chatId, wizardMessageId, text, keyboard);
}

export async function showHoursPrompt(
  chatId: number,
  wizardMessageId: number | undefined,
  procedureName: string,
  description: string,
): Promise<void> {
  const text = `➕ <b>Нова задача</b>\n📋 ${esc(procedureName)}\n📝 ${esc(description)}\n\n⏱ Скільки годин витрачено? (напр. 3 або 1.5)`;
  await editOrSend(chatId, wizardMessageId, text, [CANCEL_ROW]);
}

export async function showConfirmation(
  chatId: number,
  wizardMessageId: number | undefined,
  procedureName: string,
  description: string,
  hours: number,
): Promise<void> {
  const now = new Date();
  const dateStr = now.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const text = [
    '➕ <b>Підтвердження задачі</b>',
    '',
    `📅 <b>Дата:</b> ${dateStr}`,
    `📋 <b>Процедура:</b> ${esc(procedureName)}`,
    `📝 <b>Опис:</b> ${esc(description)}`,
    `⏱ <b>Годин:</b> ${fmtH(hours)}`,
  ].join('\n');

  const keyboard: InlineKeyboard = [
    [
      { text: '✅ Підтвердити', callback_data: 'task:confirm' },
      { text: '❌ Скасувати', callback_data: 'task:cancel' },
    ],
  ];

  await editOrSend(chatId, wizardMessageId, text, keyboard);
}
