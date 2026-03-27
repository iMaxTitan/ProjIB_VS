/**
 * SharePoint shared types and constants.
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

export const SP_SITE_HOST = 'atbmarket.sharepoint.com';
export const SP_SITE_PATH = '/sites/msteams_430b06';
export const SP_REPORTS_ROOT = 'General/Proj-IB/Звіти/По підприємствах';

export const SP_FOLDERS = {
  TEMPLATES: 'General/Proj-IB/Шаблони',
  REPORTS_COMPANY: 'General/Proj-IB/Звіти/По підприємствах',
  REPORTS_EMPLOYEE: 'General/Proj-IB/Звіти/По співробітниках',
  REPORTS_QUARTERLY: 'General/Proj-IB/Звіти/Квартальні',
  ARCHIVE: 'General/Proj-IB/Архів',
  TASK_ATTACHMENTS: 'General/Proj-IB/Завдання',
} as const;

export const SP_MONTH_NAMES = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

export const SP_MONTH_NAMES_UK = [
  'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
  'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень',
];
