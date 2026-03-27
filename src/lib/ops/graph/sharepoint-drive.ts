/**
 * Core SharePoint drive operations: site/drive ID resolution, folder management, file upload.
 */

import { GraphAuthService } from './auth-service';
import { logger } from '@/lib/shared/logger';
import {
  SP_SITE_HOST,
  SP_SITE_PATH,
  SharePointSite,
  SharePointDrive,
  SharePointDriveItem,
  SharePointUploadResult,
} from './sharepoint-types';

export async function getSiteId(): Promise<string | null> {
  try {
    const token = await GraphAuthService.getAccessToken();
    if (!token) {
      logger.error('[SharePoint] Отсутствует токен доступа');
      return null;
    }
    const response = await fetch(
      `${GraphAuthService.apiBaseUrl}/sites/${SP_SITE_HOST}:${SP_SITE_PATH}`,
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );
    if (!response.ok) {
      logger.error(`[SharePoint] Ошибка получения сайта: ${response.status}`, await response.text());
      return null;
    }
    const site: SharePointSite = await response.json();
    return site.id;
  } catch (error: unknown) {
    logger.error('[SharePoint] Ошибка при получении ID сайта:', error);
    return null;
  }
}

export async function getDriveId(siteId: string): Promise<string | null> {
  try {
    const token = await GraphAuthService.getAccessToken();
    if (!token) return null;
    const response = await fetch(
      `${GraphAuthService.apiBaseUrl}/sites/${siteId}/drive`,
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );
    if (!response.ok) {
      logger.error(`[SharePoint] Ошибка получения drive: ${response.status}`);
      return null;
    }
    const drive: SharePointDrive = await response.json();
    return drive.id;
  } catch (error: unknown) {
    logger.error('[SharePoint] Ошибка при получении drive:', error);
    return null;
  }
}

export async function ensureFolderExists(
  driveId: string,
  folderPath: string
): Promise<SharePointDriveItem | null> {
  try {
    const token = await GraphAuthService.getAccessToken();
    if (!token) return null;

    const encodedPath = encodeURIComponent(folderPath).replace(/%2F/g, '/');
    const checkResponse = await fetch(
      `${GraphAuthService.apiBaseUrl}/drives/${driveId}/root:/${encodedPath}`,
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );
    if (checkResponse.ok) return await checkResponse.json();

    const pathParts = folderPath.split('/');
    let currentPath = '';
    for (const part of pathParts) {
      if (!part) continue;
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const encodedCurrentPath = encodeURIComponent(currentPath).replace(/%2F/g, '/');
      const levelResponse = await fetch(
        `${GraphAuthService.apiBaseUrl}/drives/${driveId}/root:/${encodedCurrentPath}`,
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
      );
      if (!levelResponse.ok) {
        const parentPath = currentPath.includes('/')
          ? currentPath.substring(0, currentPath.lastIndexOf('/'))
          : '';
        const encodedParentPath = encodeURIComponent(parentPath).replace(/%2F/g, '/');
        const parentUrl = parentPath
          ? `${GraphAuthService.apiBaseUrl}/drives/${driveId}/root:/${encodedParentPath}:/children`
          : `${GraphAuthService.apiBaseUrl}/drives/${driveId}/root/children`;
        const createResponse = await fetch(parentUrl, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: part, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
        });
        if (!createResponse.ok && createResponse.status !== 409) {
          logger.error(`[SharePoint] Ошибка создания папки ${part}: ${createResponse.status}`);
          return null;
        }
      }
    }

    const finalEncodedPath = encodeURIComponent(folderPath).replace(/%2F/g, '/');
    const finalResponse = await fetch(
      `${GraphAuthService.apiBaseUrl}/drives/${driveId}/root:/${finalEncodedPath}`,
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );
    return finalResponse.ok ? await finalResponse.json() : null;
  } catch (error: unknown) {
    logger.error('[SharePoint] Ошибка при создании папки:', error);
    return null;
  }
}

async function uploadLargeFile(
  driveId: string,
  filePath: string,
  content: Buffer,
  token: string
): Promise<SharePointUploadResult> {
  const MAX_FILE_SIZE = 250 * 1024 * 1024;
  const CHUNK_SIZE = 10 * 1024 * 1024;
  if (content.length > MAX_FILE_SIZE) {
    return { success: false, error: `Файл слишком большой. Максимум: 250MB, ваш файл: ${(content.length / 1024 / 1024).toFixed(2)}MB` };
  }
  try {
    const encodedFilePath = encodeURIComponent(filePath).replace(/%2F/g, '/');
    const sessionResponse = await fetch(
      `${GraphAuthService.apiBaseUrl}/drives/${driveId}/root:/${encodedFilePath}:/createUploadSession`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'replace' } }),
      }
    );
    if (!sessionResponse.ok) {
      const errorText = await sessionResponse.text();
      return { success: false, error: `Ошибка создания сессии загрузки: ${sessionResponse.status} - ${errorText}` };
    }
    const session = await sessionResponse.json();
    const uploadUrl = session.uploadUrl;
    logger.info(`[SharePoint] Upload session создана, загружаем ${content.length} байт чанками по ${CHUNK_SIZE / 1024 / 1024}MB`);
    let offset = 0;
    let result: SharePointDriveItem | null = null;
    while (offset < content.length) {
      const chunkEnd = Math.min(offset + CHUNK_SIZE, content.length);
      const chunk = content.slice(offset, chunkEnd);
      const chunkResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Length': chunk.length.toString(), 'Content-Range': `bytes ${offset}-${chunkEnd - 1}/${content.length}` },
        body: chunk,
      });
      if (!chunkResponse.ok && chunkResponse.status !== 202) {
        const errorText = await chunkResponse.text();
        return { success: false, error: `Ошибка загрузки чанка: ${chunkResponse.status} - ${errorText}` };
      }
      const chunkResult = await chunkResponse.json();
      if (chunkResponse.status === 200 || chunkResponse.status === 201) result = chunkResult;
      offset = chunkEnd;
      logger.info(`[SharePoint] Загружено ${offset}/${content.length} байт (${Math.round(offset / content.length * 100)}%)`);
    }
    if (result) return { success: true, item: result, webUrl: result.webUrl };
    return { success: false, error: 'Загрузка завершена, но не получен результат' };
  } catch (error: unknown) {
    logger.error('[SharePoint] Ошибка upload session:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Ошибка upload session' };
  }
}

export async function uploadFile(
  driveId: string,
  folderPath: string,
  fileName: string,
  content: Buffer | ArrayBuffer,
  contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
): Promise<SharePointUploadResult> {
  try {
    const token = await GraphAuthService.getAccessToken();
    if (!token) return { success: false, error: 'Отсутствует токен доступа' };
    const folder = await ensureFolderExists(driveId, folderPath);
    if (!folder) return { success: false, error: 'Не удалось создать папку' };
    const filePath = `${folderPath}/${fileName}`;
    const encodedFilePath = encodeURIComponent(filePath).replace(/%2F/g, '/');
    const contentBuffer = Buffer.isBuffer(content) ? content : Buffer.from(new Uint8Array(content));
    if (contentBuffer.length < 4 * 1024 * 1024) {
      const response = await fetch(
        `${GraphAuthService.apiBaseUrl}/drives/${driveId}/root:/${encodedFilePath}:/content`,
        { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType }, body: contentBuffer }
      );
      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: `Ошибка загрузки: ${response.status} - ${errorText}` };
      }
      const item: SharePointDriveItem = await response.json();
      return { success: true, item, webUrl: item.webUrl };
    }
    logger.info(`[SharePoint] Файл ${fileName} больше 4MB (${(contentBuffer.length / 1024 / 1024).toFixed(2)}MB), используем upload session`);
    return await uploadLargeFile(driveId, filePath, contentBuffer, token);
  } catch (error: unknown) {
    logger.error('[SharePoint] Ошибка при загрузке файла:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Неизвестная ошибка' };
  }
}

export async function listFiles(driveId: string, folderPath: string): Promise<SharePointDriveItem[]> {
  try {
    const token = await GraphAuthService.getAccessToken();
    if (!token) return [];
    const encodedPath = encodeURIComponent(folderPath).replace(/%2F/g, '/');
    const response = await fetch(
      `${GraphAuthService.apiBaseUrl}/drives/${driveId}/root:/${encodedPath}:/children`,
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );
    if (!response.ok) return [];
    const data = await response.json();
    return data.value || [];
  } catch (error: unknown) {
    logger.error('[SharePoint] Ошибка при получении списка файлов:', error);
    return [];
  }
}

export async function testConnection(): Promise<{ success: boolean; siteId?: string; error?: string }> {
  try {
    const siteId = await getSiteId();
    if (!siteId) return { success: false, error: 'Не удалось получить ID сайта' };
    const driveId = await getDriveId(siteId);
    if (!driveId) return { success: false, error: 'Не удалось получить ID документной библиотеки' };
    return { success: true, siteId };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'Неизвестная ошибка' };
  }
}
