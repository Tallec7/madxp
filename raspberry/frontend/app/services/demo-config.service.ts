import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, shareReplay, tap } from 'rxjs';
import { Configuration } from '../interfaces/configuration.interface';
import { environment } from '../../environments/environment';

export interface ClubInfo {
  id: string;
  name: string;
  city: string;
  sport: string;
}

const SELECTED_CLUB_KEY = 'neopro_demo_selected_club';

@Injectable({
  providedIn: 'root'
})
export class DemoConfigService {
  private readonly http = inject(HttpClient);

  // Cache pour la liste des clubs
  private clubsCache$: Observable<ClubInfo[]> | null = null;

  // Configuration du club sélectionné (en mémoire)
  private selectedConfiguration: Configuration | null = null;

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
    return this.http.get<Configuration>(`/demo-configs/${clubId}.json`).pipe(
      tap(config => {
        this.selectedConfiguration = config;
        localStorage.setItem(SELECTED_CLUB_KEY, clubId);
      })
    );
  }

  /**
   * Retourne la configuration du club sélectionné.
   * Utilisé par /tv pour charger la même config que /remote.
   */
  public getSelectedConfiguration(): Observable<Configuration> | null {
    // Si on a déjà la config en mémoire, la retourner
    if (this.selectedConfiguration) {
      return of(this.selectedConfiguration);
    }

    // Sinon, essayer de charger depuis le localStorage
    const clubId = localStorage.getItem(SELECTED_CLUB_KEY);
    if (clubId) {
      return this.loadClubConfiguration(clubId);
    }

    return null;
  }

  /**
   * Définit la configuration sélectionnée (appelé depuis club-selector)
   */
  public setSelectedConfiguration(config: Configuration, clubId: string): void {
    this.selectedConfiguration = config;
    localStorage.setItem(SELECTED_CLUB_KEY, clubId);
  }

  /**
   * Efface la sélection de club
   */
  public clearSelection(): void {
    this.selectedConfiguration = null;
    localStorage.removeItem(SELECTED_CLUB_KEY);
  }
}
