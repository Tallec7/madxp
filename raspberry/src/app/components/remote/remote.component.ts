import { Component, inject, NgZone, OnInit } from '@angular/core';
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
import { LocalBroadcastService, TimerUpdateEvent } from '../../services/local-broadcast.service';
import { LocalOptionsService, LocalOptions } from '../../services/local-options.service';
import { ClubSelectorComponent } from '../club-selector/club-selector.component';

type ViewType = 'club-selector' | 'home' | 'time-categories' | 'subcategories' | 'videos' | 'all-videos' | 'options';

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
  private readonly localBroadcast = inject(LocalBroadcastService);
  private readonly localOptionsService = inject(LocalOptionsService);
  private readonly ngZone = inject(NgZone);

  public configuration!: Configuration;

  // Options locales
  public localOptions: LocalOptions = this.localOptionsService.getOptions();
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
  public isScorePanelExpanded = false;
  public currentScore = {
    homeTeam: 'DOMICILE',
    awayTeam: 'EXTÉRIEUR',
    homeScore: 0,
    awayScore: 0
  };

  // Phase active de la boucle vidéo
  public activePhase: 'neutral' | 'before' | 'during' | 'after' = 'neutral';
  public readonly matchPhases: ('before' | 'during' | 'after')[] = ['before', 'during', 'after'];
  public isPhaseDropdownOpen = false;

  // Toast notification
  public showToast = false;
  public toastMessage = '';
  public toastType: 'success' | 'info' = 'success';
  private toastTimeout: ReturnType<typeof setTimeout> | null = null;

  // Video en cours de lecture (pour état visuel)
  public playingVideoPath: string | null = null;

  // Vidéos récemment lancées
  public recentVideos: Video[] = [];
  private readonly MAX_RECENT_VIDEOS = 5;

  // Loading state
  public isLoading = false;

  // Dark mode
  public isDarkMode = false;

  // Menu header (pour simplifier le header)
  public isHeaderMenuOpen = false;

  // Swipe gesture tracking
  private touchStartX = 0;
  private touchStartY = 0;
  private readonly SWIPE_THRESHOLD = 50;

  // Thumbnails - URL de base du serveur admin (port 8080)
  private readonly ADMIN_BASE_URL = 'http://' + (typeof window !== 'undefined' ? window.location.hostname : 'localhost') + ':8080';

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

    // Charger le dark mode depuis localStorage
    this.isDarkMode = localStorage.getItem('darkMode') === 'true';
    this.applyDarkMode();

    // Charger les vidéos récentes depuis localStorage
    this.loadRecentVideos();

    if (this.isDemoMode) {
      // En mode démo, on commence par la sélection du club
      this.currentView = 'club-selector';
    } else {
      // Mode normal : charger la config depuis le resolver
      const data = this.route.snapshot.data['configuration'] as Configuration;
      this.initializeWithConfiguration(data);
    }

    // Écouter le score envoyé par le serveur
    this.socketService.on('score-update', (scoreData: { homeTeam: string; awayTeam: string; homeScore: number; awayScore: number }) => {
      console.log('[Remote] Score received from server:', scoreData);
      this.ngZone.run(() => {
        this.currentScore = {
          homeTeam: scoreData.homeTeam || this.currentScore.homeTeam,
          awayTeam: scoreData.awayTeam || this.currentScore.awayTeam,
          homeScore: scoreData.homeScore ?? this.currentScore.homeScore,
          awayScore: scoreData.awayScore ?? this.currentScore.awayScore
        };
      });
    });

    // Écouter la phase envoyée par le serveur
    this.socketService.on('phase-change', (data: { phase: 'neutral' | 'before' | 'during' | 'after' }) => {
      console.log('[Remote] Phase received from server:', data.phase);
      this.ngZone.run(() => {
        this.activePhase = data.phase;
      });
    });

    // Demander l'état actuel au serveur (le message initial peut avoir été manqué pendant le routing)
    this.socketService.emit('request-state', {});
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

    // Si on est dans "toutes les vidéos" ou "options", on revient à home
    if (this.currentView === 'all-videos' || this.currentView === 'options') {
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

    // Ajouter aux vidéos récentes
    this.addToRecentVideos(video);

    // Feedback visuel
    this.playingVideoPath = video.path;
    this.displayToast(`${video.name} lancée sur l'écran`, 'success');

    // Reset après 3 secondes
    setTimeout(() => {
      this.playingVideoPath = null;
    }, 3000);
  }

  /**
   * Affiche un toast de notification
   */
  private displayToast(message: string, type: 'success' | 'info' = 'success'): void {
    // Clear previous timeout
    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
    }

    this.toastMessage = message;
    this.toastType = type;
    this.showToast = true;

    this.toastTimeout = setTimeout(() => {
      this.showToast = false;
    }, 3000);
  }

  /**
   * Retourne le nom de la catégorie d'une vidéo
   */
  public getVideoCategoryName(video: Video): string {
    if (!video.categoryId) return '';

    const findCategory = (categories: Category[]): string => {
      for (const cat of categories) {
        if (cat.id === video.categoryId) return cat.name;
        if (cat.subCategories) {
          const found = findCategory(cat.subCategories);
          if (found) return found;
        }
      }
      return '';
    };

    return findCategory(this.configuration?.categories || []);
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
    this.isLoading = true;
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
        this.isLoading = false;
        this.displayToast('Configuration mise à jour', 'success');
      },
      error: (err) => {
        console.error('Erreur lors du rechargement de la configuration', err);
        this.isReloading = false;
        this.isLoading = false;
        this.displayToast('Erreur de chargement', 'info');
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
   * Envoie le score à la TV via BroadcastChannel (local) + Socket (cloud)
   */
  public broadcastScore(): void {
    const scoreData = {
      homeTeam: this.currentScore.homeTeam,
      awayTeam: this.currentScore.awayTeam,
      homeScore: this.currentScore.homeScore,
      awayScore: this.currentScore.awayScore
    };

    // Communication locale (Remote ↔ TV sur le même Raspberry)
    this.localBroadcast.emitScoreUpdate(scoreData);

    // Communication cloud (pour monitoring/dashboard)
    this.socketService.emit('score-update', scoreData);
  }

  /**
   * Réinitialise le score
   */
  public resetScore(): void {
    this.currentScore.homeScore = 0;
    this.currentScore.awayScore = 0;

    // Communication locale
    this.localBroadcast.emitScoreReset();

    // Communication cloud
    this.socketService.emit('score-update', {
      homeTeam: this.currentScore.homeTeam,
      awayTeam: this.currentScore.awayTeam,
      homeScore: 0,
      awayScore: 0
    });
  }

  /**
   * Toggle le panneau de score en bas de l'écran
   */
  public toggleScorePanel(): void {
    this.isScorePanelExpanded = !this.isScorePanelExpanded;
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
   * Toggle le dropdown de sélection de phase
   */
  public togglePhaseDropdown(): void {
    this.isPhaseDropdownOpen = !this.isPhaseDropdownOpen;
  }

  /**
   * Sélectionne une phase depuis le dropdown
   */
  public selectPhase(phase: 'neutral' | 'before' | 'during' | 'after'): void {
    this.switchPhase(phase);
    this.isPhaseDropdownOpen = false;
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

  // ============================================================================
  // DARK MODE
  // ============================================================================

  /**
   * Toggle le mode sombre
   */
  public toggleDarkMode(): void {
    this.isDarkMode = !this.isDarkMode;
    localStorage.setItem('darkMode', String(this.isDarkMode));
    this.applyDarkMode();
  }

  /**
   * Applique le mode sombre au DOM
   */
  private applyDarkMode(): void {
    if (this.isDarkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  }

  /**
   * Toggle le menu header
   */
  public toggleHeaderMenu(): void {
    this.isHeaderMenuOpen = !this.isHeaderMenuOpen;
  }

  /**
   * Ferme le menu header
   */
  public closeHeaderMenu(): void {
    this.isHeaderMenuOpen = false;
  }

  // ============================================================================
  // VIDÉOS RÉCENTES
  // ============================================================================

  /**
   * Charge les vidéos récentes depuis localStorage
   */
  private loadRecentVideos(): void {
    try {
      const stored = localStorage.getItem('recentVideos');
      if (stored) {
        this.recentVideos = JSON.parse(stored);
      }
    } catch {
      this.recentVideos = [];
    }
  }

  /**
   * Ajoute une vidéo aux récents
   */
  private addToRecentVideos(video: Video): void {
    // Retirer si déjà présente
    this.recentVideos = this.recentVideos.filter(v => v.path !== video.path);
    // Ajouter au début
    this.recentVideos.unshift(video);
    // Limiter à MAX_RECENT_VIDEOS
    this.recentVideos = this.recentVideos.slice(0, this.MAX_RECENT_VIDEOS);
    // Sauvegarder
    localStorage.setItem('recentVideos', JSON.stringify(this.recentVideos));
  }

  // ============================================================================
  // SWIPE GESTURES
  // ============================================================================

  /**
   * Gestionnaire de début de touch
   */
  public onTouchStart(event: TouchEvent): void {
    this.touchStartX = event.touches[0].clientX;
    this.touchStartY = event.touches[0].clientY;
  }

  /**
   * Gestionnaire de fin de touch
   */
  public onTouchEnd(event: TouchEvent): void {
    const touchEndX = event.changedTouches[0].clientX;
    const touchEndY = event.changedTouches[0].clientY;

    const deltaX = touchEndX - this.touchStartX;
    const deltaY = touchEndY - this.touchStartY;

    // Vérifier que c'est un swipe horizontal (pas vertical)
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > this.SWIPE_THRESHOLD) {
      if (deltaX > 0) {
        // Swipe vers la droite = retour
        this.onSwipeRight();
      }
    }
  }

  /**
   * Action sur swipe vers la droite (retour)
   */
  private onSwipeRight(): void {
    // Ne pas swiper si on est à la racine
    if (this.currentView === 'home' && !this.isSearching) {
      return;
    }

    // Retour arrière
    this.handleBack();
  }

  // ============================================================================
  // THUMBNAILS
  // ============================================================================

  /**
   * Construit l'URL du thumbnail pour une vidéo
   * Les thumbnails sont générés par le video-processor et stockés dans /home/pi/neopro/thumbnails/
   * Structure: thumbnails/{category}/{subcategory?}/{videoname}.jpg
   * Servies par le serveur admin sur le port 8080
   */
  public getVideoThumbnailUrl(video: Video): string | null {
    if (!video.path) return null;

    // Le path de la vidéo est relatif: videos/{category}/{subcategory?}/{filename}.mp4
    // On remplace "videos/" par "thumbnails/" et l'extension par ".jpg"
    const thumbnailPath = video.path
      .replace(/^videos\//, 'thumbnails/')
      .replace(/\.\w+$/, '.jpg');

    return `${this.ADMIN_BASE_URL}/${thumbnailPath}`;
  }

  /**
   * Gère l'erreur de chargement du thumbnail (fallback sur icône)
   */
  public onThumbnailError(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (img) {
      img.style.display = 'none';
      // Le parent affichera l'icône SVG comme fallback
      const parent = img.parentElement;
      if (parent) {
        parent.classList.add('thumbnail-error');
      }
    }
  }

  // ============================================================================
  // OPTIONS LOCALES
  // ============================================================================

  /**
   * Ouvre la page des options
   */
  public openOptions(): void {
    this.currentView = 'options';
    this.breadcrumb = ['Télécommande', 'Options'];
    this.closeHeaderMenu();
  }

  /**
   * Met à jour une option d'overlay
   */
  public updateOverlayOption(key: keyof LocalOptions['overlay'], value: boolean): void {
    this.localOptionsService.updateOverlayOptions({ [key]: value });
    this.localOptions = this.localOptionsService.getOptions();
    // Broadcast aux composants TV
    this.localBroadcast.broadcast('options-update', this.localOptions);
  }

  /**
   * Met à jour une option du timer
   */
  public updateTimerOption<K extends keyof LocalOptions['timer']>(
    key: K,
    value: LocalOptions['timer'][K]
  ): void {
    this.localOptionsService.updateTimerOptions({ [key]: value });
    this.localOptions = this.localOptionsService.getOptions();
    this.localBroadcast.broadcast('options-update', this.localOptions);
  }

  /**
   * Met à jour une option de breaking news
   */
  public updateBreakingNewsOption<K extends keyof LocalOptions['breakingNews']>(
    key: K,
    value: LocalOptions['breakingNews'][K]
  ): void {
    this.localOptionsService.updateBreakingNewsOptions({ [key]: value });
    this.localOptions = this.localOptionsService.getOptions();
    this.localBroadcast.broadcast('options-update', this.localOptions);
  }

  /**
   * Change le template actif
   */
  public setTemplate(template: LocalOptions['template']): void {
    this.localOptionsService.setTemplate(template);
    this.localOptions = this.localOptionsService.getOptions();
    this.localBroadcast.broadcast('options-update', this.localOptions);
  }

  /**
   * Ajoute un message rapide personnalisé
   */
  public addQuickMessage(message: string): void {
    if (message.trim()) {
      this.localOptionsService.addQuickMessage(message);
      this.localOptions = this.localOptionsService.getOptions();
    }
  }

  /**
   * Supprime un message rapide
   */
  public removeQuickMessage(index: number): void {
    this.localOptionsService.removeQuickMessage(index);
    this.localOptions = this.localOptionsService.getOptions();
  }

  /**
   * Réinitialise les options par défaut
   */
  public resetOptions(): void {
    this.localOptionsService.resetToDefaults();
    this.localOptions = this.localOptionsService.getOptions();
    this.localBroadcast.broadcast('options-update', this.localOptions);
    this.displayToast('Options réinitialisées', 'success');
  }

  /**
   * Durées de mi-temps disponibles (en minutes)
   */
  public readonly halfDurations = [15, 20, 25, 30, 35, 40, 45];

  /**
   * Durées d'affichage breaking news disponibles (en secondes)
   */
  public readonly newsDurations = [5, 10, 15, 20, 30];

  // ============================================================================
  // BREAKING NEWS
  // ============================================================================

  public showBreakingNewsPanel = false;
  public breakingNewsMessage = '';

  // ============================================================================
  // TIMER / CHRONOMÈTRE
  // ============================================================================

  public timerCurrentTime = 0; // temps en secondes
  public timerIsRunning = false;
  private timerInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Ouvre/ferme le panneau de saisie des breaking news
   */
  public toggleBreakingNewsPanel(): void {
    if (!this.localOptions.breakingNews.enabled) {
      this.displayToast('Activez les annonces dans les Options', 'info');
      return;
    }
    this.showBreakingNewsPanel = !this.showBreakingNewsPanel;
  }

  /**
   * Envoie une breaking news à la TV
   */
  public sendBreakingNews(message?: string): void {
    const text = message || this.breakingNewsMessage.trim();
    if (!text) return;

    this.localBroadcast.emitBreakingNews({
      message: text,
      duration: this.localOptions.breakingNews.defaultDuration,
      position: this.localOptions.breakingNews.position,
      displayMode: this.localOptions.breakingNews.displayMode
    });

    this.breakingNewsMessage = '';
    this.showBreakingNewsPanel = false;
    this.displayToast('Annonce envoyée', 'success');
  }

  /**
   * Envoie un message rapide prédéfini
   */
  public sendQuickNews(message: string): void {
    this.sendBreakingNews(message);
  }

  // ============================================================================
  // TIMER CONTROLS
  // ============================================================================

  /**
   * Démarre ou met en pause le chronomètre
   */
  public toggleTimer(): void {
    if (this.timerIsRunning) {
      this.pauseTimer();
    } else {
      this.startTimer();
    }
  }

  /**
   * Démarre le chronomètre
   */
  public startTimer(): void {
    if (this.timerIsRunning) return;

    this.timerIsRunning = true;

    // Émettre l'événement start
    this.localBroadcast.emitTimerUpdate({
      action: 'start',
      currentTime: this.timerCurrentTime,
      isRunning: true,
      halfDuration: this.localOptions.timer.halfDuration,
      countDown: this.localOptions.timer.countDown
    });

    // Démarrer le timer local
    this.timerInterval = setInterval(() => {
      if (this.localOptions.timer.countDown) {
        // Compte à rebours
        if (this.timerCurrentTime > 0) {
          this.timerCurrentTime--;
        } else {
          this.pauseTimer();
          this.displayToast('Mi-temps terminée !', 'info');
        }
      } else {
        // Compteur croissant
        const maxTime = this.localOptions.timer.halfDuration * 60;
        if (this.timerCurrentTime < maxTime) {
          this.timerCurrentTime++;
        } else {
          this.pauseTimer();
          this.displayToast('Mi-temps terminée !', 'info');
        }
      }

      // Synchroniser toutes les 5 secondes
      if (this.timerCurrentTime % 5 === 0) {
        this.syncTimer();
      }
    }, 1000);

    this.displayToast('Chronomètre démarré', 'success');
  }

  /**
   * Met en pause le chronomètre
   */
  public pauseTimer(): void {
    if (!this.timerIsRunning) return;

    this.timerIsRunning = false;

    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    // Émettre l'événement pause
    this.localBroadcast.emitTimerUpdate({
      action: 'pause',
      currentTime: this.timerCurrentTime,
      isRunning: false
    });

    this.displayToast('Chronomètre en pause', 'info');
  }

  /**
   * Réinitialise le chronomètre
   */
  public resetTimer(): void {
    this.pauseTimer();

    // Réinitialiser selon le mode
    if (this.localOptions.timer.countDown) {
      this.timerCurrentTime = this.localOptions.timer.halfDuration * 60;
    } else {
      this.timerCurrentTime = 0;
    }

    // Émettre l'événement reset
    this.localBroadcast.emitTimerUpdate({
      action: 'reset',
      currentTime: this.timerCurrentTime,
      isRunning: false,
      halfDuration: this.localOptions.timer.halfDuration,
      countDown: this.localOptions.timer.countDown
    });

    this.displayToast('Chronomètre réinitialisé', 'success');
  }

  /**
   * Synchronise le timer avec la TV
   */
  private syncTimer(): void {
    this.localBroadcast.emitTimerUpdate({
      action: 'sync',
      currentTime: this.timerCurrentTime,
      isRunning: this.timerIsRunning,
      halfDuration: this.localOptions.timer.halfDuration,
      countDown: this.localOptions.timer.countDown
    });
  }

  /**
   * Formate le temps en MM:SS
   */
  public formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Temps d'affichage (selon mode countdown ou non)
   */
  public getDisplayTime(): string {
    return this.formatTime(this.timerCurrentTime);
  }
}
