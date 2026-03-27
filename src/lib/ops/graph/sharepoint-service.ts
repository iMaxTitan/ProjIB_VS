/**
 * SharePoint service — barrel re-export + thin GraphSharePointService class wrapper.
 * Split into focused modules for maintainability:
 *   sharepoint-types.ts       — interfaces and constants
 *   sharepoint-drive.ts       — core file/folder operations
 *   sharepoint-reports.ts     — report upload/download operations
 *   sharepoint-attachments.ts — task attachments and DOCX text extraction
 */
export * from './sharepoint-types';
export * from './sharepoint-drive';
export * from './sharepoint-reports';
export * from './sharepoint-attachments';

import { SP_FOLDERS } from './sharepoint-types';
import * as drive from './sharepoint-drive';
import * as reports from './sharepoint-reports';
import * as attachments from './sharepoint-attachments';

/**
 * Namespace wrapper — preserves the static class API for existing callers.
 * New code should import module functions directly.
 */
export class GraphSharePointService {
  static readonly FOLDERS = SP_FOLDERS;

  // Core drive operations
  static getSiteId = drive.getSiteId;
  static getDriveId = drive.getDriveId;
  static ensureFolderExists = drive.ensureFolderExists;
  static uploadFile = drive.uploadFile;
  static listFiles = drive.listFiles;
  static testConnection = drive.testConnection;

  // Report operations
  static uploadMonthlyReport = reports.uploadMonthlyReport;
  static initializeProjIBStructure = reports.initializeProjIBStructure;
  static getReportTemplates = reports.getReportTemplates;
  static downloadTemplate = reports.downloadTemplate;
  static uploadCompanyReport = reports.uploadCompanyReport;
  static uploadEmployeeReport = reports.uploadEmployeeReport;
  static uploadQuarterlyReport = reports.uploadQuarterlyReport;
  static getCompanyReports = reports.getCompanyReports;

  // Attachment + text extraction
  static uploadTaskAttachment = attachments.uploadTaskAttachment;
  static downloadFileContent = attachments.downloadFileContent;
  static extractTextFromDocx = attachments.extractTextFromDocx;
  static downloadAndExtractText = attachments.downloadAndExtractText;
  static extractTextFromFile = attachments.extractTextFromFile;
}
