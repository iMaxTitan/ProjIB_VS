/**
 * Monthly report service — barrel re-export.
 * Split into focused modules for maintainability:
 *   monthly-report-types.ts      — types, getReportClient, fetchTaskCompanyLinks, formatters
 *   company-report.service.ts    — getCompanyReportData, getAvailableCompanyReports
 *   employee-report.service.ts   — getEmployeeReportData, getAvailableEmployeeReports, getAvailablePeriods
 *   quarterly-plan-report.service.ts — getQuarterlyPlanReportData, getQuarterlyReportData
 */
export * from './types';
export * from './service';
export * from './company-report';
export * from './employee-report';
export * from './quarterly-plan';
export * from './excel';
