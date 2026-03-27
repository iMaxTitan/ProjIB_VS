/**
 * Task wizard session state.
 * In-memory Map<chatId, WizardState> with 10-minute TTL.
 * Independent of conversation memory.
 */

const WIZARD_TTL_MS = 10 * 60 * 1000;

export type WizardStep =
  | 'select_process'
  | 'select_plan'
  | 'input_description'
  | 'input_hours'
  | 'confirm';

export interface TaskWizardState {
  step: WizardStep;
  processId?: string;
  processName?: string;
  planId?: string;
  planTitle?: string;
  procedureName?: string;
  description?: string;
  hours?: number;
  wizardMessageId?: number;
  expiresAt: number;
}

const sessions = new Map<string, TaskWizardState>();

export function getWizardSession(chatId: number): TaskWizardState | null {
  const key = String(chatId);
  const session = sessions.get(key);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessions.delete(key);
    return null;
  }
  return session;
}

export function setWizardSession(
  chatId: number,
  patch: Partial<TaskWizardState> & { step: WizardStep },
): TaskWizardState {
  const existing = sessions.get(String(chatId)) ?? ({} as TaskWizardState);
  const updated: TaskWizardState = {
    ...existing,
    ...patch,
    expiresAt: Date.now() + WIZARD_TTL_MS,
  };
  sessions.set(String(chatId), updated);
  return updated;
}

export function clearWizardSession(chatId: number): void {
  sessions.delete(String(chatId));
}

export function isInWizard(chatId: number): boolean {
  return getWizardSession(chatId) !== null;
}
