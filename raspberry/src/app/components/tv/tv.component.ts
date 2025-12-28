import { Component, ElementRef, inject, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import videojs from 'video.js';
import "videojs-playlist";
import Player from 'video.js/dist/types/player';
import { SocketService } from '../../services/socket.service';
import { AnalyticsService } from '../../services/analytics.service';
import { SponsorAnalyticsService } from '../../services/sponsor-analytics.service';
import { LocalBroadcastService, ScoreUpdateEvent, PhaseChangeEvent, OptionsUpdateEvent, BreakingNewsEvent, TimerUpdateEvent } from '../../services/local-broadcast.service';
import { LocalOptionsService, LocalOptions } from '../../services/local-options.service';
import { Video } from '../../interfaces/video.interface';
import { Configuration } from '../../interfaces/configuration.interface';
import { Command } from '../../interfaces/command.interface';
import { Sponsor } from '../../interfaces/sponsor.interface';
import { environment } from '../../../environments/environment';

interface PlaylistItem {
  sources: { src: string; type: string }[];
}

interface PlayerWithPlaylist extends Player {
  playlist: {
    (items: PlaylistItem[]): void;
    first(): void;
    repeat(value: boolean): void;
    autoadvance(delay: number): void;
  };
}

@Component({
  selector: 'app-tv',
  templateUrl: './tv.component.html',
  styleUrl: './tv.component.scss',
  imports: [CommonModule]
})
export class TvComponent implements OnInit, OnDestroy {
  private readonly socketService = inject(SocketService);
  private readonly analyticsService = inject(AnalyticsService);
  private readonly sponsorAnalytics = inject(SponsorAnalyticsService);
  private readonly localBroadcast = inject(LocalBroadcastService);
  private readonly localOptionsService = inject(LocalOptionsService);
  private readonly http = inject(HttpClient);

  private localBroadcastSubscriptions: Subscription[] = [];

  // Options locales (provenant de Remote)
  public localOptions: LocalOptions = this.localOptionsService.getOptions();

  // Timer local (pour mise à jour fluide)
  private localTimerInterval: ReturnType<typeof setInterval> | null = null;

  @Input() public configuration: Configuration;

  private lastTriggerType: 'auto' | 'manual' = 'auto';
  private currentSponsorIndex = 0;
  private currentEventType: 'match' | 'training' | 'tournament' | 'other' = 'other';
  private currentPeriod: 'pre_match' | 'halftime' | 'post_match' | 'loop' = 'loop';

  // Phase active pour la boucle vidéo
  public activePhase: 'neutral' | 'before' | 'during' | 'after' = 'neutral';
  private currentLoopVideos: Sponsor[] = [];

  // Live Score
  public currentScore: { homeTeam: string; awayTeam: string; homeScore: number; awayScore: number; period?: string; matchTime?: string } | null = null;
  public showScoreOverlay = false;

  // Goal Popup
  public showGoalPopup = false;
  public goalScoringTeam: 'home' | 'away' | null = null;
  private goalPopupTimeout: ReturnType<typeof setTimeout> | null = null;

  // Breaking News
  public showBreakingNews = false;
  public currentBreakingNews: BreakingNewsEvent | null = null;
  private breakingNewsTimeout: ReturnType<typeof setTimeout> | null = null;

  // Timer / Chronomètre
  public timerCurrentTime = 0;
  public timerIsRunning = false;
  public timerCountDown = false;
  public timerHalfDuration = 45;

  @ViewChild('target', { static: true }) target: ElementRef;

  public player: Player;

  public ngOnInit() {
    // Charger les options locales et s'abonner aux changements
    this.localOptions = this.localOptionsService.getOptions();
    this.localBroadcastSubscriptions.push(
      this.localOptionsService.getOptions$().subscribe((options) => {
        this.localOptions = options;
      })
    );

    // Configurer l'analytics service avec la configuration (pour le mapping des catégories)
    this.analyticsService.setConfiguration(this.configuration);

    // Configurer le service sponsor analytics
    this.sponsorAnalytics.setConfiguration(this.configuration);

    // Récupérer le site_id depuis l'API du serveur local
    this.loadSiteId();

    const options = {
      fullscreen: true,
      autoplay: true,
      muted: true, // Requis pour autoplay dans les navigateurs modernes (Chrome 66+, Safari 11+)
      controls: false,
      preload: "auto",
      plugins: {
        playlist: this.configuration.sponsors.map((sponsor) => ({ sources: [ { src: sponsor.path, type: sponsor.type }]}))
      }
    }

    this.player = videojs(this.target.nativeElement, options, () => {
      console.log('tv player is ready');
      this.player.poster('/neopro.png');
      this.sponsors();
    });

    // Activer le plein écran ET le son au premier clic/touche utilisateur
    const activateFullscreenAndUnmute = () => {
      // Activer le son (désactiver mute)
      this.player.muted(false);
      console.log('Sound unmuted after user interaction');

      // Activer le plein écran
      this.player.requestFullscreen().then(() => {
        console.log('fullscreen activated');
      }).catch((error) => {
        console.error('fullscreen issue', error);
      });
    };
    document.addEventListener('click', activateFullscreenAndUnmute, { once: true });
    document.addEventListener('keydown', activateFullscreenAndUnmute, { once: true });
    document.addEventListener('touchstart', activateFullscreenAndUnmute, { once: true });

    // Tracker les erreurs de lecture
    this.player.on('error', (error: Event) => {
      console.error('tv player error', error);
      // Tracker l'erreur si une vidéo était en cours
      const currentSrc = this.player.currentSrc();
      if (currentSrc) {
        this.analyticsService.trackVideoError({ name: 'unknown', path: currentSrc, type: 'video/mp4' }, error);
      }
      this.sponsors();
    });

    // Tracker le changement de vidéo dans la playlist (sponsors)
    this.player.on('play', () => {
      const currentSrc = this.player.currentSrc();
      console.log('[TV] Video play event:', { currentSrc, triggerType: this.lastTriggerType, phase: this.activePhase, loopCount: this.currentLoopVideos.length });
      if (currentSrc && this.lastTriggerType === 'auto') {
        // C'est une vidéo de la boucle active (selon la phase)
        const sponsor = this.currentLoopVideos.find(s => currentSrc.includes(s.path));
        console.log('[TV] Sponsor lookup:', { found: !!sponsor, loopPaths: this.currentLoopVideos.map(s => s.path) });
        if (sponsor) {
          this.analyticsService.trackVideoStart(sponsor, 'auto');

          // Tracker l'impression sponsor
          this.sponsorAnalytics.trackSponsorStart(
            sponsor,
            'auto',
            this.player.duration() || 0
          );
        } else {
          // Fallback: tracker quand même la vidéo même si pas trouvée dans sponsors
          // (peut arriver si le path ne matche pas exactement)
          const filename = currentSrc.split('/').pop() || 'unknown';
          console.warn('[TV] Sponsor not found for', currentSrc, '- tracking as fallback');
          this.analyticsService.trackVideoStart(
            { name: filename, path: currentSrc, type: 'video/mp4' },
            'auto'
          );
        }
      }
    });

    this.player.on('ended', () => {
      // Pour les vidéos de la boucle, tracker la fin
      if (this.lastTriggerType === 'auto') {
        this.analyticsService.trackVideoEnd(true);
        this.sponsorAnalytics.trackSponsorEnd(true);
      }
    });

    this.socketService.on('action', (command: Command) => {
      console.log('tv action received', command);
      if (command.type === 'video' && command.data) {
        this.lastTriggerType = 'manual';
        this.play(command.data as Video);
      } else if (command.type === 'sponsors') {
        this.lastTriggerType = 'auto';
        this.sponsors();
      } else if (command.type === 'reload-config' && command.data) {
        // Recharger la config d'un nouveau club (mode démo)
        console.log('tv: reloading config for club', command.data);
        this.reloadConfiguration(command.data as Configuration);
      }
    });

    // Live Score - Écouter les mises à jour de score
    this.socketService.on('score-update', (scoreData: { homeTeam: string; awayTeam: string; homeScore: number; awayScore: number; period?: string; matchTime?: string }) => {
      console.log('[TV] Score update received:', scoreData);
      this.handleScoreUpdate(scoreData);
    });

    // Live Score - Écouter le reset du score
    this.socketService.on('score-reset', () => {
      console.log('[TV] Score reset received');
      this.currentScore = null;
      this.showScoreOverlay = false;
    });

    // Live Score - Écouter les infos de match mises à jour
    this.socketService.on('match-info-updated', (matchInfo: { audienceEstimate?: number }) => {
      console.log('[TV] Match info updated:', matchInfo);
      // Mettre à jour le contexte analytics si nécessaire
      if (matchInfo.audienceEstimate) {
        this.updateAudienceEstimate(matchInfo.audienceEstimate);
      }
    });

    // Écouter les changements de phase (boucle par temps de match)
    this.socketService.on('phase-change', (data: { phase: 'neutral' | 'before' | 'during' | 'after' }) => {
      console.log('[TV] Phase change received:', data.phase);
      this.switchToPhase(data.phase);
    });

    // =========================================================================
    // COMMUNICATION LOCALE VIA BROADCASTCHANNEL
    // Permet à Remote et TV de communiquer directement sur le même appareil
    // sans passer par le serveur cloud
    // =========================================================================

    // Écouter les mises à jour de score via BroadcastChannel (local)
    this.localBroadcastSubscriptions.push(
      this.localBroadcast.onScoreUpdate().subscribe((scoreData: ScoreUpdateEvent) => {
        console.log('[TV] Local score update received:', scoreData);
        if (scoreData.reset) {
          // Reset du score
          this.currentScore = null;
          this.showScoreOverlay = false;
        } else {
          this.handleScoreUpdate(scoreData);
        }
      })
    );

    // Écouter les changements de phase via BroadcastChannel (local)
    this.localBroadcastSubscriptions.push(
      this.localBroadcast.onPhaseChange().subscribe((data: PhaseChangeEvent) => {
        console.log('[TV] Local phase change received:', data.phase);
        this.switchToPhase(data.phase);
      })
    );

    // Écouter les commandes via BroadcastChannel (local)
    this.localBroadcastSubscriptions.push(
      this.localBroadcast.onCommand().subscribe((command) => {
        console.log('[TV] Local command received:', command);
        if (command.type === 'video' && command.data) {
          this.lastTriggerType = 'manual';
          this.play(command.data as Video);
        } else if (command.type === 'sponsors') {
          this.lastTriggerType = 'auto';
          this.sponsors();
        } else if (command.type === 'reload-config' && command.data) {
          this.reloadConfiguration(command.data as Configuration);
        }
      })
    );

    // Écouter les mises à jour d'options via BroadcastChannel (local)
    this.localBroadcastSubscriptions.push(
      this.localBroadcast.onOptionsUpdate().subscribe((options: OptionsUpdateEvent) => {
        console.log('[TV] Local options update received:', options);
        this.localOptions = options as LocalOptions;

        // Masquer l'overlay si désactivé
        if (!options.overlay.scoreEnabled) {
          this.showScoreOverlay = false;
        }
      })
    );

    // Écouter les breaking news via BroadcastChannel (local)
    this.localBroadcastSubscriptions.push(
      this.localBroadcast.onBreakingNews().subscribe((news: BreakingNewsEvent) => {
        console.log('[TV] Breaking news received:', news);
        this.displayBreakingNews(news);
      })
    );

    // Écouter les mises à jour du timer via BroadcastChannel (local)
    this.localBroadcastSubscriptions.push(
      this.localBroadcast.onTimerUpdate().subscribe((timerEvent: TimerUpdateEvent) => {
        console.log('[TV] Timer update received:', timerEvent);
        this.handleTimerUpdate(timerEvent);
      })
    );
  }

  /**
   * Affiche une breaking news sur l'écran
   */
  private displayBreakingNews(news: BreakingNewsEvent): void {
    // Annuler un timeout précédent si existant
    if (this.breakingNewsTimeout) {
      clearTimeout(this.breakingNewsTimeout);
    }

    this.currentBreakingNews = news;
    this.showBreakingNews = true;

    // Masquer après la durée spécifiée
    this.breakingNewsTimeout = setTimeout(() => {
      this.showBreakingNews = false;
      this.currentBreakingNews = null;
    }, news.duration * 1000);
  }

  /**
   * Gère les mises à jour du timer (provenant de Remote)
   */
  private handleTimerUpdate(event: TimerUpdateEvent): void {
    if (event.currentTime !== undefined) {
      this.timerCurrentTime = event.currentTime;
    }
    if (event.halfDuration !== undefined) {
      this.timerHalfDuration = event.halfDuration;
    }
    if (event.countDown !== undefined) {
      this.timerCountDown = event.countDown;
    }

    // Gérer les actions du timer
    if (event.action === 'start' && !this.timerIsRunning) {
      this.timerIsRunning = true;
      this.startLocalTimer();
    } else if (event.action === 'pause' && this.timerIsRunning) {
      this.timerIsRunning = false;
      this.stopLocalTimer();
    } else if (event.action === 'reset') {
      this.timerIsRunning = false;
      this.stopLocalTimer();
    } else if (event.action === 'sync') {
      // Sync: mettre à jour isRunning si différent
      if (event.isRunning !== undefined && event.isRunning !== this.timerIsRunning) {
        this.timerIsRunning = event.isRunning;
        if (this.timerIsRunning && !this.localTimerInterval) {
          this.startLocalTimer();
        } else if (!this.timerIsRunning && this.localTimerInterval) {
          this.stopLocalTimer();
        }
      }
    }
  }

  /**
   * Démarre le timer local pour mise à jour fluide chaque seconde
   */
  private startLocalTimer(): void {
    if (this.localTimerInterval) return;

    this.localTimerInterval = setInterval(() => {
      if (this.timerCountDown) {
        // Compte à rebours
        if (this.timerCurrentTime > 0) {
          this.timerCurrentTime--;
        }
      } else {
        // Compteur croissant
        const maxTime = this.timerHalfDuration * 60;
        if (this.timerCurrentTime < maxTime) {
          this.timerCurrentTime++;
        }
      }
    }, 1000);
  }

  /**
   * Arrête le timer local
   */
  private stopLocalTimer(): void {
    if (this.localTimerInterval) {
      clearInterval(this.localTimerInterval);
      this.localTimerInterval = null;
    }
  }

  /**
   * Formate le temps du timer en MM:SS
   */
  public formatTimerDisplay(): string {
    const mins = Math.floor(this.timerCurrentTime / 60);
    const secs = this.timerCurrentTime % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Styles dynamiques pour l'overlay timer (standalone)
   */
  public getTimerOverlayStyles(): Record<string, string> {
    const config = this.configuration?.scoreOverlay;
    const position = config?.position || 'top-right';
    const offsetX = (config?.offsetX ?? 20) + 'px';
    const offsetY = (config?.offsetY ?? 20) + 'px';

    const styles: Record<string, string> = {
      'background': config?.backgroundColor || 'rgba(0, 0, 0, 0.85)',
      'border-radius': (config?.borderRadius ?? 12) + 'px'
    };

    // Position dynamique (même logique que score overlay)
    if (position.includes('top')) {
      styles['top'] = offsetY;
      styles['bottom'] = 'auto';
    } else {
      styles['bottom'] = offsetY;
      styles['top'] = 'auto';
    }

    if (position.includes('right')) {
      styles['right'] = offsetX;
      styles['left'] = 'auto';
    } else {
      styles['left'] = offsetX;
      styles['right'] = 'auto';
    }

    return styles;
  }

  public ngOnDestroy() {
    // Terminer la session analytics
    this.analyticsService.endSession();

    // Arrêter le timer local
    this.stopLocalTimer();

    // Se désabonner des événements BroadcastChannel
    this.localBroadcastSubscriptions.forEach(sub => sub.unsubscribe());
    this.localBroadcastSubscriptions = [];

    if (this.player) {
      this.player.dispose();
    }
  }

  private play(video: Video) {
    console.log('tv player : play video', video.path);

    // Tracker le début de la vidéo manuelle
    this.analyticsService.trackVideoStart(video, 'manual');

    // Si c'est une vidéo de la boucle courante déclenchée manuellement, tracker l'impression
    const isSponsor = this.currentLoopVideos.some(s => s.path === video.path);
    if (isSponsor) {
      this.sponsorAnalytics.trackSponsorStart(video, 'manual', this.player.duration() || 0);
    }

    this.player.src({ src: video.path, type: video.type });
    this.player.one('ended', () => {
      console.log('tv player : video ended', video.path);
      // Tracker la fin de la vidéo manuelle
      this.analyticsService.trackVideoEnd(true);

      // Tracker fin de l'impression sponsor si applicable
      if (isSponsor) {
        this.sponsorAnalytics.trackSponsorEnd(true);
      }

      this.lastTriggerType = 'auto';
      this.sponsors();
    });
    this.player.play();
  }

  private sponsors() {
    console.log('[TV] Play loop for phase:', this.activePhase);

    // Récupérer les vidéos de la boucle selon la phase active
    const loopVideos = this.getLoopVideosForPhase(this.activePhase);
    this.currentLoopVideos = loopVideos;

    // Mettre à jour la playlist
    const playlist = loopVideos.map((video) => ({
      sources: [{ src: video.path, type: video.type }]
    }));

    if (playlist.length > 0) {
      (this.player as PlayerWithPlaylist).playlist(playlist);
      (this.player as PlayerWithPlaylist).playlist.first();
      (this.player as PlayerWithPlaylist).playlist.repeat(true);
      (this.player as PlayerWithPlaylist).playlist.autoadvance(0);
    } else {
      console.warn('[TV] No videos in loop for phase:', this.activePhase);
    }
  }

  /**
   * Récupère les vidéos de la boucle pour une phase donnée.
   * Si la phase n'a pas de loopVideos configurés, utilise sponsors[] global.
   */
  private getLoopVideosForPhase(phase: 'neutral' | 'before' | 'during' | 'after'): Sponsor[] {
    if (phase === 'neutral') {
      return this.configuration.sponsors || [];
    }

    const timeCategory = this.configuration.timeCategories?.find(tc => tc.id === phase);
    if (timeCategory?.loopVideos && timeCategory.loopVideos.length > 0) {
      return timeCategory.loopVideos;
    }

    // Fallback: utiliser la boucle globale
    return this.configuration.sponsors || [];
  }

  /**
   * Change la phase active et recharge la boucle correspondante.
   * Met également à jour le contexte analytics.
   */
  public switchToPhase(phase: 'neutral' | 'before' | 'during' | 'after'): void {
    console.log('[TV] Switching to phase:', phase);
    this.activePhase = phase;

    // Mapper la phase vers la période analytics
    const periodMap: Record<string, 'pre_match' | 'halftime' | 'post_match' | 'loop'> = {
      'neutral': 'loop',
      'before': 'pre_match',
      'during': 'halftime',
      'after': 'post_match'
    };
    const period = periodMap[phase];
    this.updatePeriod(period);

    // Recharger la boucle avec les vidéos de la phase
    this.lastTriggerType = 'auto';
    this.sponsors();
  }

  private reloadConfiguration(config: Configuration) {
    console.log('tv: updating configuration and playlist');
    this.configuration = config;

    // Mettre à jour la configuration dans l'analytics service
    this.analyticsService.setConfiguration(config);
    this.sponsorAnalytics.setConfiguration(config);

    // Réinitialiser à la phase neutre
    this.activePhase = 'neutral';
    this.updatePeriod('loop');

    // Lancer la nouvelle boucle (sponsors() gère maintenant la playlist selon la phase)
    this.lastTriggerType = 'auto';
    this.sponsors();
  }

  /**
   * Méthodes publiques pour contrôler le contexte analytics sponsors
   * (appelées depuis la télécommande ou des événements externes)
   */
  public setEventContext(
    eventType: 'match' | 'training' | 'tournament' | 'other',
    period?: 'pre_match' | 'halftime' | 'post_match' | 'loop',
    audienceEstimate?: number
  ): void {
    this.currentEventType = eventType;
    this.sponsorAnalytics.setEventType(eventType);

    if (period) {
      this.currentPeriod = period;
      this.sponsorAnalytics.setPeriod(period);
    }

    if (audienceEstimate !== undefined) {
      this.sponsorAnalytics.setAudienceEstimate(audienceEstimate);
    }

    console.log('[TV] Event context updated:', { eventType, period, audienceEstimate });
  }

  public updatePeriod(period: 'pre_match' | 'halftime' | 'post_match' | 'loop'): void {
    this.currentPeriod = period;
    this.sponsorAnalytics.setPeriod(period);
    console.log('[TV] Period updated:', period);
  }

  public updateAudienceEstimate(estimate: number): void {
    this.sponsorAnalytics.setAudienceEstimate(estimate);
    console.log('[TV] Audience estimate updated:', estimate);
  }

  /**
   * Gère la mise à jour du score en direct
   */
  private handleScoreUpdate(scoreData: {
    homeTeam: string;
    awayTeam: string;
    homeScore: number;
    awayScore: number;
    period?: string;
    matchTime?: string;
  }): void {
    // Détecter si un but a été marqué (et par quelle équipe)
    if (this.currentScore && this.localOptions.overlay.goalPopupEnabled) {
      const homeScored = scoreData.homeScore > this.currentScore.homeScore;
      const awayScored = scoreData.awayScore > this.currentScore.awayScore;

      if (homeScored || awayScored) {
        this.triggerGoalPopup(homeScored ? 'home' : 'away');
      }
    }

    this.currentScore = scoreData;

    // Afficher l'overlay selon les options
    if (this.localOptions.overlay.scoreEnabled) {
      this.showScoreOverlay = true;
    }
  }

  /**
   * Déclenche l'animation de but (popup centrale)
   */
  private triggerGoalPopup(team: 'home' | 'away'): void {
    // Annuler un timeout précédent si existant
    if (this.goalPopupTimeout) {
      clearTimeout(this.goalPopupTimeout);
    }

    this.goalScoringTeam = team;
    this.showGoalPopup = true;

    console.log('[TV] Goal popup triggered for team:', team);

    // Masquer après 4 secondes
    this.goalPopupTimeout = setTimeout(() => {
      this.showGoalPopup = false;
      this.goalScoringTeam = null;
    }, 4000);
  }

  /**
   * Toggle manuel de l'overlay score (appelé par commande remote)
   */
  public toggleScoreOverlay(): void {
    this.showScoreOverlay = !this.showScoreOverlay;
  }

  /**
   * Styles dynamiques pour l'overlay du score
   * Utilise la configuration scoreOverlay si disponible, sinon valeurs par défaut
   */
  public getOverlayStyles(): Record<string, string> {
    const config = this.configuration?.scoreOverlay;
    const position = config?.position || 'top-right';
    const offsetX = (config?.offsetX ?? 20) + 'px';
    const offsetY = (config?.offsetY ?? 20) + 'px';

    const styles: Record<string, string> = {
      'background': config?.backgroundColor || 'rgba(0, 0, 0, 0.85)',
      'border-radius': (config?.borderRadius ?? 12) + 'px'
    };

    // Position dynamique
    if (position.includes('top')) {
      styles['top'] = offsetY;
      styles['bottom'] = 'auto';
    } else {
      styles['bottom'] = offsetY;
      styles['top'] = 'auto';
    }

    if (position.includes('right')) {
      styles['right'] = offsetX;
      styles['left'] = 'auto';
    } else {
      styles['left'] = offsetX;
      styles['right'] = 'auto';
    }

    return styles;
  }

  /**
   * Styles dynamiques pour les scores
   */
  public getScoreStyles(): Record<string, string> {
    const config = this.configuration?.scoreOverlay;
    return {
      'color': config?.scoreColor || '#4caf50',
      'font-size': (config?.scoreSize ?? 28) + 'px'
    };
  }

  /**
   * Styles dynamiques pour les noms d'équipe
   */
  public getTeamNameStyles(): Record<string, string> {
    const config = this.configuration?.scoreOverlay;
    return {
      'color': config?.teamNameColor || '#ffffff',
      'font-size': (config?.teamNameSize ?? 16) + 'px'
    };
  }

  /**
   * Récupère le site_id depuis l'API du serveur local et configure le service analytics
   */
  private loadSiteId(): void {
    const siteInfoUrl = `${environment.socketUrl}/api/site-info`;
    this.http.get<{ siteId: string | null; siteName: string | null; configured: boolean }>(siteInfoUrl)
      .subscribe({
        next: (response) => {
          if (response.siteId) {
            this.sponsorAnalytics.setSiteId(response.siteId);
            console.log('[TV] Site ID loaded for sponsor analytics:', response.siteId);
          } else {
            console.warn('[TV] No site ID configured - sponsor analytics will not include site_id');
          }
        },
        error: (error) => {
          console.error('[TV] Failed to load site info:', error.message || error);
        }
      });
  }

}
