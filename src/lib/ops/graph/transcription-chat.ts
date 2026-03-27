/**
 * Transcript retrieval via Teams meeting chat.
 * Extracted from transcriptions-service.ts to keep the main service under 300 lines.
 */

import { GraphAuthService } from './auth-service';
import { logger } from '@/lib/shared/logger';

interface FoundAttachment {
  name?: string;
  contentUrl?: string;
  msgId?: string;
  from: string;
  ts?: string;
}

/**
 * Получает текст транскрипции через чат встречи Teams (альтернативный способ).
 */
export async function getTranscriptFromMeetingChat(
  meetingChatId: string,
  options: { accessToken?: string } = {},
): Promise<string | null> {
  try {
    const token = options.accessToken || await GraphAuthService.getAccessToken();
    if (!token) throw new Error('Нет accessToken для Graph API');

    const messagesResp = await fetch(
      `${GraphAuthService.apiBaseUrl}/chats/${meetingChatId}/messages?$top=100`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!messagesResp.ok) {
      logger.error('Ошибка получения сообщений чата:', await messagesResp.text());
      return null;
    }
    const messagesData = await messagesResp.json();
    const messages = messagesData.value || [];
    logger.info(`[Транскрипт] Всего сообщений в чате:`, messages.length);

    const keywords = ['transcript', 'транскрипт', 'transcription'];
    const foundAttachments: FoundAttachment[] = [];

    for (const msg of messages) {
      if (!msg.attachments || !Array.isArray(msg.attachments)) continue;
      for (const att of msg.attachments) {
        const name = (att.name || att.contentUrl || '').toLowerCase();
        foundAttachments.push({
          name: att.name,
          contentUrl: att.contentUrl,
          msgId: msg.id,
          from: msg.from?.user?.displayName || msg.from?.application?.displayName || msg.from?.user?.id || 'unknown',
          ts: msg.createdDateTime
        });
        if ((name.endsWith('.txt') || name.endsWith('.vtt')) && keywords.some(k => name.includes(k))) {
          logger.info(`[Транскрипт] Найдено підходяще вкладення:`, att.name, att.contentUrl, 'в повідомленні:', msg.id);
          if (att.contentUrl) {
            const fileResp = await fetch(att.contentUrl, { headers: { Authorization: `Bearer ${token}` } });
            if (!fileResp.ok) {
              logger.error('Ошибка скачивания вложения из чата:', await fileResp.text());
              continue;
            }
            const text = await fileResp.text();
            logger.info('Транскрипт найден и скачан из чата:', att.name || att.contentUrl);
            return text;
          }
        }
      }
    }

    if (foundAttachments.length > 0) {
      logger.info(`[Транскрипт] Все найденные вложения в чате:`, foundAttachments);
    } else {
      logger.info(`[Транскрипт] В чате нет вложений в сообщениях.`);
    }
    logger.warn('Транскрипт не найден в чате (нет подходящих вложений).');
    return null;
  } catch (e: unknown) {
    logger.error('Ошибка поиска транскрипта в чате:', e);
    return null;
  }
}

/**
 * Получает все .vtt-вложения через чат встречи Teams (альтернативный способ).
 */
export async function findVttTranscriptsInMeetingChat(
  meetingChatId: string,
  options: { accessToken?: string } = {},
): Promise<Array<{ name: string; url: string; messageId: string; created: string }>> {
  try {
    const token = options.accessToken || await GraphAuthService.getAccessToken();
    if (!token) throw new Error('Нет accessToken для Graph API');

    const apiBase = GraphAuthService.apiBaseUrl;
    let url: string | null = `${apiBase}/chats/${meetingChatId}/messages?$top=50`;
    const foundVtt: Array<{ name: string; url: string; messageId: string; created: string }> = [];
    let totalMessages = 0;

    while (url) {
      const resp: Response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!resp.ok) {
        logger.error(`[Транскрипт][.vtt] Ошибка запроса сообщений чата:`, await resp.text());
        break;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await resp.json();
      const messages: unknown[] = data.value || [];
      totalMessages += messages.length;

      for (const rawMsg of messages) {
        const msg = rawMsg as { id: string; createdDateTime: string; attachments?: Array<{ name?: string; contentUrl?: string }> };
        if (msg.attachments && Array.isArray(msg.attachments)) {
          for (const att of msg.attachments) {
            const name = att.name || '';
            if (name.toLowerCase().endsWith('.vtt') && att.contentUrl) {
              foundVtt.push({ name, url: att.contentUrl, messageId: msg.id, created: msg.createdDateTime });
              logger.info(`[Транскрипт][.vtt] Найден файл:`, name, att.contentUrl, 'в сообщении:', msg.id);
            }
          }
        }
      }
      url = data['@odata.nextLink'] || null;
    }

    logger.info(`[Транскрипт][.vtt] Просмотрено сообщений: ${totalMessages}, найдено .vtt файлов: ${foundVtt.length}`);
    return foundVtt;
  } catch (e: unknown) {
    logger.error('[Транскрипт][.vtt] Ошибка поиска .vtt-файлов в чате:', e);
    return [];
  }
}
