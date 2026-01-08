import { Component, ElementRef, inject, Input, OnDestroy, OnInit, ViewChild, NgZone, ViewEncapsulation } from '@angular/core';
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
import { LocalOptionsService, LocalOptions, GoalAnimationConfig, TeamConfig } from '../../services/local-options.service';
import { Video } from '../../interfaces/video.interface';
import { Configuration, OverlayPosition, SportType } from '../../interfaces/configuration.interface';
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
  imports: [CommonModule],
  encapsulation: ViewEncapsulation.None // Désactiver l'encapsulation pour le double-buffer
})
export class TvComponent implements OnInit, OnDestroy {
  private readonly socketService = inject(SocketService);
  private readonly analyticsService = inject(AnalyticsService);
  private readonly sponsorAnalytics = inject(SponsorAnalyticsService);
  private readonly localBroadcast = inject(LocalBroadcastService);
  private readonly localOptionsService = inject(LocalOptionsService);
  private readonly http = inject(HttpClient);
  private readonly ngZone = inject(NgZone);

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

  // Live Score - structure enrichie avec logos et période
  public currentScore: {
    homeTeam: string;
    awayTeam: string;
    homeScore: number;
    awayScore: number;
    homeLogo?: string;
    awayLogo?: string;
    period?: string;
    matchTime?: string;
  } | null = null;
  public showScoreOverlay = false;

  // Goal Animation (remplace goalPopup)
  public showGoalAnimation = false;
  public goalScoringTeam: 'home' | 'away' | null = null;
  private goalAnimationTimeout: ReturnType<typeof setTimeout> | null = null;
  private goalAudio: HTMLAudioElement | null = null;

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

  // Double-buffer video system
  @ViewChild('playerA', { static: true }) playerARef: ElementRef<HTMLVideoElement>;
  @ViewChild('playerB', { static: true }) playerBRef: ElementRef<HTMLVideoElement>;

  // État de la boucle
  public isLoopMode = true;
  private currentLoopIndex = 0;
  private playerA: HTMLVideoElement;
  private playerB: HTMLVideoElement;
  private activePlayer: 'A' | 'B' = 'A'; // Quel player est actuellement visible
  private isStartingLoop = false;
  private pendingSwitch = false; // Évite les switchs multiples

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

    // Initialiser le double-buffer
    this.initDoubleBuffer();

    // Lancer la boucle vidéo
    this.startSeamlessLoop();

    // Legacy Video.js (gardé pour compatibilité mais non utilisé)
    const options = {
      fullscreen: true,
      autoplay: false, // Désactivé car on utilise le player natif
      muted: true,
      controls: false,
      preload: "none"
    }

    this.player = videojs(this.target.nativeElement, options, () => {
      console.log('tv legacy player ready (not used)');
    });

    // Activer le plein écran ET le son au premier clic/touche utilisateur
    const activateFullscreenAndUnmute = () => {
      // Activer le son sur les deux players
      if (this.playerA) this.playerA.muted = false;
      if (this.playerB) this.playerB.muted = false;

      console.log('Sound unmuted after user interaction');

      // Activer le plein écran sur le document
      const elem = document.documentElement;
      if (elem.requestFullscreen) {
        elem.requestFullscreen().then(() => {
          console.log('fullscreen activated');
        }).catch((error) => {
          console.error('fullscreen issue', error);
        });
      }
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

    // Écouter les mises à jour d'options via Socket.IO (réseau)
    this.socketService.on<OptionsUpdateEvent>('options-update', (options) => {
      console.log('[TV] Options update received via socket:', options);
      this.localOptions = options as LocalOptions;
      if (!options.overlay.scoreEnabled) {
        this.showScoreOverlay = false;
      }
    });

    // Écouter les breaking news via Socket.IO (réseau)
    this.socketService.on<BreakingNewsEvent>('breaking-news', (news) => {
      console.log('[TV] Breaking news received via socket:', news);
      this.displayBreakingNews(news);
    });

    // Écouter les mises à jour du timer via Socket.IO (réseau)
    this.socketService.on<TimerUpdateEvent>('timer-update', (timerEvent) => {
      console.log('[TV] Timer update received via socket:', timerEvent);
      this.handleTimerUpdate(timerEvent);
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

    // Arrêter la boucle seamless
    this.stopSeamlessLoop();

    // Se désabonner des événements BroadcastChannel
    this.localBroadcastSubscriptions.forEach(sub => sub.unsubscribe());
    this.localBroadcastSubscriptions = [];

    if (this.player) {
      this.player.dispose();
    }
  }

  private play(video: Video) {
    console.log('tv player : play manual video', video.path);

    // Arrêter la boucle pour passer en mode manuel
    this.stopSeamlessLoop();

    // Tracker le début de la vidéo manuelle
    this.analyticsService.trackVideoStart(video, 'manual');

    // Si c'est une vidéo de la boucle courante déclenchée manuellement, tracker l'impression
    const isSponsor = this.currentLoopVideos.some(s => s.path === video.path);
    if (isSponsor) {
      this.sponsorAnalytics.trackSponsorStart(video, 'manual', 0);
    }

    // Utiliser le player actif pour les vidéos manuelles
    const currentPlayer = this.getActivePlayer();
    currentPlayer.src = video.path;
    currentPlayer.load();

    // Listener pour la fin de la vidéo manuelle
    const onManualEnded = () => {
      console.log('tv player : manual video ended', video.path);
      currentPlayer.removeEventListener('ended', onManualEnded);

      // Tracker la fin
      this.analyticsService.trackVideoEnd(true);
      if (isSponsor) {
        this.sponsorAnalytics.trackSponsorEnd(true);
      }

      this.lastTriggerType = 'auto';
      // Redémarrer la boucle
      this.restartSeamlessLoop();
    };

    currentPlayer.addEventListener('ended', onManualEnded, { once: true });
    currentPlayer.play();
  }

  private sponsors() {
    console.log('[TV] Play loop for phase:', this.activePhase);

    // Utiliser le double-buffer pour la boucle seamless
    this.startSeamlessLoop();
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
   * Inclut les logos des équipes depuis les options locales
   */
  private handleScoreUpdate(scoreData: {
    homeTeam: string;
    awayTeam: string;
    homeScore: number;
    awayScore: number;
    homeLogo?: string;
    awayLogo?: string;
    period?: string;
    matchTime?: string;
  }): void {
    // Détecter si un but a été marqué (et par quelle équipe)
    if (this.currentScore && this.localOptions.goalAnimation.enabled) {
      const homeScored = scoreData.homeScore > this.currentScore.homeScore;
      const awayScored = scoreData.awayScore > this.currentScore.awayScore;

      if (homeScored || awayScored) {
        this.triggerGoalAnimation(homeScored ? 'home' : 'away');
      }
    }

    // Enrichir avec les logos des options locales si non fournis
    this.currentScore = {
      ...scoreData,
      homeLogo: scoreData.homeLogo || this.localOptions.match.homeTeam.logo,
      awayLogo: scoreData.awayLogo || this.localOptions.match.awayTeam.logo,
      period: scoreData.period || this.localOptions.match.period,
    };

    // Afficher l'overlay selon les options
    if (this.localOptions.overlay.scoreEnabled) {
      this.showScoreOverlay = true;
    }
  }

  /**
   * Déclenche l'animation de but/point
   * Supporte 3 styles: popup, fullscreen, slide
   * Avec son optionnel
   */
  private triggerGoalAnimation(team: 'home' | 'away'): void {
    const config = this.localOptions.goalAnimation;
    if (!config.enabled) return;

    // Annuler un timeout précédent si existant
    if (this.goalAnimationTimeout) {
      clearTimeout(this.goalAnimationTimeout);
    }

    this.goalScoringTeam = team;
    this.showGoalAnimation = true;

    console.log('[TV] Goal animation triggered for team:', team, 'style:', config.style);

    // Jouer le son si activé
    if (config.soundEnabled && config.soundUrl) {
      this.playGoalSound(config.soundUrl);
    }

    // Masquer après la durée configurée
    this.goalAnimationTimeout = setTimeout(() => {
      this.showGoalAnimation = false;
      this.goalScoringTeam = null;
    }, config.duration * 1000);
  }

  /**
   * Joue le son de but
   */
  private playGoalSound(soundUrl: string): void {
    try {
      // Réutiliser ou créer l'élément audio
      if (!this.goalAudio) {
        this.goalAudio = new Audio();
      }
      this.goalAudio.src = soundUrl;
      this.goalAudio.volume = 0.8;
      this.goalAudio.play().catch(err => {
        console.warn('[TV] Could not play goal sound:', err.message);
      });
    } catch (err) {
      console.warn('[TV] Error playing goal sound:', err);
    }
  }

  /**
   * Retourne le style d'animation de but actuel
   */
  public getGoalAnimationStyle(): string {
    return `style-${this.localOptions.goalAnimation.style}`;
  }

  // Rétrocompatibilité
  public get showGoalPopup(): boolean {
    return this.showGoalAnimation;
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
   * Supporte les 9 positions: top/middle/bottom x left/center/right
   */
  public getOverlayStyles(): Record<string, string> {
    const config = this.configuration?.scoreOverlay;
    // Position locale override la position du central si définie
    const position: OverlayPosition = this.localOptions.overlay.position || config?.position || 'top-right';
    const offsetX = (config?.offsetX ?? 20) + 'px';
    const offsetY = (config?.offsetY ?? 20) + 'px';

    // Couleurs: local override si useLocalColors est activé
    const useLocal = this.localOptions.overlay.useLocalColors;
    const backgroundColor = useLocal && this.localOptions.overlay.backgroundColor
      ? this.localOptions.overlay.backgroundColor
      : (config?.backgroundColor || 'rgba(0, 0, 0, 0.85)');

    const styles: Record<string, string> = {
      'background': backgroundColor,
      'border-radius': (config?.borderRadius ?? 12) + 'px'
    };

    // Position verticale (top/middle/bottom)
    if (position.includes('top')) {
      styles['top'] = offsetY;
      styles['bottom'] = 'auto';
    } else if (position.includes('bottom')) {
      styles['bottom'] = offsetY;
      styles['top'] = 'auto';
    } else {
      // middle
      styles['top'] = '50%';
      styles['bottom'] = 'auto';
      styles['transform'] = 'translateY(-50%)';
    }

    // Position horizontale (left/center/right)
    if (position.includes('right')) {
      styles['right'] = offsetX;
      styles['left'] = 'auto';
    } else if (position.includes('left')) {
      styles['left'] = offsetX;
      styles['right'] = 'auto';
    } else {
      // center
      styles['left'] = '50%';
      styles['right'] = 'auto';
      if (position.includes('middle')) {
        styles['transform'] = 'translate(-50%, -50%)';
      } else {
        styles['transform'] = 'translateX(-50%)';
      }
    }

    return styles;
  }

  /**
   * Styles dynamiques pour les scores
   * Local override si useLocalColors est activé
   */
  public getScoreStyles(): Record<string, string> {
    const config = this.configuration?.scoreOverlay;
    const useLocal = this.localOptions.overlay.useLocalColors;
    const scoreColor = useLocal && this.localOptions.overlay.scoreColor
      ? this.localOptions.overlay.scoreColor
      : (config?.scoreColor || '#4caf50');

    return {
      'color': scoreColor,
      'font-size': (config?.scoreSize ?? 28) + 'px'
    };
  }

  /**
   * Styles dynamiques pour les noms d'équipe
   * Local override si useLocalColors est activé
   */
  public getTeamNameStyles(): Record<string, string> {
    const config = this.configuration?.scoreOverlay;
    const useLocal = this.localOptions.overlay.useLocalColors;
    const teamNameColor = useLocal && this.localOptions.overlay.teamNameColor
      ? this.localOptions.overlay.teamNameColor
      : (config?.teamNameColor || '#ffffff');

    return {
      'color': teamNameColor,
      'font-size': (config?.teamNameSize ?? 16) + 'px'
    };
  }

  /**
   * Styles dynamiques pour le timer intégré au score
   */
  public getTimerStyles(): Record<string, string> {
    const config = this.configuration?.scoreOverlay;
    const useLocal = this.localOptions.overlay.useLocalColors;
    const scoreColor = useLocal && this.localOptions.overlay.scoreColor
      ? this.localOptions.overlay.scoreColor
      : (config?.scoreColor || '#64b5f6');

    return {
      'color': scoreColor
    };
  }

  /**
   * Retourne la classe CSS du sport actuel
   */
  public getSportClass(): string {
    return `sport-${this.localOptions.sport}`;
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

  // ===========================================================================
  // DOUBLE-BUFFER VIDEO SYSTEM
  // Deux players qui alternent: un joue pendant que l'autre précharge
  // Permet des transitions sans flash noir
  // ===========================================================================

  /**
   * Initialise les deux players du double-buffer
   */
  private initDoubleBuffer(): void {
    this.playerA = this.playerARef.nativeElement;
    this.playerB = this.playerBRef.nativeElement;

    // Configurer les deux players
    [this.playerA, this.playerB].forEach((player, i) => {
      player.muted = true;
      player.playsInline = true;
      player.preload = 'auto';
      console.log(`[TV] Player ${i === 0 ? 'A' : 'B'} initialized`);
    });

    // Player A est visible au départ
    this.setPlayerVisible(this.playerA, true);
    this.setPlayerVisible(this.playerB, false);
    this.activePlayer = 'A';

    // Écouter la fin de vidéo sur les deux players
    this.playerA.addEventListener('ended', () => this.onVideoEnded('A'));
    this.playerB.addEventListener('ended', () => this.onVideoEnded('B'));

    console.log('[TV] Double-buffer initialized');
  }

  /**
   * Rend un player visible ou invisible via styles inline
   */
  private setPlayerVisible(player: HTMLVideoElement, visible: boolean): void {
    player.style.opacity = visible ? '1' : '0';
    player.style.zIndex = visible ? '1' : '0';
  }

  /**
   * Retourne le player actuellement actif (visible)
   */
  private getActivePlayer(): HTMLVideoElement {
    return this.activePlayer === 'A' ? this.playerA : this.playerB;
  }

  /**
   * Retourne le player inactif (caché, pour préchargement)
   */
  private getInactivePlayer(): HTMLVideoElement {
    return this.activePlayer === 'A' ? this.playerB : this.playerA;
  }

  /**
   * Démarre la boucle vidéo avec double-buffer
   */
  private startSeamlessLoop(): void {
    if (this.isStartingLoop) {
      console.log('[TV] startSeamlessLoop already in progress, skipping');
      return;
    }
    this.isStartingLoop = true;

    // Arrêter les players existants
    this.playerA?.pause();
    this.playerB?.pause();

    this.isLoopMode = true;
    this.currentLoopIndex = 0;
    this.pendingSwitch = false;

    // Récupérer les vidéos de la boucle
    const loopVideos = this.getLoopVideosForPhase(this.activePhase);
    this.currentLoopVideos = loopVideos;

    if (loopVideos.length === 0) {
      console.warn('[TV] No videos in loop');
      this.isLoopMode = false;
      this.isStartingLoop = false;
      return;
    }

    console.log('[TV] Starting loop with', loopVideos.length, 'videos');

    // Jouer la première vidéo sur le player actif
    this.playOnActivePlayer(0);

    // Précharger la suivante sur le player inactif (si plus d'une vidéo)
    if (loopVideos.length > 1) {
      this.preloadOnInactivePlayer(1);
    }

    setTimeout(() => {
      this.isStartingLoop = false;
    }, 500);
  }

  /**
   * Joue une vidéo sur le player actif
   */
  private playOnActivePlayer(index: number): void {
    const loopVideos = this.currentLoopVideos;
    if (loopVideos.length === 0) return;

    const videoIndex = index % loopVideos.length;
    const video = loopVideos[videoIndex];
    const player = this.getActivePlayer();

    console.log(`[TV] Playing video ${videoIndex} on player ${this.activePlayer}:`, video.path);

    player.src = video.path;
    player.load();

    player.play().then(() => {
      this.ngZone.run(() => {
        this.currentLoopIndex = videoIndex;
        this.lastTriggerType = 'auto';

        // Tracker
        this.analyticsService.trackVideoStart(video, 'auto');
        this.sponsorAnalytics.trackSponsorStart(
          video,
          'auto',
          player.duration || 0
        );

        console.log(`[TV] Now playing video ${videoIndex} on ${this.activePlayer}`);
      });
    }).catch(err => {
      console.error('[TV] Error playing video:', err, '- skipping to next');
      setTimeout(() => {
        const nextIndex = (videoIndex + 1) % this.currentLoopVideos.length;
        if (nextIndex !== videoIndex) {
          this.playOnActivePlayer(nextIndex);
        }
      }, 1000);
    });
  }

  /**
   * Précharge une vidéo sur le player inactif
   */
  private preloadOnInactivePlayer(index: number): void {
    const loopVideos = this.currentLoopVideos;
    if (loopVideos.length === 0) return;

    const videoIndex = index % loopVideos.length;
    const video = loopVideos[videoIndex];
    const player = this.getInactivePlayer();

    console.log(`[TV] Preloading video ${videoIndex} on inactive player:`, video.path);

    player.src = video.path;
    player.load();

    // Écouter quand la vidéo est prête
    player.addEventListener('canplaythrough', () => {
      console.log(`[TV] Video ${videoIndex} preloaded and ready`);
    }, { once: true });
  }

  /**
   * Appelé quand une vidéo se termine sur un player
   */
  private onVideoEnded(fromPlayer: 'A' | 'B'): void {
    console.log(`[TV] onVideoEnded called from player ${fromPlayer}, isLoopMode=${this.isLoopMode}, activePlayer=${this.activePlayer}`);

    // Ignorer si ce n'est pas le player actif ou si pas en mode boucle
    if (!this.isLoopMode || fromPlayer !== this.activePlayer) {
      console.log('[TV] Ignoring ended event (not active or not in loop mode)');
      return;
    }

    // Éviter les switchs multiples
    if (this.pendingSwitch) {
      console.log('[TV] Switch already pending, ignoring');
      return;
    }
    this.pendingSwitch = true;

    this.ngZone.run(() => {
      // Tracker la fin
      this.analyticsService.trackVideoEnd(true);
      this.sponsorAnalytics.trackSponsorEnd(true);

      const loopVideos = this.currentLoopVideos;
      const nextIndex = (this.currentLoopIndex + 1) % loopVideos.length;

      console.log(`[TV] Video ended, switching to next (index ${nextIndex})`);

      // Switch les players
      this.switchPlayers(nextIndex);
    });
  }

  /**
   * Switch entre les deux players (transition sans flash)
   */
  private switchPlayers(nextVideoIndex: number): void {
    const oldPlayer = this.getActivePlayer();
    const newPlayer = this.getInactivePlayer();

    console.log(`[TV] Switching from ${this.activePlayer} to ${this.activePlayer === 'A' ? 'B' : 'A'}`);

    // Démarrer la vidéo préchargée AVANT de faire le switch visuel
    newPlayer.play().then(() => {
      // Une fois que la nouvelle vidéo joue, faire le switch visuel
      this.setPlayerVisible(newPlayer, true);
      this.setPlayerVisible(oldPlayer, false);

      // Mettre à jour l'état
      this.activePlayer = this.activePlayer === 'A' ? 'B' : 'A';
      this.currentLoopIndex = nextVideoIndex;

      // Tracker
      const video = this.currentLoopVideos[nextVideoIndex];
      this.analyticsService.trackVideoStart(video, 'auto');
      this.sponsorAnalytics.trackSponsorStart(
        video,
        'auto',
        newPlayer.duration || 0
      );

      console.log(`[TV] Switched to player ${this.activePlayer}, now playing index ${nextVideoIndex}`);

      // Précharger la vidéo suivante sur l'ancien player (maintenant inactif)
      const preloadIndex = (nextVideoIndex + 1) % this.currentLoopVideos.length;
      setTimeout(() => {
        this.preloadOnInactivePlayer(preloadIndex);
        this.pendingSwitch = false;
      }, 500);
    }).catch(err => {
      console.error('[TV] Error switching to next video:', err);
      this.pendingSwitch = false;
      // Fallback: rejouer sur le même player
      setTimeout(() => {
        this.playOnActivePlayer(nextVideoIndex);
      }, 1000);
    });
  }

  /**
   * Arrête la boucle pour le mode manuel
   */
  private stopSeamlessLoop(): void {
    this.isLoopMode = false;
    this.playerA?.pause();
    this.playerB?.pause();
    console.log('[TV] Loop stopped, switching to manual mode');
  }

  /**
   * Redémarre la boucle après une vidéo manuelle
   */
  private restartSeamlessLoop(): void {
    console.log('[TV] Restarting loop');
    this.startSeamlessLoop();
  }

}
