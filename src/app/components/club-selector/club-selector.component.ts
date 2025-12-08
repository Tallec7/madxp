import { Component, inject, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DemoConfigService, ClubInfo } from '../../services/demo-config.service';
import { Configuration } from '../../interfaces/configuration.interface';

@Component({
  selector: 'app-club-selector',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './club-selector.component.html',
  styleUrl: './club-selector.component.scss'
})
export class ClubSelectorComponent implements OnInit {
  private readonly demoConfigService = inject(DemoConfigService);

  @Output() clubSelected = new EventEmitter<Configuration>();

  public clubs: ClubInfo[] = [];
  public isLoadingClubs = true;
  public isLoading = false;
  public loadingClubId: string | null = null;
  public error: string | null = null;

  public ngOnInit(): void {
    this.demoConfigService.getAvailableClubs().subscribe({
      next: (clubs) => {
        this.clubs = clubs;
        this.isLoadingClubs = false;
      },
      error: (err) => {
        console.error('Erreur chargement liste clubs:', err);
        this.error = 'Impossible de charger la liste des clubs';
        this.isLoadingClubs = false;
      }
    });
  }

  public selectClub(club: ClubInfo): void {
    this.isLoading = true;
    this.loadingClubId = club.id;

    this.demoConfigService.loadClubConfiguration(club.id).subscribe({
      next: (config) => {
        this.isLoading = false;
        this.loadingClubId = null;
        this.clubSelected.emit(config);
      },
      error: (err) => {
        console.error('Erreur chargement config club:', err);
        this.isLoading = false;
        this.loadingClubId = null;
      }
    });
  }
}
