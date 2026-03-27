/**
 * Telegram Bot API helpers.
 * Lightweight — only the methods we need.
 */

import { fetchWithTimeout } from '@/lib/shared/utils/fetch-with-timeout';
import logger from '@/lib/shared/logger';
import { config } from '@/lib/shared/config';

function getToken(): string {
  const token = config.telegram.botToken;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN not configured');
  return token;
}

function apiUrl(method: string): string {
  return `https://api.telegram.org/bot${getToken()}/${method}`;
}

export async function sendMessage(chatId: number, text: string, parseMode?: 'Markdown' | 'HTML'): Promise<void> {
  try {
    const body: Record<string, unknown> = { chat_id: chatId, text };
    if (parseMode) body.parse_mode = parseMode;

    const res = await fetchWithTimeout(apiUrl('sendMessage'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, 10_000);

    if (!res.ok) {
      const err = await res.text();
      logger.error(`[TG Bot] sendMessage failed: ${res.status} ${err}`);
    }
  } catch (err) {
    logger.error('[TG Bot] sendMessage error:', err);
  }
}

export type ReplyKeyboard = string[][];
export type InlineButton = {
  text: string;
  callback_data?: string;
  web_app?: { url: string };
};
export type InlineKeyboard = InlineButton[][];

export async function sendMessageWithInlineKeyboard(
  chatId: number,
  text: string,
  keyboard: InlineKeyboard,
  parseMode?: 'Markdown' | 'HTML',
): Promise<void> {
  try {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text,
      reply_markup: { inline_keyboard: keyboard },
    };
    if (parseMode) body.parse_mode = parseMode;

    const res = await fetchWithTimeout(apiUrl('sendMessage'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, 10_000);

    if (!res.ok) {
      const err = await res.text();
      logger.error(`[TG Bot] sendMessageWithInlineKeyboard failed: ${res.status} ${err}`);
    }
  } catch (err) {
    logger.error('[TG Bot] sendMessageWithInlineKeyboard error:', err);
  }
}

export async function answerCallbackQuery(callbackQueryId: string): Promise<void> {
  try {
    await fetchWithTimeout(apiUrl('answerCallbackQuery'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId }),
    }, 5_000);
  } catch {
    // Non-critical, ignore
  }
}

export async function sendMessageWithKeyboard(
  chatId: number,
  text: string,
  keyboard: ReplyKeyboard,
  parseMode?: 'Markdown' | 'HTML',
): Promise<void> {
  try {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text,
      reply_markup: {
        keyboard: keyboard.map(row => row.map(btn => ({ text: btn }))),
        resize_keyboard: true,
        is_persistent: true,
      },
    };
    if (parseMode) body.parse_mode = parseMode;

    const res = await fetchWithTimeout(apiUrl('sendMessage'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, 10_000);

    if (!res.ok) {
      const err = await res.text();
      logger.error(`[TG Bot] sendMessageWithKeyboard failed: ${res.status} ${err}`);
    }
  } catch (err) {
    logger.error('[TG Bot] sendMessageWithKeyboard error:', err);
  }
}

export async function sendChatAction(chatId: number, action: 'typing' = 'typing'): Promise<void> {
  try {
    await fetchWithTimeout(apiUrl('sendChatAction'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action }),
    }, 5_000);
  } catch {
    // Non-critical, ignore
  }
}

export async function sendDocument(
  chatId: number,
  fileBuffer: Buffer,
  filename: string,
  caption?: string,
): Promise<void> {
  try {
    const formData = new FormData();
    formData.append('chat_id', String(chatId));
    formData.append('document', new Blob([fileBuffer]), filename);
    if (caption) formData.append('caption', caption);

    const res = await fetchWithTimeout(apiUrl('sendDocument'), {
      method: 'POST',
      body: formData,
    }, 30_000);

    if (!res.ok) {
      const err = await res.text();
      logger.error(`[TG Bot] sendDocument failed: ${res.status} ${err}`);
    }
  } catch (err) {
    logger.error('[TG Bot] sendDocument error:', err);
  }
}

/** Download a file from Telegram by file_id. Returns Buffer + detected mime type. */
export async function downloadTelegramFile(fileId: string): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
  // Step 1: getFile → file_path
  const res = await fetchWithTimeout(apiUrl(`getFile?file_id=${fileId}`), {}, 10_000);
  const data = await res.json() as { ok: boolean; result?: { file_path?: string } };
  if (!data.ok || !data.result?.file_path) throw new Error('getFile failed: ' + JSON.stringify(data));

  const filePath = data.result.file_path;
  const downloadUrl = `https://api.telegram.org/file/bot${getToken()}/${filePath}`;

  // Step 2: download binary
  const fileRes = await fetchWithTimeout(downloadUrl, {}, 30_000);
  if (!fileRes.ok) throw new Error(`File download failed: ${fileRes.status}`);

  const arrayBuffer = await fileRes.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Detect mime type from extension
  const ext = filePath.split('.').pop()?.toLowerCase() ?? 'ogg';
  const mimeMap: Record<string, string> = {
    ogg: 'audio/ogg', mp3: 'audio/mpeg', mp4: 'audio/mp4',
    m4a: 'audio/mp4', wav: 'audio/wav', webm: 'audio/webm',
  };

  return {
    buffer,
    mimeType: mimeMap[ext] ?? 'audio/ogg',
    filename: `voice.${ext}`,
  };
}

/** Send message with inline keyboard, returns message_id on success (for later editing). */
export async function sendMessageWithInlineKeyboardReturn(
  chatId: number,
  text: string,
  keyboard: InlineKeyboard,
  parseMode?: 'HTML' | 'Markdown',
): Promise<number | null> {
  try {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text,
      reply_markup: { inline_keyboard: keyboard },
    };
    if (parseMode) body.parse_mode = parseMode;

    const res = await fetchWithTimeout(apiUrl('sendMessage'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, 10_000);

    if (!res.ok) {
      const err = await res.text();
      logger.error(`[TG Bot] sendMessageWithInlineKeyboardReturn failed: ${res.status} ${err}`);
      return null;
    }

    const data = await res.json() as { ok: boolean; result?: { message_id: number } };
    return data.result?.message_id ?? null;
  } catch (err) {
    logger.error('[TG Bot] sendMessageWithInlineKeyboardReturn error:', err);
    return null;
  }
}

/** Edit existing message text and replace its inline keyboard. Pass empty keyboard [] to remove buttons. */
export async function editMessageWithInlineKeyboard(
  chatId: number,
  messageId: number,
  text: string,
  keyboard: InlineKeyboard,
  parseMode?: 'HTML' | 'Markdown',
): Promise<void> {
  try {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      message_id: messageId,
      text,
      reply_markup: { inline_keyboard: keyboard },
    };
    if (parseMode) body.parse_mode = parseMode;

    const res = await fetchWithTimeout(apiUrl('editMessageText'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, 10_000);

    if (!res.ok) {
      const err = await res.text();
      logger.error(`[TG Bot] editMessageWithInlineKeyboard failed: ${res.status} ${err}`);
    }
  } catch (err) {
    logger.error('[TG Bot] editMessageWithInlineKeyboard error:', err);
  }
}

export async function setWebhook(url: string, secretToken: string): Promise<boolean> {
  const res = await fetchWithTimeout(apiUrl('setWebhook'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      secret_token: secretToken,
      allowed_updates: ['message', 'callback_query'],
      max_connections: 10,
    }),
  }, 15_000);

  const data = await res.json();
  if (!data.ok) {
    logger.error('[TG Bot] setWebhook failed:', data);
    return false;
  }
  return true;
}
