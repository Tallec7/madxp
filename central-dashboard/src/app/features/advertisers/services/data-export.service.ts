import { Injectable, inject } from '@angular/core';
import { ApiService } from '../../../core/services/api.service';
import { NotificationService } from '../../../core/services/notification.service';

@Injectable({ providedIn: 'root' })
export class DataExportService {
  private api = inject(ApiService);
  private notification = inject(NotificationService);

  exportCSV(sponsorId: string, from: string, to: string, onComplete: () => void): void {
    this.api.get<Blob>(`/analytics/advertisers/${sponsorId}/export`, {
      from,
      to,
      format: 'csv'
    }).subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sponsor-${sponsorId}-${from}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      },
      error: () => {
        this.notification.error('Erreur lors de l\'export');
      },
      complete: () => {
        onComplete();
      }
    });
  }
}
