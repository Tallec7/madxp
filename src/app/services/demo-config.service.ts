import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, map, catchError } from 'rxjs';
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

  // Liste statique des clubs disponibles en mode démo
  // À mettre à jour quand on ajoute de nouvelles configs
  private readonly availableClubs: ClubInfo[] = [
    { id: 'nlfhandball', name: 'NLF Handball', city: 'Nantes', sport: 'Handball' },
    { id: 'demo-club', name: 'Demo Club', city: 'Paris', sport: 'Football' }
  ];

  public isDemoMode(): boolean {
    return environment.demoMode;
  }

  public getAvailableClubs(): ClubInfo[] {
    return this.availableClubs;
  }

  public loadClubConfiguration(clubId: string): Observable<Configuration> {
    return this.http.get<Configuration>(`/assets/demo-configs/${clubId}.json`);
  }
}
