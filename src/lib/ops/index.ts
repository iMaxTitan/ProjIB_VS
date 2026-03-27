// NOTE: reports/pdf.ts (PDF generation) and reports/docx.ts are server-only (pdfkit/fs deps).
// NOTE: reports/quarterly-notes.ts conflicts on 'generateFallbackNote' with reports/company-notes.ts.
// Import these three directly when needed:
//   @/lib/ops/reports/pdf
//   @/lib/ops/reports/docx
//   @/lib/ops/reports/quarterly-notes
export * from './activity';
export * from './contracts';
export * from './employees.service';
export * from './infrastructure.service';
export * from './kpi';
export * from './reports';
