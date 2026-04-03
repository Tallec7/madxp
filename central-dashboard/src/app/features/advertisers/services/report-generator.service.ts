import { Injectable, inject } from '@angular/core';
import { ApiService } from '../../../core/services/api.service';
import { NotificationService } from '../../../core/services/notification.service';

@Injectable({ providedIn: 'root' })
export class ReportGeneratorService {
  private api = inject(ApiService);
  private notification = inject(NotificationService);

  downloadPDF(sponsorId: string, from: string, to: string, onComplete: () => void): void {
    this.api.get<Blob>(`/analytics/advertisers/${sponsorId}/report/pdf`, {
      from,
      to
    }).subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `rapport-sponsor-${sponsorId}-${from}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      },
      error: () => {
        this.notification.error('Erreur lors de la g\u00e9n\u00e9ration du PDF');
      },
      complete: () => {
        onComplete();
      }
    });
  }
}
