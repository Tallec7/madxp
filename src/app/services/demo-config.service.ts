import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, shareReplay } from 'rxjs';
import { Configuration } from '../interfaces/configuration.interface';
import { environment } from '../../environments/environment';

export interface ClubInfo {
  id: string;
  name: string;
  city: string;
  sport: string;
}

@Injectable({
  providedIn: 'root'
})
export class DemoConfigService {
  private readonly http = inject(HttpClient);

  // Cache pour la liste des clubs
  private clubsCache$: Observable<ClubInfo[]> | null = null;

  public isDemoMode(): boolean {
    return environment.demoMode;
  }

  /**
   * Charge la liste des clubs depuis un fichier JSON externe.
   * Permet d'ajouter des clubs sans rebuild.
   */
  public getAvailableClubs(): Observable<ClubInfo[]> {
    if (!this.clubsCache$) {
      this.clubsCache$ = this.http.get<ClubInfo[]>('/demo-configs/clubs.json').pipe(
        shareReplay(1)
      );
    }
    return this.clubsCache$;
  }

  public loadClubConfiguration(clubId: string): Observable<Configuration> {
    return this.http.get<Configuration>(`/demo-configs/${clubId}.json`);
  }
}
