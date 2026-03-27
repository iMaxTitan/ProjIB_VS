/**
 * PDF report service — barrel re-export.
 * Split into focused modules for maintainability:
 *   pdf-helpers.ts             — shared config, fonts, drawing utilities
 *   pdf-company-report.ts      — generateCompanyReportPDF
 *   pdf-employee-report.ts     — generateEmployeeReportPDF
 *   pdf-quarterly-reports.ts   — generateQuarterlyPlanPDF, generateQuarterlyReportPDF
 */
export * from './pdf-helpers';
export * from './pdf-company';
export * from './pdf-employee';
export * from './pdf-quarterly';
