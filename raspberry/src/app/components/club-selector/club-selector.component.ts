import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface ClubInfo {
  id: string;
  name: string;
  city: string;
  sport: string;
}

/**
 * Composant de selection de club/profil.
 * Agnostique : les donnees sont fournies par le parent via @Input.
 * Utilise en mode demo (clubs fictifs) et en mode production (profils multi-config).
 */
@Component({
  selector: 'app-club-selector',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './club-selector.component.html',
  styleUrl: './club-selector.component.scss'
})
export class ClubSelectorComponent {
  @Input() clubs: ClubInfo[] = [];
  @Input() isLoadingClubs = true;
  @Input() error: string | null = null;
  @Input() title = 'Mode Démo';
  @Input() subtitle = 'Sélectionnez un club pour démarrer la présentation';

  @Output() clubSelected = new EventEmitter<ClubInfo>();

  public isLoading = false;
  public loadingClubId: string | null = null;

  public selectClub(club: ClubInfo): void {
    this.isLoading = true;
    this.loadingClubId = club.id;
    this.clubSelected.emit(club);
  }

  /**
   * Appele par le parent apres le chargement pour reset le loading.
   */
  public resetLoading(): void {
    this.isLoading = false;
    this.loadingClubId = null;
  }
}
