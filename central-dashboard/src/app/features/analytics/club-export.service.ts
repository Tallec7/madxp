import { Injectable, inject } from '@angular/core';
import { AnalyticsService } from '../../core/services/analytics.service';
import { NotificationService } from '../../core/services/notification.service';
import { ErrorExtractor } from '../../core/utils/error-extractor';

@Injectable({ providedIn: 'root' })
export class ClubExportService {
  private readonly analyticsService = inject(AnalyticsService);
  private readonly notificationService = inject(NotificationService);

  exportCsv(
    siteId: string,
    clubName: string,
    days: number,
    onStart: () => void,
    onEnd: () => void
  ): void {
    onStart();

    this.analyticsService.exportClubData(siteId, 'csv', days).subscribe({
      next: (blob) => {
        this.downloadBlob(blob, `analytics-${clubName || siteId}-${days}j.csv`);
        onEnd();
      },
      error: (err) => {
        this.notificationService.error(`Erreur export: ${ErrorExtractor.getMessage(err)}`);
        onEnd();
      }
    });
  }

  exportPdf(
    siteId: string,
    clubName: string,
    days: number,
    onStart: () => void,
    onEnd: () => void
  ): void {
    onStart();

    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days);

    this.analyticsService.getClubPdfReport(
      siteId,
      from.toISOString().split('T')[0],
      to.toISOString().split('T')[0]
    ).subscribe({
      next: (blob) => {
        this.downloadBlob(blob, `rapport-${clubName || siteId}.pdf`);
        onEnd();
      },
      error: (err) => {
        this.notificationService.error(`Erreur PDF: ${ErrorExtractor.getMessage(err)}`);
        onEnd();
      }
    });
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  }
}
