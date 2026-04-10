import { Injectable, inject } from '@angular/core';
import { Observable, interval, switchMap } from 'rxjs';
import { ClubDashboardDataService, SiteDashboard } from './club-dashboard-data.service';

@Injectable({ providedIn: 'root' })
export class ClubRealtimeService {
  private readonly dataService = inject(ClubDashboardDataService);

  startPolling(): Observable<SiteDashboard> {
    return interval(30000).pipe(
      switchMap(() => this.dataService.fetchDashboard())
    );
  }
}
