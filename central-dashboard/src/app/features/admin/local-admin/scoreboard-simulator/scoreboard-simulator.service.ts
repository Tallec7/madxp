import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '@app/core/services/api.service';
import { Site } from '@app/core/models';

export type ScoreboardVendor = 'bodet' | 'stramatel' | 'manual';

export interface ScoreboardSimState {
  siteId: string;
  vendor: ScoreboardVendor;
  sport: 'basketball';
  period: number;
  chronoMs: number;
  clockRunning: boolean;
  homeScore: number;
  guestScore: number;
  homeTeamFouls: number;
  guestTeamFouls: number;
  shotClockMs: number;
  timeoutActive: 'home' | 'guest' | null;
  timeoutRemainingMs: number;
}

@Injectable({ providedIn: 'root' })
export class ScoreboardSimulatorService {
  private readonly api = inject(ApiService);

  listSites(): Observable<{ data: Site[] }> {
    return this.api.get<{ data: Site[] }>('/sites', { limit: 200 });
  }

  push(state: ScoreboardSimState): Observable<{ accepted: boolean }> {
    const { siteId, ...payload } = state;
    return this.api.post<{ accepted: boolean }>(
      `/scoreboard/${siteId}/state-manual`,
      payload
    );
  }
}
