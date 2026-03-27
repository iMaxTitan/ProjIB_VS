/**
 * Transcript retrieval via OneDrive search.
 * Extracted from transcriptions-service.ts to keep the main service under 300 lines.
 */

import { GraphAuthService } from './auth-service';
import { logger } from '@/lib/shared/logger';

interface DriveItem {
  id: string;
  name?: string;
  createdDateTime?: string;
}

/**
 * Поиск транскрипта встречи в OneDrive пользователя (альтернативный способ).
 */
export async function findTranscriptInOneDrive(
  subject: string,
  meetingDate: Date,
  options: { accessToken?: string } = {},
): Promise<string | null> {
  try {
    const token = options.accessToken || await GraphAuthService.getAccessToken();
    if (!token) throw new Error('Нет accessToken для Graph API');

    const searchQuery = encodeURIComponent(subject || 'transcript');
    const resp = await fetch(
      `${GraphAuthService.apiBaseUrl}/me/drive/root/search(q='${searchQuery}')`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!resp.ok) {
      logger.error('Ошибка поиска файлов транскрипта в OneDrive:', await resp.text());
      return null;
    }
    const data = await resp.json();

    const files = ((data.value || []) as DriveItem[]).filter((item) =>
      (item.name?.toLowerCase().endsWith('.vtt') || item.name?.toLowerCase().endsWith('.txt')) &&
      Math.abs(new Date(item.createdDateTime || 0).getTime() - meetingDate.getTime()) < 1000 * 60 * 60 * 24
    );

    if (!files.length) {
      logger.warn('Файлы транскрипта не найдены в OneDrive по теме:', subject);
      return null;
    }

    const fileId = files[0].id;
    const fileResp = await fetch(
      `${GraphAuthService.apiBaseUrl}/me/drive/items/${fileId}/content`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!fileResp.ok) {
      logger.error('Ошибка скачивания файла транскрипта из OneDrive:', await fileResp.text());
      return null;
    }
    return await fileResp.text();
  } catch (e: unknown) {
    logger.error('Ошибка поиска транскрипта в OneDrive:', e);
    return null;
  }
}
