import { GraphAuthService } from './auth-service';
import { logger } from '@/lib/logger';

/**
 * Типы для SharePoint API
 */
export interface SharePointSite {
  id: string;
  name: string;
  webUrl: string;
  displayName: string;
}

export interface SharePointDrive {
  id: string;
  name: string;
  driveType: string;
  webUrl: string;
}

export interface SharePointDriveItem {
  id: string;
  name: string;
  webUrl: string;
  folder?: { childCount: number };
  file?: { mimeType: string };
  size?: number;
  createdDateTime?: string;
  lastModifiedDateTime?: string;
}

export interface SharePointUploadResult {
  success: boolean;
  item?: SharePointDriveItem;
  error?: string;
  webUrl?: string;
}

/**
 * Сервис для работы с SharePoint через Microsoft Graph API.
 * Предоставляет методы для загрузки файлов в документную библиотеку SharePoint.
 */
export class GraphSharePointService {
  /**
   * Конфигурация SharePoint сайта
   */
  private static readonly SITE_HOST = 'atbmarket.sharepoint.com';
  private static readonly SITE_PATH = '/sites/msteams_430b06';

  /**
   * Корневая папка проекта ProjIB в SharePoint
   */
  private static readonly PROJIB_ROOT = 'General/Proj-IB';

  /**
   * Структура папок Proj-IB:
   * General/Proj-IB/
   * ├── Шаблони/                    - шаблони отчетов .docx
   * ├── Звіти/
   * │   ├── По підприємствах/       - щомісячні акти по компаніях
   * │   │   └── 2026/
   * │   │       ├── 01_Січень/
   * │   │       │   ├── АТБ Маркет/
   * │   │       │   └── ...
   * │   │       └── ...
   * │   ├── По співробітниках/      - ежемесячные отчеты по сотрудникам
   * │   │   └── 2026/
   * │   │       └── 01_Січень/
   * │   └── Квартальні/             - квартальные отчеты
   * │       └── 2026/
   * │           └── Q1/
   * └── Архів/                      - архів старих отчетов
   */
  static readonly FOLDERS = {
    TEMPLATES: 'General/Proj-IB/Шаблони',
    REPORTS_COMPANY: 'General/Proj-IB/Звіти/По підприємствах',
    REPORTS_EMPLOYEE: 'General/Proj-IB/Звіти/По співробітниках',
    REPORTS_QUARTERLY: 'General/Proj-IB/Звіти/Квартальні',
    ARCHIVE: 'General/Proj-IB/Архів',
    TASK_ATTACHMENTS: 'General/Proj-IB/Завдання',
  };

  // Legacy path для совместимости
  private static readonly REPORTS_ROOT = 'General/Proj-IB/Звіти/По підприємствах';

  /**
   * Названия месяцев для формирования имен файлов
   */
  private static readonly MONTH_NAMES = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
  ];

  /**
   * Получает ID SharePoint сайта по hostname и path
   */
  static async getSiteId(): Promise<string | null> {
    try {
      const token = await GraphAuthService.getAccessToken();
      if (!token) {
        logger.error('[SharePoint] Отсутствует токен доступа');
        return null;
      }

      const response = await fetch(
        `${GraphAuthService.apiBaseUrl}/sites/${this.SITE_HOST}:${this.SITE_PATH}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`[SharePoint] Ошибка получения сайта: ${response.status}`, errorText);
        return null;
      }

      const site: SharePointSite = await response.json();
      return site.id;
    } catch (error: unknown) {
      logger.error('[SharePoint] Ошибка при получении ID сайта:', error);
      return null;
    }
  }

  /**
   * Получает ID документной библиотеки (drive) для сайта
   */
  static async getDriveId(siteId: string): Promise<string | null> {
    try {
      const token = await GraphAuthService.getAccessToken();
      if (!token) return null;

      const response = await fetch(
        `${GraphAuthService.apiBaseUrl}/sites/${siteId}/drive`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
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

  /**
   * Проверяет существование папки, создаёт если нет
   * @param driveId ID документной библиотеки
   * @param folderPath Путь к папке (например: "Reports/2026")
   */
  static async ensureFolderExists(
    driveId: string,
    folderPath: string
  ): Promise<SharePointDriveItem | null> {
    try {
      const token = await GraphAuthService.getAccessToken();
      if (!token) return null;

      // Сначала пробуем получить папку
      const encodedPath = encodeURIComponent(folderPath).replace(/%2F/g, '/');
      const checkResponse = await fetch(
        `${GraphAuthService.apiBaseUrl}/drives/${driveId}/root:/${encodedPath}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (checkResponse.ok) {
        return await checkResponse.json();
      }

      // Папка не существует - создаём рекурсивно
      const pathParts = folderPath.split('/');
      let currentPath = '';

      for (const part of pathParts) {
        if (!part) continue;

        currentPath = currentPath ? `${currentPath}/${part}` : part;
        const encodedCurrentPath = encodeURIComponent(currentPath).replace(/%2F/g, '/');

        // Проверяем каждый уровень
        const levelResponse = await fetch(
          `${GraphAuthService.apiBaseUrl}/drives/${driveId}/root:/${encodedCurrentPath}`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (!levelResponse.ok) {
          // Создаём папку на этом уровне
          const parentPath = currentPath.includes('/')
            ? currentPath.substring(0, currentPath.lastIndexOf('/'))
            : '';

          const encodedParentPath = encodeURIComponent(parentPath).replace(/%2F/g, '/');
          const parentUrl = parentPath
            ? `${GraphAuthService.apiBaseUrl}/drives/${driveId}/root:/${encodedParentPath}:/children`
            : `${GraphAuthService.apiBaseUrl}/drives/${driveId}/root/children`;

          const createResponse = await fetch(parentUrl, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name: part,
              folder: {},
              '@microsoft.graph.conflictBehavior': 'fail'
            }),
          });

          if (!createResponse.ok && createResponse.status !== 409) {
            logger.error(`[SharePoint] Ошибка создания папки ${part}: ${createResponse.status}`);
            return null;
          }
        }
      }

      // Возвращаем созданную папку
      const finalEncodedPath = encodeURIComponent(folderPath).replace(/%2F/g, '/');
      const finalResponse = await fetch(
        `${GraphAuthService.apiBaseUrl}/drives/${driveId}/root:/${finalEncodedPath}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return finalResponse.ok ? await finalResponse.json() : null;
    } catch (error: unknown) {
      logger.error('[SharePoint] Ошибка при создании папки:', error);
      return null;
    }
  }

  /**
   * Загружает файл в SharePoint
   * @param driveId ID документной библиотеки
   * @param folderPath Путь к папке
   * @param fileName Имя файла
   * @param content Содержимое файла (Buffer или ArrayBuffer)
   * @param contentType MIME тип файла
   */
  static async uploadFile(
    driveId: string,
    folderPath: string,
    fileName: string,
    content: Buffer | ArrayBuffer,
    contentType: string = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ): Promise<SharePointUploadResult> {
    try {
      const token = await GraphAuthService.getAccessToken();
      if (!token) {
        return { success: false, error: 'Отсутствует токен доступа' };
      }

      // Убеждаемся что папка существует
      const folder = await this.ensureFolderExists(driveId, folderPath);
      if (!folder) {
        return { success: false, error: 'Не удалось создать папку' };
      }

      const filePath = `${folderPath}/${fileName}`;
      const encodedFilePath = encodeURIComponent(filePath).replace(/%2F/g, '/');

      // Проверяем размер - для файлов < 4MB используем простой upload
      const contentBuffer = Buffer.isBuffer(content) ? content : Buffer.from(new Uint8Array(content));

      if (contentBuffer.length < 4 * 1024 * 1024) {
        const response = await fetch(
          `${GraphAuthService.apiBaseUrl}/drives/${driveId}/root:/${encodedFilePath}:/content`,
          {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': contentType,
            },
            body: contentBuffer,
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          return { success: false, error: `Ошибка загрузки: ${response.status} - ${errorText}` };
        }

        const item: SharePointDriveItem = await response.json();
        return {
          success: true,
          item,
          webUrl: item.webUrl
        };
      }

      // Для больших файлов (4MB - 250MB) используем upload session
      logger.info(`[SharePoint] Файл ${fileName} больше 4MB (${(contentBuffer.length / 1024 / 1024).toFixed(2)}MB), используем upload session`);
      return await this.uploadLargeFile(driveId, filePath, contentBuffer, token);
    } catch (error: unknown) {
      logger.error('[SharePoint] Ошибка при загрузке файла:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка'
      };
    }
  }

  /**
   * Загружает большой файл через upload session (для файлов 4MB - 250MB)
   * Microsoft Graph API поддерживает resumable upload с чанками
   */
  private static async uploadLargeFile(
    driveId: string,
    filePath: string,
    content: Buffer,
    token: string
  ): Promise<SharePointUploadResult> {
    const MAX_FILE_SIZE = 250 * 1024 * 1024; // 250MB лимит SharePoint
    const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB чанки (должен быть кратен 320KB)

    if (content.length > MAX_FILE_SIZE) {
      return { success: false, error: `Файл слишком большой. Максимум: 250MB, ваш файл: ${(content.length / 1024 / 1024).toFixed(2)}MB` };
    }

    try {
      const encodedFilePath = encodeURIComponent(filePath).replace(/%2F/g, '/');

      // Шаг 1: Создаём upload session
      const sessionResponse = await fetch(
        `${GraphAuthService.apiBaseUrl}/drives/${driveId}/root:/${encodedFilePath}:/createUploadSession`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            item: {
              '@microsoft.graph.conflictBehavior': 'replace'
            }
          }),
        }
      );

      if (!sessionResponse.ok) {
        const errorText = await sessionResponse.text();
        return { success: false, error: `Ошибка создания сессии загрузки: ${sessionResponse.status} - ${errorText}` };
      }

      const session = await sessionResponse.json();
      const uploadUrl = session.uploadUrl;

      logger.info(`[SharePoint] Upload session создана, загружаем ${content.length} байт чанками по ${CHUNK_SIZE / 1024 / 1024}MB`);

      // Шаг 2: Загружаем файл чанками
      let offset = 0;
      let result: SharePointDriveItem | null = null;

      while (offset < content.length) {
        const chunkEnd = Math.min(offset + CHUNK_SIZE, content.length);
        const chunk = content.slice(offset, chunkEnd);

        const chunkResponse = await fetch(uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Length': chunk.length.toString(),
            'Content-Range': `bytes ${offset}-${chunkEnd - 1}/${content.length}`,
          },
          body: chunk,
        });

        if (!chunkResponse.ok && chunkResponse.status !== 202) {
          const errorText = await chunkResponse.text();
          return { success: false, error: `Ошибка загрузки чанка: ${chunkResponse.status} - ${errorText}` };
        }

        const chunkResult = await chunkResponse.json();

        // Последний чанк возвращает DriveItem
        if (chunkResponse.status === 200 || chunkResponse.status === 201) {
          result = chunkResult;
        }

        offset = chunkEnd;
        logger.info(`[SharePoint] Загружено ${offset}/${content.length} байт (${Math.round(offset / content.length * 100)}%)`);
      }

      if (result) {
        return {
          success: true,
          item: result,
          webUrl: result.webUrl
        };
      }

      return { success: false, error: 'Загрузка завершена, но не получен результат' };
    } catch (error: unknown) {
      logger.error('[SharePoint] Ошибка upload session:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Ошибка upload session'
      };
    }
  }

  /**
   * Получает список файлов в папке
   */
  static async listFiles(
    driveId: string,
    folderPath: string
  ): Promise<SharePointDriveItem[]> {
    try {
      const token = await GraphAuthService.getAccessToken();
      if (!token) return [];

      const encodedPath = encodeURIComponent(folderPath).replace(/%2F/g, '/');
      const response = await fetch(
        `${GraphAuthService.apiBaseUrl}/drives/${driveId}/root:/${encodedPath}:/children`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) return [];

      const data = await response.json();
      return data.value || [];
    } catch (error: unknown) {
      logger.error('[SharePoint] Ошибка при получении списка файлов:', error);
      return [];
    }
  }

  /**
   * Высокоуровневый метод для загрузки ежемесячного отчета.
   * Автоматически определяет путь и имя файла на основе параметров.
   *
   * @param year Год отчета
   * @param month Месяц отчета (1-12)
   * @param departmentCode Код отдела для имени файла
   * @param content Содержимое Excel файла
   */
  static async uploadMonthlyReport(
    year: number,
    month: number,
    departmentCode: string,
    content: Buffer | ArrayBuffer
  ): Promise<SharePointUploadResult> {
    try {
      const siteId = await this.getSiteId();
      if (!siteId) {
        return { success: false, error: 'Не удалось получить ID сайта SharePoint' };
      }

      const driveId = await this.getDriveId(siteId);
      if (!driveId) {
        return { success: false, error: 'Не удалось получить ID документной библиотеки' };
      }

      const monthName = this.MONTH_NAMES[month - 1];
      const folderPath = `${this.REPORTS_ROOT}/${year}`;
      const fileName = `Отчет_${departmentCode}_${monthName}_${year}.xlsx`;

      logger.info(`[SharePoint] Загрузка отчета: ${folderPath}/${fileName}`);

      return await this.uploadFile(driveId, folderPath, fileName, content);
    } catch (error: unknown) {
      logger.error('[SharePoint] Ошибка при загрузке ежемесячного отчета:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка'
      };
    }
  }

  /**
   * Проверяет доступ к SharePoint сайту.
   * Используется для тестирования подключения.
   */
  static async testConnection(): Promise<{ success: boolean; siteId?: string; error?: string }> {
    try {
      const siteId = await this.getSiteId();
      if (!siteId) {
        return { success: false, error: 'Не удалось получить ID сайта' };
      }

      const driveId = await this.getDriveId(siteId);
      if (!driveId) {
        return { success: false, error: 'Не удалось получить ID документной библиотеки' };
      }

      return { success: true, siteId };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка'
      };
    }
  }

  // =====================================================
  // МЕТОДЫ ДЛЯ РАБОТЫ С ОТЧЕТАМИ ProjIB
  // =====================================================

  /**
   * Украинские названия месяцев
   */
  private static readonly MONTH_NAMES_UK = [
    'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
    'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'
  ];

  /**
   * Инициализирует структуру папок ProjIB в SharePoint.
   * Вызывать один раз при первичной настройке.
   */
  static async initializeProjIBStructure(): Promise<{ success: boolean; error?: string }> {
    try {
      const siteId = await this.getSiteId();
      if (!siteId) {
        return { success: false, error: 'Не удалось получить ID сайту SharePoint' };
      }

      const driveId = await this.getDriveId(siteId);
      if (!driveId) {
        return { success: false, error: 'Не удалось получить ID документной библиотеки' };
      }

      // Создаем все основные папки
      const foldersToCreate = Object.values(this.FOLDERS);

      for (const folderPath of foldersToCreate) {
        const result = await this.ensureFolderExists(driveId, folderPath);
        if (!result) {
          logger.warn(`[SharePoint] Не удалось створити папку: ${folderPath}`);
        } else {
          logger.info(`[SharePoint] Папка готова: ${folderPath}`);
        }
      }

      return { success: true };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка'
      };
    }
  }

  /**
   * Получает список шаблонов отчетов из папки Шаблоны
   */
  static async getReportTemplates(): Promise<SharePointDriveItem[]> {
    try {
      const siteId = await this.getSiteId();
      if (!siteId) return [];

      const driveId = await this.getDriveId(siteId);
      if (!driveId) return [];

      const files = await this.listFiles(driveId, this.FOLDERS.TEMPLATES);

      // Фильтруем только .docx-файлы
      return files.filter(f => f.file && f.name.endsWith('.docx'));
    } catch (error: unknown) {
      logger.error('[SharePoint] Ошибка получения шаблонов:', error);
      return [];
    }
  }

  /**
   * Загружает шаблон отчета з SharePoint
   * @param templateName Имя файла шаблона (например: "Акт_месячный.docx")
   */
  static async downloadTemplate(templateName: string): Promise<ArrayBuffer | null> {
    try {
      const token = await GraphAuthService.getAccessToken();
      if (!token) return null;

      const siteId = await this.getSiteId();
      if (!siteId) return null;

      const driveId = await this.getDriveId(siteId);
      if (!driveId) return null;

      const filePath = `${this.FOLDERS.TEMPLATES}/${templateName}`;
      const encodedPath = encodeURIComponent(filePath).replace(/%2F/g, '/');

      const response = await fetch(
        `${GraphAuthService.apiBaseUrl}/drives/${driveId}/root:/${encodedPath}:/content`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        logger.error(`[SharePoint] Ошибка загрузки шаблону: ${response.status}`);
        return null;
      }

      return await response.arrayBuffer();
    } catch (error: unknown) {
      logger.error('[SharePoint] Ошибка загрузки шаблону:', error);
      return null;
    }
  }

  /**
   * Сохраняет отчет по предприятию
   * @param year Год
   * @param month Месяц (1-12)
   * @param companyName Название предприятия
   * @param content Содержимое файла (Word документ)
   */
  static async uploadCompanyReport(
    year: number,
    month: number,
    companyName: string,
    content: Buffer | ArrayBuffer
  ): Promise<SharePointUploadResult> {
    try {
      const siteId = await this.getSiteId();
      if (!siteId) {
        return { success: false, error: 'Не удалось получить ID сайту SharePoint' };
      }

      const driveId = await this.getDriveId(siteId);
      if (!driveId) {
        return { success: false, error: 'Не удалось получить ID документной библиотеки' };
      }

      const monthNum = month.toString().padStart(2, '0');
      const monthName = this.MONTH_NAMES_UK[month - 1];
      const folderPath = `${this.FOLDERS.REPORTS_COMPANY}/${year}/${monthNum}_${monthName}/${companyName}`;
      const fileName = `Акт_${companyName}_${monthNum}-${year}.docx`;

      logger.info(`[SharePoint] Загрузка отчета: ${folderPath}/${fileName}`);

      return await this.uploadFile(
        driveId,
        folderPath,
        fileName,
        content,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
    } catch (error: unknown) {
      logger.error('[SharePoint] Ошибка загрузки отчета по предприятию:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка'
      };
    }
  }

  /**
   * Сохраняет отчет по сотруднику
   * @param year Год
   * @param month Месяц (1-12)
   * @param employeeName ФИО сотрудника
   * @param content Содержимое файла (Word документ)
   */
  static async uploadEmployeeReport(
    year: number,
    month: number,
    employeeName: string,
    content: Buffer | ArrayBuffer
  ): Promise<SharePointUploadResult> {
    try {
      const siteId = await this.getSiteId();
      if (!siteId) {
        return { success: false, error: 'Не удалось получить ID сайту SharePoint' };
      }

      const driveId = await this.getDriveId(siteId);
      if (!driveId) {
        return { success: false, error: 'Не удалось получить ID документной библиотеки' };
      }

      const monthNum = month.toString().padStart(2, '0');
      const monthName = this.MONTH_NAMES_UK[month - 1];
      const folderPath = `${this.FOLDERS.REPORTS_EMPLOYEE}/${year}/${monthNum}_${monthName}`;
      const fileName = `Звіт_${employeeName}_${monthNum}-${year}.docx`;

      logger.info(`[SharePoint] Загрузка отчета: ${folderPath}/${fileName}`);

      return await this.uploadFile(
        driveId,
        folderPath,
        fileName,
        content,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
    } catch (error: unknown) {
      logger.error('[SharePoint] Ошибка загрузки отчета по сотруднику:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка'
      };
    }
  }

  /**
   * Сохраняет квартальный отчет
   * @param year Год
   * @param quarter Квартал (1-4)
   * @param reportName Название отчета
   * @param content Содержимое файла
   */
  static async uploadQuarterlyReport(
    year: number,
    quarter: number,
    reportName: string,
    content: Buffer | ArrayBuffer
  ): Promise<SharePointUploadResult> {
    try {
      const siteId = await this.getSiteId();
      if (!siteId) {
        return { success: false, error: 'Не удалось получить ID сайту SharePoint' };
      }

      const driveId = await this.getDriveId(siteId);
      if (!driveId) {
        return { success: false, error: 'Не удалось получить ID документной библиотеки' };
      }

      const folderPath = `${this.FOLDERS.REPORTS_QUARTERLY}/${year}/Q${quarter}`;
      const fileName = `${reportName}_Q${quarter}-${year}.docx`;

      logger.info(`[SharePoint] Загрузка квартального отчета: ${folderPath}/${fileName}`);

      return await this.uploadFile(
        driveId,
        folderPath,
        fileName,
        content,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
    } catch (error: unknown) {
      logger.error('[SharePoint] Ошибка загрузки квартального отчета:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка'
      };
    }
  }

  /**
   * Получает список отчетов по предприятию за период
   * @param year Год
   * @param month Месяц (1-12)
   * @param companyName Название предприятия (опционально)
   */
  static async getCompanyReports(
    year: number,
    month: number,
    companyName?: string
  ): Promise<SharePointDriveItem[]> {
    try {
      const siteId = await this.getSiteId();
      if (!siteId) return [];

      const driveId = await this.getDriveId(siteId);
      if (!driveId) return [];

      const monthNum = month.toString().padStart(2, '0');
      const monthName = this.MONTH_NAMES_UK[month - 1];

      let folderPath = `${this.FOLDERS.REPORTS_COMPANY}/${year}/${monthNum}_${monthName}`;
      if (companyName) {
        folderPath += `/${companyName}`;
      }

      return await this.listFiles(driveId, folderPath);
    } catch (error: unknown) {
      logger.error('[SharePoint] Ошибка получения отчетов:', error);
      return [];
    }
  }

  // =====================================================
  // МЕТОДЫ ДЛЯ ВЛОЖЕНИЙ ЗАДАЧ
  // =====================================================

  /**
   * Загружает вкладення до задачи в SharePoint.
   * Структура: Завдання/{year}/{month}_Месяц/{documentNumber или taskId}/filename
   *
   * @param file Файл для завантаження
   * @param documentNumber Номер документа (СЗ) - используется как имя папки
   * @param taskId ID задачи (если нет documentNumber)
   * @param completedAt Дата виконання для визначення папки
   */
  static async uploadTaskAttachment(
    file: File,
    documentNumber?: string,
    taskId?: string,
    completedAt?: Date
  ): Promise<SharePointUploadResult> {
    try {
      const siteId = await this.getSiteId();
      if (!siteId) {
        return { success: false, error: 'Не удалось получить ID сайту SharePoint' };
      }

      const driveId = await this.getDriveId(siteId);
      if (!driveId) {
        return { success: false, error: 'Не удалось получить ID документной библиотеки' };
      }

      // Определяем дату для папки
      const date = completedAt || new Date();
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const monthNum = month.toString().padStart(2, '0');
      const monthName = this.MONTH_NAMES_UK[month - 1];

      // Папка: просто год/месяц, без вложенной папки по номеру СЗ
      const folderPath = `${this.FOLDERS.TASK_ATTACHMENTS}/${year}/${monthNum}_${monthName}`;

      // Читаем файл як ArrayBuffer
      const content = await file.arrayBuffer();

      // Определяем MIME тип
      const contentType = file.type || 'application/octet-stream';

      logger.info(`[SharePoint] Загрузка вкладення: ${folderPath}/${file.name}`);

      return await this.uploadFile(driveId, folderPath, file.name, content, contentType);
    } catch (error: unknown) {
      logger.error('[SharePoint] Ошибка загрузки вкладення:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка'
      };
    }
  }

  /**
   * Загружает содержимое файлу з SharePoint за URL
   * @param webUrl URL файлу в SharePoint
   */
  static async downloadFileContent(webUrl: string): Promise<ArrayBuffer | null> {
    try {
      const token = await GraphAuthService.getAccessToken();
      if (!token) return null;

      const siteId = await this.getSiteId();
      if (!siteId) return null;

      const driveId = await this.getDriveId(siteId);
      if (!driveId) return null;

      // Получаетмо item за URL через пошук
      // Сначала пробуем получить путь из URL
      const urlObj = new URL(webUrl);
      const pathMatch = urlObj.pathname.match(/\/sites\/[^/]+\/Shared%20Documents\/(.+)/);

      if (!pathMatch) {
        logger.error('[SharePoint] Не удалось розпарсити URL:', webUrl);
        return null;
      }

      const filePath = decodeURIComponent(pathMatch[1]);
      // root уже указывает на Shared Documents, поэтому путь без префикса
      const encodedPath = encodeURIComponent(filePath).replace(/%2F/g, '/');

      const response = await fetch(
        `${GraphAuthService.apiBaseUrl}/drives/${driveId}/root:/${encodedPath}:/content`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
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

  /**
   * Извлекает текст з Word документа (.docx)
   * DOCX - это ZIP-архив с XML-файлами. Основной текст в word/document.xml
   *
   * @param content ArrayBuffer з содержимоеом .docx файлу
   */
  static async extractTextFromDocx(content: ArrayBuffer): Promise<string> {
    try {
      logger.info('[SharePoint] Начало извлечения текста из DOCX, размер:', content.byteLength);

      // Импортируем JSZip динамически
      const JSZip = (await import('jszip')).default;

      const zip = await JSZip.loadAsync(content);

      // Логируем содержимое архива
      const files = Object.keys(zip.files);
      logger.info('[SharePoint] Файлы в архиве:', files.slice(0, 10));

      const documentXml = await zip.file('word/document.xml')?.async('string');

      if (!documentXml) {
        logger.error('[SharePoint] Не найдено word/document.xml в архиве');
        return '';
      }

      logger.info('[SharePoint] Размер document.xml:', documentXml.length);

      // Парсинг по параграфах (тег </w:p>)
      const paragraphMatches = documentXml.split(/<\/w:p>/);
      logger.info('[SharePoint] Найдено параграфов:', paragraphMatches.length);

      const result: string[] = [];
      for (const para of paragraphMatches) {
        // Извлекаем текст из тегов <w:t> и <w:t xml:space="preserve">
        const texts = para.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
        if (texts.length > 0) {
          const paraText = texts
            .map(t => {
              // Удаляем теги и декодируем HTML-сущности
              const text = t.replace(/<[^>]+>/g, '');
              return text
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&apos;/g, "'");
            })
            .join('');
          if (paraText.trim()) {
            result.push(paraText.trim());
          }
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

  /**
   * Загружает и извлекает текст из Word-файла
   * @param webUrl URL файлу в SharePoint
   */
  static async downloadAndExtractText(webUrl: string): Promise<string | null> {
    try {
      const content = await this.downloadFileContent(webUrl);
      if (!content) {
        return null;
      }

      // Проверяем, что это DOCX (по URL)
      if (!webUrl.toLowerCase().endsWith('.docx')) {
        logger.warn('[SharePoint] Файл не DOCX, возвращаем null');
        return null;
      }

      return await this.extractTextFromDocx(content);
    } catch (error: unknown) {
      logger.error('[SharePoint] Ошибка витягування тексту:', error);
      return null;
    }
  }

  /**
   * Извлекает текст из объекта File (для локальных файлов перед загрузкой)
   * @param file Объект File
   */
  static async extractTextFromFile(file: File): Promise<string | null> {
    try {
      logger.info('[SharePoint] extractTextFromFile:', file.name, 'размер:', file.size);

      if (!file.name.toLowerCase().endsWith('.docx')) {
        logger.warn('[SharePoint] Файл не DOCX:', file.name);
        return null;
      }

      const content = await file.arrayBuffer();
      logger.info('[SharePoint] Прочитано ArrayBuffer:', content.byteLength, 'байт');

      const text = await this.extractTextFromDocx(content);
      logger.info('[SharePoint] Извлечено текста:', text?.length || 0, 'символов');

      return text || null;
    } catch (error: unknown) {
      logger.error('[SharePoint] Ошибка витягування тексту из файла:', error);
      return null;
    }
  }
}

