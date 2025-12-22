import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Configuration, TimeCategory } from '../../interfaces/configuration.interface';
import { Category } from '../../interfaces/category.interface';
import { Video } from '../../interfaces/video.interface';
import { SocketService } from '../../services/socket.service';
import { AnalyticsService } from '../../services/analytics.service';
import { DemoConfigService } from '../../services/demo-config.service';
import { ClubSelectorComponent } from '../club-selector/club-selector.component';

type ViewType = 'club-selector' | 'home' | 'time-categories' | 'subcategories' | 'videos' | 'all-videos';

@Component({
  selector: 'app-remote',
  standalone: true,
  imports: [CommonModule, FormsModule, ClubSelectorComponent],
  templateUrl: './remote.component.html',
  styleUrl: './remote.component.scss'
})
export class RemoteComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  private readonly socketService = inject(SocketService);
  private readonly analyticsService = inject(AnalyticsService);
  private readonly demoConfigService = inject(DemoConfigService);

  public configuration!: Configuration;
  public currentView: ViewType = 'home';
  public breadcrumb: string[] = ['Télécommande'];
  public isDemoMode = false;
  public isReloading = false;

  public selectedTimeCategory: TimeCategory | null = null;
  public selectedCategory: Category | null = null;
  public selectedSubCategory: Category | null = null;

  // Recherche
  public searchQuery = '';
  public searchResults: Video[] = [];
  public isSearching = false;

  // Affluence et match info
  public showMatchModal = false;
  public matchInfo = {
    date: new Date().toISOString().split('T')[0],
    matchName: '',
    audienceEstimate: 150
  };
  public currentSessionId: string | null = null;

  // Score en live
  public liveScoreEnabled = false;
  public currentScore = {
    homeTeam: 'DOMICILE',
    awayTeam: 'EXTÉRIEUR',
    homeScore: 0,
    awayScore: 0
  };

  // Phase active de la boucle vidéo
  public activePhase: 'neutral' | 'before' | 'during' | 'after' = 'neutral';
  public readonly matchPhases: ('before' | 'during' | 'after')[] = ['before', 'during', 'after'];

  // Exposer Math pour le template
  public Math = Math;

  // Organisation par temps de match - valeurs par défaut si non définies dans la config
  private readonly defaultTimeCategories: TimeCategory[] = [
    {
      id: 'before',
      name: 'Avant-match',
      icon: '🏁',
      color: 'from-blue-500 to-blue-600',
      description: 'Échauffement & présentation',
      categoryIds: []
    },
    {
      id: 'during',
      name: 'Match',
      icon: '▶️',
      color: 'from-green-500 to-green-600',
      description: 'Live & animations',
      categoryIds: []
    },
    {
      id: 'after',
      name: 'Après-match',
      icon: '🏆',
      color: 'from-purple-500 to-purple-600',
      description: 'Résultats & remerciements',
      categoryIds: []
    }
  ];

  public timeCategories: TimeCategory[] = [];

  public ngOnInit(): void {
    this.isDemoMode = this.demoConfigService.isDemoMode();

    if (this.isDemoMode) {
      // En mode démo, on commence par la sélection du club
      this.currentView = 'club-selector';
    } else {
      // Mode normal : charger la config depuis le resolver
      const data = this.route.snapshot.data['configuration'] as Configuration;
      this.initializeWithConfiguration(data);
    }
  }

  public onClubSelected(config: Configuration): void {
    this.initializeWithConfiguration(config);
    this.currentView = 'home';
    // Envoyer la nouvelle config à /tv et lancer la boucle partenaires
    this.socketService.emit('command', { type: 'reload-config', data: config });
  }

  private initializeWithConfiguration(config: Configuration): void {
    this.configuration = config;
    // Utiliser les timeCategories de la config, ou les valeurs par défaut
    this.timeCategories = this.configuration.timeCategories?.length
      ? this.configuration.timeCategories
      : this.defaultTimeCategories;
    // Charger l'état du live score depuis la config
    this.liveScoreEnabled = config.liveScoreEnabled ?? false;
  }

  // Navigation
  public handleBack(): void {
    // Si on est dans la recherche, on revient à home
    if (this.isSearching) {
      this.clearSearch();
      return;
    }

    // Si on est dans "toutes les vidéos", on revient à home
    if (this.currentView === 'all-videos') {
      this.currentView = 'home';
      this.breadcrumb = ['Télécommande'];
      return;
    }

    this.breadcrumb.pop();

    if (this.breadcrumb.length === 1) {
      this.currentView = 'home';
      this.selectedTimeCategory = null;
      this.selectedCategory = null;
      this.selectedSubCategory = null;
    } else if (this.breadcrumb.length === 2) {
      this.currentView = 'time-categories';
      this.selectedCategory = null;
      this.selectedSubCategory = null;
    } else if (this.breadcrumb.length === 3) {
      this.currentView = 'subcategories';
      this.selectedSubCategory = null;
    }
  }

  public backToClubSelector(): void {
    this.currentView = 'club-selector';
    this.breadcrumb = ['Télécommande'];
    this.selectedTimeCategory = null;
    this.selectedCategory = null;
    this.selectedSubCategory = null;
  }

  public selectTimeCategory(timeCategory: TimeCategory): void {
    this.selectedTimeCategory = timeCategory;
    this.breadcrumb.push(timeCategory.name);
    this.currentView = 'time-categories';
  }

  public selectCategory(category: Category): void {
    this.selectedCategory = category;
    this.breadcrumb.push(category.name);

    if (category.subCategories && category.subCategories.length > 0) {
      this.currentView = 'subcategories';
    } else {
      this.currentView = 'videos';
    }
  }

  public selectSubCategory(subCategory: Category): void {
    this.selectedSubCategory = subCategory;
    this.breadcrumb.push(subCategory.name);
    this.currentView = 'videos';
  }

  // Actions
  public launchSponsors(): void {
    console.log('emit sponsors loop');
    this.socketService.emit('command', { type: 'sponsors' });
  }

  public launchVideo(video: Video): void {
    console.log('emit video', video);
    // Tracker le déclenchement manuel
    this.analyticsService.trackManualTrigger(video);
    this.socketService.emit('command', { type: 'video', data: video });
  }

  // Helpers
  public getCategoriesForTimeCategory(timeCategory: TimeCategory): Category[] {
    const filteredCategories = this.configuration.categories.filter(cat =>
      timeCategory.categoryIds.includes(cat.id)
    );
    return this.sortByName(filteredCategories);
  }

  public getVideosCount(category: Category): number {
    if (category.videos) {
      return category.videos.length;
    }
    if (category.subCategories) {
      return category.subCategories.reduce((sum, sub) => {
        return sum + (sub.videos?.length || 0);
      }, 0);
    }
    return 0;
  }

  public getSubCategoriesCount(category: Category): number {
    return category.subCategories?.length || 0;
  }

  public getSubCategoriesForDisplay(category: Category): Category[] {
    return this.sortByName(category.subCategories ?? []);
  }

  public getCurrentVideos(): Video[] {
    const videos = this.selectedSubCategory?.videos ?? this.selectedCategory?.videos ?? [];
    return this.sortByName(videos);
  }

  public getTotalVideosForTimeCategory(timeCategory: TimeCategory): number {
    const categories = this.getCategoriesForTimeCategory(timeCategory);
    return categories.reduce((sum, cat) => sum + this.getVideosCount(cat), 0);
  }

  public getTotalCategoriesForTimeCategory(timeCategory: TimeCategory): number {
    const categories = this.getCategoriesForTimeCategory(timeCategory);
    return categories.reduce((sum, cat) => {
      if (cat.subCategories && cat.subCategories.length > 0) {
        return sum + cat.subCategories.length;
      }
      return sum + 1;
    }, 0);
  }

  /**
   * Charge une copie triée des éléments selon leur nom
   */
  private sortByName<T extends { name: string }>(items: T[] = []): T[] {
    return [...items].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    );
  }

  /**
   * Recharge la configuration depuis le serveur (bypass cache)
   */
  public reloadConfiguration(): void {
    if (this.isReloading || this.isDemoMode) return;

    this.isReloading = true;
    const timestamp = Date.now();

    this.http.get<Configuration>(`/configuration.json?t=${timestamp}`).subscribe({
      next: (config) => {
        console.log('Configuration rechargée', config);
        const enrichedConfig = this.enrichVideosWithCategoryId(config);
        this.initializeWithConfiguration(enrichedConfig);
        // Revenir à la vue home pour refléter les changements
        this.currentView = 'home';
        this.breadcrumb = ['Télécommande'];
        this.selectedTimeCategory = null;
        this.selectedCategory = null;
        this.selectedSubCategory = null;
        this.isReloading = false;
      },
      error: (err) => {
        console.error('Erreur lors du rechargement de la configuration', err);
        this.isReloading = false;
      }
    });
  }

  /**
   * Enrichit les vidéos avec le categoryId de leur catégorie parente
   */
  private enrichVideosWithCategoryId(config: Configuration): Configuration {
    const enrichCategory = (category: Category): Category => ({
      ...category,
      videos: category.videos?.map(video => ({
        ...video,
        categoryId: category.id
      })),
      subCategories: category.subCategories?.map(sub => enrichCategory(sub))
    });

    return {
      ...config,
      categories: config.categories?.map(cat => enrichCategory(cat)) || []
    };
  }

  // ============================================================================
  // RECHERCHE
  // ============================================================================

  /**
   * Effectue une recherche dans toutes les vidéos
   */
  public onSearch(): void {
    if (!this.searchQuery.trim()) {
      this.clearSearch();
      return;
    }

    this.isSearching = true;
    const query = this.searchQuery.toLowerCase().trim();
    this.searchResults = this.getAllVideos().filter(video =>
      video.name.toLowerCase().includes(query)
    );
  }

  /**
   * Efface la recherche et revient à la vue précédente
   */
  public clearSearch(): void {
    this.searchQuery = '';
    this.searchResults = [];
    this.isSearching = false;
  }

  /**
   * Retourne toutes les vidéos de la configuration (flat)
   */
  public getAllVideos(): Video[] {
    const videos: Video[] = [];

    const extractVideos = (category: Category) => {
      if (category.videos) {
        videos.push(...category.videos);
      }
      if (category.subCategories) {
        category.subCategories.forEach(sub => extractVideos(sub));
      }
    };

    this.configuration?.categories?.forEach(cat => extractVideos(cat));
    return this.sortByName(videos);
  }

  /**
   * Affiche toutes les vidéos
   */
  public showAllVideos(): void {
    this.currentView = 'all-videos';
    this.breadcrumb = ['Télécommande', 'Toutes les vidéos'];
  }

  /**
   * Retourne le nombre total de vidéos dans la configuration
   */
  public getTotalVideosCount(): number {
    return this.getAllVideos().length;
  }

  // ============================================================================
  // AFFLUENCE / MATCH INFO
  // ============================================================================

  /**
   * Ouvre le modal de configuration du match
   */
  public openMatchModal(): void {
    this.showMatchModal = true;
  }

  /**
   * Ferme le modal sans sauvegarder
   */
  public closeMatchModal(): void {
    this.showMatchModal = false;
  }

  /**
   * Sauvegarde les informations du match
   */
  public saveMatchInfo(): void {
    console.log('Match info saved:', this.matchInfo);

    // Créer une nouvelle session avec les infos du match
    this.currentSessionId = this.generateUUID();

    // Envoyer au serveur via socket
    this.socketService.emit('match-config', {
      sessionId: this.currentSessionId,
      matchDate: this.matchInfo.date,
      matchName: this.matchInfo.matchName,
      audienceEstimate: this.matchInfo.audienceEstimate
    });

    // Extraire les noms d'équipes pour le score
    this.updateTeamNamesFromMatch();

    this.showMatchModal = false;
  }

  /**
   * Incrémente l'estimation d'audience
   */
  public incrementAudience(): void {
    this.matchInfo.audienceEstimate += 10;
  }

  /**
   * Décrémente l'estimation d'audience
   */
  public decrementAudience(): void {
    if (this.matchInfo.audienceEstimate >= 10) {
      this.matchInfo.audienceEstimate -= 10;
    }
  }

  /**
   * Génère un UUID v4
   */
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // ============================================================================
  // SCORE EN LIVE
  // ============================================================================

  /**
   * Incrémente le score de l'équipe domicile
   */
  public incrementHomeScore(): void {
    this.currentScore.homeScore++;
    this.broadcastScore();
  }

  /**
   * Décrémente le score de l'équipe domicile
   */
  public decrementHomeScore(): void {
    if (this.currentScore.homeScore > 0) {
      this.currentScore.homeScore--;
      this.broadcastScore();
    }
  }

  /**
   * Incrémente le score de l'équipe extérieure
   */
  public incrementAwayScore(): void {
    this.currentScore.awayScore++;
    this.broadcastScore();
  }

  /**
   * Décrémente le score de l'équipe extérieure
   */
  public decrementAwayScore(): void {
    if (this.currentScore.awayScore > 0) {
      this.currentScore.awayScore--;
      this.broadcastScore();
    }
  }

  /**
   * Extrait les noms des équipes depuis le nom du match
   */
  public updateTeamNamesFromMatch(): void {
    if (this.matchInfo.matchName && this.matchInfo.matchName.toLowerCase().includes('vs')) {
      const teams = this.matchInfo.matchName.split(/vs/i).map(t => t.trim());
      this.currentScore.homeTeam = teams[0] || 'DOMICILE';
      this.currentScore.awayTeam = teams[1] || 'EXTÉRIEUR';
      this.broadcastScore();
    }
  }

  /**
   * Envoie le score à la TV via socket
   */
  public broadcastScore(): void {
    this.socketService.emit('score-update', {
      homeTeam: this.currentScore.homeTeam,
      awayTeam: this.currentScore.awayTeam,
      homeScore: this.currentScore.homeScore,
      awayScore: this.currentScore.awayScore
    });
  }

  /**
   * Réinitialise le score
   */
  public resetScore(): void {
    this.currentScore.homeScore = 0;
    this.currentScore.awayScore = 0;
    this.broadcastScore();
  }

  // ============================================================================
  // PHASE DE BOUCLE VIDÉO
  // ============================================================================

  /**
   * Change la phase active de la boucle vidéo
   */
  public switchPhase(phase: 'neutral' | 'before' | 'during' | 'after'): void {
    this.activePhase = phase;
    console.log('Switching to phase:', phase);
    this.socketService.emit('phase-change', { phase });
  }

  /**
   * Retourne le label de la phase active
   */
  public getPhaseLabel(phase: 'neutral' | 'before' | 'during' | 'after'): string {
    const labels: Record<string, string> = {
      'neutral': 'Boucle par défaut',
      'before': 'Avant-match',
      'during': 'Match',
      'after': 'Après-match'
    };
    return labels[phase] || phase;
  }

  /**
   * Retourne l'icône de la phase
   */
  public getPhaseIcon(phase: 'neutral' | 'before' | 'during' | 'after'): string {
    const icons: Record<string, string> = {
      'neutral': '🔄',
      'before': '🏁',
      'during': '▶️',
      'after': '🏆'
    };
    return icons[phase] || '🔄';
  }

  /**
   * Vérifie si une phase a une boucle configurée
   */
  public hasLoopForPhase(phase: 'neutral' | 'before' | 'during' | 'after'): boolean {
    if (phase === 'neutral') {
      return (this.configuration?.sponsors?.length || 0) > 0;
    }
    const timeCategory = this.timeCategories.find(tc => tc.id === phase);
    return (timeCategory?.loopVideos?.length || 0) > 0;
  }

  /**
   * Retourne le nombre de vidéos dans la boucle de la phase
   */
  public getLoopVideoCount(phase: 'neutral' | 'before' | 'during' | 'after'): number {
    if (phase === 'neutral') {
      return this.configuration?.sponsors?.length || 0;
    }
    const timeCategory = this.timeCategories.find(tc => tc.id === phase);
    if (timeCategory?.loopVideos?.length) {
      return timeCategory.loopVideos.length;
    }
    // Fallback vers la boucle globale
    return this.configuration?.sponsors?.length || 0;
  }
}
