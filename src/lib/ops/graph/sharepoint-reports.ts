/**
 * SharePoint report upload operations (company, employee, quarterly, monthly).
 */

import { GraphAuthService } from './auth-service';
import { logger } from '@/lib/shared/logger';
import {
  SP_FOLDERS,
  SP_MONTH_NAMES,
  SP_MONTH_NAMES_UK,
  SP_REPORTS_ROOT,
  SharePointDriveItem,
  SharePointUploadResult,
} from './sharepoint-types';
import { getSiteId, getDriveId, ensureFolderExists, uploadFile, listFiles } from './sharepoint-drive';

async function getSiteAndDriveIds(): Promise<{ siteId: string; driveId: string } | null> {
  const siteId = await getSiteId();
  if (!siteId) return null;
  const driveId = await getDriveId(siteId);
  if (!driveId) return null;
  return { siteId, driveId };
}

export async function uploadMonthlyReport(
  year: number,
  month: number,
  departmentCode: string,
  content: Buffer | ArrayBuffer
): Promise<SharePointUploadResult> {
  try {
    const ids = await getSiteAndDriveIds();
    if (!ids) return { success: false, error: 'Не удалось получить ID сайта SharePoint или документной библиотеки' };
    const monthName = SP_MONTH_NAMES[month - 1];
    const folderPath = `${SP_REPORTS_ROOT}/${year}`;
    const fileName = `Отчет_${departmentCode}_${monthName}_${year}.xlsx`;
    logger.info(`[SharePoint] Загрузка отчета: ${folderPath}/${fileName}`);
    return await uploadFile(ids.driveId, folderPath, fileName, content);
  } catch (error: unknown) {
    logger.error('[SharePoint] Ошибка при загрузке ежемесячного отчета:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Неизвестная ошибка' };
  }
}

export async function initializeProjIBStructure(): Promise<{ success: boolean; error?: string }> {
  try {
    const ids = await getSiteAndDriveIds();
    if (!ids) return { success: false, error: 'Не удалось получить ID сайту SharePoint або документной библиотеки' };
    for (const folderPath of Object.values(SP_FOLDERS)) {
      const result = await ensureFolderExists(ids.driveId, folderPath);
      if (!result) logger.warn(`[SharePoint] Не удалось створити папку: ${folderPath}`);
      else logger.info(`[SharePoint] Папка готова: ${folderPath}`);
    }
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'Неизвестная ошибка' };
  }
}

export async function getReportTemplates(): Promise<SharePointDriveItem[]> {
  try {
    const ids = await getSiteAndDriveIds();
    if (!ids) return [];
    const files = await listFiles(ids.driveId, SP_FOLDERS.TEMPLATES);
    return files.filter(f => f.file && f.name.endsWith('.docx'));
  } catch (error: unknown) {
    logger.error('[SharePoint] Ошибка получения шаблонов:', error);
    return [];
  }
}

export async function downloadTemplate(templateName: string): Promise<ArrayBuffer | null> {
  try {
    const token = await GraphAuthService.getAccessToken();
    if (!token) return null;
    const ids = await getSiteAndDriveIds();
    if (!ids) return null;
    const filePath = `${SP_FOLDERS.TEMPLATES}/${templateName}`;
    const encodedPath = encodeURIComponent(filePath).replace(/%2F/g, '/');
    const response = await fetch(
      `${GraphAuthService.apiBaseUrl}/drives/${ids.driveId}/root:/${encodedPath}:/content`,
      { headers: { Authorization: `Bearer ${token}` } }
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

export async function uploadCompanyReport(
  year: number,
  month: number,
  companyName: string,
  content: Buffer | ArrayBuffer
): Promise<SharePointUploadResult> {
  try {
    const ids = await getSiteAndDriveIds();
    if (!ids) return { success: false, error: 'Не удалось получить ID сайту SharePoint або документной библиотеки' };
    const monthNum = month.toString().padStart(2, '0');
    const monthName = SP_MONTH_NAMES_UK[month - 1];
    const folderPath = `${SP_FOLDERS.REPORTS_COMPANY}/${year}/${monthNum}_${monthName}/${companyName}`;
    const fileName = `Акт_${companyName}_${monthNum}-${year}.docx`;
    logger.info(`[SharePoint] Загрузка отчета: ${folderPath}/${fileName}`);
    return await uploadFile(ids.driveId, folderPath, fileName, content, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  } catch (error: unknown) {
    logger.error('[SharePoint] Ошибка загрузки отчета по предприятию:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Неизвестная ошибка' };
  }
}

export async function uploadEmployeeReport(
  year: number,
  month: number,
  employeeName: string,
  content: Buffer | ArrayBuffer
): Promise<SharePointUploadResult> {
  try {
    const ids = await getSiteAndDriveIds();
    if (!ids) return { success: false, error: 'Не удалось получить ID сайту SharePoint або документной библиотеки' };
    const monthNum = month.toString().padStart(2, '0');
    const monthName = SP_MONTH_NAMES_UK[month - 1];
    const folderPath = `${SP_FOLDERS.REPORTS_EMPLOYEE}/${year}/${monthNum}_${monthName}`;
    const fileName = `Звіт_${employeeName}_${monthNum}-${year}.docx`;
    logger.info(`[SharePoint] Загрузка отчета: ${folderPath}/${fileName}`);
    return await uploadFile(ids.driveId, folderPath, fileName, content, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  } catch (error: unknown) {
    logger.error('[SharePoint] Ошибка загрузки отчета по сотруднику:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Неизвестная ошибка' };
  }
}

export async function uploadQuarterlyReport(
  year: number,
  quarter: number,
  reportName: string,
  content: Buffer | ArrayBuffer
): Promise<SharePointUploadResult> {
  try {
    const ids = await getSiteAndDriveIds();
    if (!ids) return { success: false, error: 'Не удалось получить ID сайту SharePoint або документной библиотеки' };
    const folderPath = `${SP_FOLDERS.REPORTS_QUARTERLY}/${year}/Q${quarter}`;
    const fileName = `${reportName}_Q${quarter}-${year}.docx`;
    logger.info(`[SharePoint] Загрузка квартального отчета: ${folderPath}/${fileName}`);
    return await uploadFile(ids.driveId, folderPath, fileName, content, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  } catch (error: unknown) {
    logger.error('[SharePoint] Ошибка загрузки квартального отчета:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Неизвестная ошибка' };
  }
}

export async function getCompanyReports(
  year: number,
  month: number,
  companyName?: string
): Promise<SharePointDriveItem[]> {
  try {
    const ids = await getSiteAndDriveIds();
    if (!ids) return [];
    const monthNum = month.toString().padStart(2, '0');
    const monthName = SP_MONTH_NAMES_UK[month - 1];
    let folderPath = `${SP_FOLDERS.REPORTS_COMPANY}/${year}/${monthNum}_${monthName}`;
    if (companyName) folderPath += `/${companyName}`;
    return await listFiles(ids.driveId, folderPath);
  } catch (error: unknown) {
    logger.error('[SharePoint] Ошибка получения отчетов:', error);
    return [];
  }
}
