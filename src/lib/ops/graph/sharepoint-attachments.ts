/**
 * SharePoint task attachments and document text extraction.
 */

import { GraphAuthService } from './auth-service';
import { logger } from '@/lib/shared/logger';
import { SP_FOLDERS, SP_MONTH_NAMES_UK, SharePointUploadResult } from './sharepoint-types';
import { getSiteId, getDriveId, uploadFile } from './sharepoint-drive';

async function getSiteAndDriveIds(): Promise<{ siteId: string; driveId: string } | null> {
  const siteId = await getSiteId();
  if (!siteId) return null;
  const driveId = await getDriveId(siteId);
  if (!driveId) return null;
  return { siteId, driveId };
}

export async function uploadTaskAttachment(
  file: File,
  _documentNumber?: string,
  _taskId?: string,
  completedAt?: Date
): Promise<SharePointUploadResult> {
  try {
    const ids = await getSiteAndDriveIds();
    if (!ids) return { success: false, error: 'Не удалось получить ID сайту SharePoint або документной библиотеки' };
    const date = completedAt || new Date();
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const monthNum = month.toString().padStart(2, '0');
    const monthName = SP_MONTH_NAMES_UK[month - 1];
    const folderPath = `${SP_FOLDERS.TASK_ATTACHMENTS}/${year}/${monthNum}_${monthName}`;
    const content = await file.arrayBuffer();
    const contentType = file.type || 'application/octet-stream';
    logger.info(`[SharePoint] Загрузка вкладення: ${folderPath}/${file.name}`);
    return await uploadFile(ids.driveId, folderPath, file.name, content, contentType);
  } catch (error: unknown) {
    logger.error('[SharePoint] Ошибка загрузки вкладення:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Неизвестная ошибка' };
  }
}

export async function downloadFileContent(webUrl: string): Promise<ArrayBuffer | null> {
  try {
    const token = await GraphAuthService.getAccessToken();
    if (!token) return null;
    const ids = await getSiteAndDriveIds();
    if (!ids) return null;
    const urlObj = new URL(webUrl);
    const pathMatch = urlObj.pathname.match(/\/sites\/[^/]+\/Shared%20Documents\/(.+)/);
    if (!pathMatch) {
      logger.error('[SharePoint] Не удалось розпарсити URL:', webUrl);
      return null;
    }
    const filePath = decodeURIComponent(pathMatch[1]);
    const encodedPath = encodeURIComponent(filePath).replace(/%2F/g, '/');
    const response = await fetch(
      `${GraphAuthService.apiBaseUrl}/drives/${ids.driveId}/root:/${encodedPath}:/content`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!response.ok) {
      logger.error(`[SharePoint] Ошибка загрузки файлу: ${response.status}`);
      return null;
    }
    return await response.arrayBuffer();
  } catch (error: unknown) {
    logger.error('[SharePoint] Ошибка загрузки файлу:', error);
    return null;
  }
}

export async function extractTextFromDocx(content: ArrayBuffer): Promise<string> {
  try {
    logger.info('[SharePoint] Начало извлечения текста из DOCX, размер:', content.byteLength);
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(content);
    const files = Object.keys(zip.files);
    logger.info('[SharePoint] Файлы в архиве:', files.slice(0, 10));
    const documentXml = await zip.file('word/document.xml')?.async('string');
    if (!documentXml) {
      logger.error('[SharePoint] Не найдено word/document.xml в архиве');
      return '';
    }
    logger.info('[SharePoint] Размер document.xml:', documentXml.length);
    const paragraphMatches = documentXml.split(/<\/w:p>/);
    logger.info('[SharePoint] Найдено параграфов:', paragraphMatches.length);
    const result: string[] = [];
    for (const para of paragraphMatches) {
      const texts = para.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
      if (texts.length > 0) {
        const paraText = texts
          .map(t => t.replace(/<[^>]+>/g, '')
            .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"').replace(/&apos;/g, "'"))
          .join('');
        if (paraText.trim()) result.push(paraText.trim());
      }
    }
    const finalText = result.join('\n');
    logger.info('[SharePoint] Извлечено текста:', finalText.length, 'символов');
    logger.info('[SharePoint] Первые 200 символов:', finalText.substring(0, 200));
    return finalText;
  } catch (error: unknown) {
    logger.error('[SharePoint] Ошибка парсингу DOCX:', error);
    return '';
  }
}

export async function downloadAndExtractText(webUrl: string): Promise<string | null> {
  try {
    const content = await downloadFileContent(webUrl);
    if (!content) return null;
    if (!webUrl.toLowerCase().endsWith('.docx')) {
      logger.warn('[SharePoint] Файл не DOCX, возвращаем null');
      return null;
    }
    return await extractTextFromDocx(content);
  } catch (error: unknown) {
    logger.error('[SharePoint] Ошибка витягування тексту:', error);
    return null;
  }
}

export async function extractTextFromFile(file: File): Promise<string | null> {
  try {
    logger.info('[SharePoint] extractTextFromFile:', file.name, 'размер:', file.size);
    if (!file.name.toLowerCase().endsWith('.docx')) {
      logger.warn('[SharePoint] Файл не DOCX:', file.name);
      return null;
    }
    const content = await file.arrayBuffer();
    logger.info('[SharePoint] Прочитано ArrayBuffer:', content.byteLength, 'байт');
    const text = await extractTextFromDocx(content);
    logger.info('[SharePoint] Извлечено текста:', text?.length || 0, 'символов');
    return text || null;
  } catch (error: unknown) {
    logger.error('[SharePoint] Ошибка витягування тексту из файла:', error);
    return null;
  }
}
