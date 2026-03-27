/**
 * Teams Bot API helpers.
 * Wraps TurnContext for sending messages and documents.
 * Note: Teams does not support inline file attachments (data: URIs),
 * so sendDocument() sends an HTML notice instead.
 *
 * Each message includes a persistent "Довідка" chip (suggestedActions)
 * visible in the top-right corner of the Teams chat.
 */

import type { TurnContext } from 'botbuilder';
import { MessageFactory } from 'botbuilder';
import logger from '@/lib/shared/logger';

// Persistent "Довідка" chip — appears in top-right corner of Teams personal chat.
const HELP_CHIP = { to: [], actions: [{ type: 'imBack' as const, title: 'ℹ️ Довідка', value: 'довідка' }] };

export async function sendMessage(
  turnContext: TurnContext,
  text: string,
): Promise<void> {
  try {
    const activity = MessageFactory.text(text);
    activity.suggestedActions = HELP_CHIP;
    await turnContext.sendActivity(activity);
  } catch (err) {
    logger.error('[Teams Bot] sendMessage error:', err);
  }
}

/**
 * Send HTML-formatted message via Teams textFormat='xml'.
 * Teams supports a subset of HTML: <b>, <i>, <br>, <ul>, <li>, <a> etc.
 * Converts \n → <br> so tool output renders correctly.
 */
export async function sendHtml(
  turnContext: TurnContext,
  html: string,
): Promise<void> {
  try {
    await turnContext.sendActivity({
      type: 'message',
      text: html.replace(/\n/g, '<br>'),
      textFormat: 'xml',
      suggestedActions: HELP_CHIP,
    });
  } catch (err) {
    logger.error('[Teams Bot] sendHtml error:', err);
  }
}

export async function sendDocument(
  turnContext: TurnContext,
  _buffer: Buffer,
  filename: string,
  caption?: string,
): Promise<void> {
  // Teams does not support inline base64 file attachments (data: URIs).
  // Send an HTML notice with a suggestion to use the web interface.
  const titleLine = caption ? `<b>${caption}</b>` : `<b>${filename}</b>`;
  const notice = `📄 ${titleLine}<br><br>⚠️ Teams не підтримує пряму передачу файлів у чаті. Завантажте документ через <b>веб-інтерфейс CS Platform</b>.`;

  try {
    await turnContext.sendActivity({
      type: 'message',
      text: notice,
      textFormat: 'xml',
      suggestedActions: HELP_CHIP,
    });
  } catch (err) {
    logger.error('[Teams Bot] sendDocument error:', err);
  }
}
