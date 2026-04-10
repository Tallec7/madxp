/**
 * PDF Report Generation Service — Barrel file
 *
 * Re-exports all report generators from focused modules.
 * Preserves backward compatibility for all existing imports.
 */

export { generateAdvertiserReport, generateSponsorReport } from './pdf-report/advertiser-report';
export { generateClubReport } from './pdf-report/club-report';
export { generateSiteSponsorReport } from './pdf-report/site-sponsor-report';

// Re-export types for consumers that need them
export type { ReportData, PdfReportOptions } from './pdf-report/pdf-report.utils';
export type { SiteSponsorReportData } from './pdf-report/site-sponsor-report';

import { generateAdvertiserReport } from './pdf-report/advertiser-report';
import { generateClubReport } from './pdf-report/club-report';
import { generateSiteSponsorReport } from './pdf-report/site-sponsor-report';

// Default export preserves the original API shape
export default {
  generateSponsorReport: generateAdvertiserReport,
  generateClubReport,
  generateSiteSponsorReport,
};
