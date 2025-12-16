import { Component, ElementRef, inject, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { trigger, state, style, transition, animate } from '@angular/animations';
import videojs from 'video.js';
import "videojs-playlist";
import Player from 'video.js/dist/types/player';
import { SocketService } from '../../services/socket.service';
import { AnalyticsService } from '../../services/analytics.service';
import { SponsorAnalyticsService } from '../../services/sponsor-analytics.service';
import { Video } from '../../interfaces/video.interface';
import { Configuration } from '../../interfaces/configuration.interface';
import { Command } from '../../interfaces/command.interface';

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
  animations: [
    trigger('fadeInOut', [
      transition(':enter', [
        style({ opacity: 0, transform: 'scale(0.7)' }),
        animate('400ms ease-out', style({ opacity: 1, transform: 'scale(1)' }))
      ]),
      transition(':leave', [
        animate('300ms ease-in', style({ opacity: 0, transform: 'scale(0.9)' }))
      ])
    ])
  ]
})
export class TvComponent implements OnInit, OnDestroy {
  private readonly socketService = inject(SocketService);
  private readonly analyticsService = inject(AnalyticsService);
  private readonly sponsorAnalytics = inject(SponsorAnalyticsService);

  @Input() public configuration: Configuration;

  private lastTriggerType: 'auto' | 'manual' = 'auto';
  private currentSponsorIndex = 0;
  private currentEventType: 'match' | 'training' | 'tournament' | 'other' = 'other';
  private currentPeriod: 'pre_match' | 'halftime' | 'post_match' | 'loop' = 'loop';

  // Live Score
  public currentScore: { homeTeam: string; awayTeam: string; homeScore: number; awayScore: number; period?: string; matchTime?: string } | null = null;
  public showScoreOverlay = false;
  public showScorePopup = false;
  private scorePopupTimeout: any = null;

  @ViewChild('target', { static: true }) target: ElementRef;

  public player: Player;

  public ngOnInit() {
    // Configurer l'analytics service avec la configuration (pour le mapping des catégories)
    this.analyticsService.setConfiguration(this.configuration);

    // Démarrer une session analytics
    this.analyticsService.startSession();

    // Configurer le service sponsor analytics
    this.sponsorAnalytics.setConfiguration(this.configuration);
    // TODO: Récupérer le site_id depuis la configuration ou l'auth service
    // this.sponsorAnalytics.setSiteId(this.configuration.siteId);

    const options = {
      fullscreen: true,
      autoplay: true,
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

    // Activer le plein écran au premier clic utilisateur (requis par les navigateurs)
    const activateFullscreen = () => {
      this.player.requestFullscreen().then(() => {
        console.log('fullscreen activated');
      }).catch((error) => {
        console.error('fullscreen issue', error);
      });
      document.removeEventListener('click', activateFullscreen);
      document.removeEventListener('keydown', activateFullscreen);
    };
    document.addEventListener('click', activateFullscreen, { once: true });
    document.addEventListener('keydown', activateFullscreen, { once: true });

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
      if (currentSrc && this.lastTriggerType === 'auto') {
        // C'est une vidéo de la boucle sponsors
        const sponsor = this.configuration.sponsors.find(s => currentSrc.includes(s.path));
        if (sponsor) {
          this.analyticsService.trackVideoStart(sponsor, 'auto');

          // Tracker l'impression sponsor
          this.sponsorAnalytics.trackSponsorStart(
            sponsor,
            'auto',
            this.player.duration() || 0
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
    this.socketService.on('score-update', (scoreData: any) => {
      console.log('[TV] Score update received:', scoreData);
      this.handleScoreUpdate(scoreData);
    });

    // Live Score - Écouter le reset du score
    this.socketService.on('score-reset', () => {
      console.log('[TV] Score reset received');
      this.currentScore = null;
      this.showScoreOverlay = false;
      this.showScorePopup = false;
    });

    // Live Score - Écouter les infos de match mises à jour
    this.socketService.on('match-info-updated', (matchInfo: any) => {
      console.log('[TV] Match info updated:', matchInfo);
      // Mettre à jour le contexte analytics si nécessaire
      if (matchInfo.audienceEstimate) {
        this.updateAudienceEstimate(matchInfo.audienceEstimate);
      }
    });
  }

  public ngOnDestroy() {
    // Terminer la session analytics
    this.analyticsService.endSession();

    if (this.player) {
      this.player.dispose();
    }
  }

  private play(video: Video) {
    console.log('tv player : play video', video.path);

    // Tracker le début de la vidéo manuelle
    this.analyticsService.trackVideoStart(video, 'manual');

    // Si c'est une vidéo sponsor déclenchée manuellement, tracker l'impression
    const isSponsor = this.configuration.sponsors.some(s => s.path === video.path);
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
    console.log('tv player : play sponsors loop');
    (this.player as PlayerWithPlaylist).playlist.first();
    (this.player as PlayerWithPlaylist).playlist.repeat(true);
    (this.player as PlayerWithPlaylist).playlist.autoadvance(0);
  }

  private reloadConfiguration(config: Configuration) {
    console.log('tv: updating configuration and playlist');
    this.configuration = config;

    // Mettre à jour la configuration dans l'analytics service
    this.analyticsService.setConfiguration(config);
    this.sponsorAnalytics.setConfiguration(config);

    // Mettre à jour la playlist avec les nouveaux sponsors
    const newPlaylist = config.sponsors.map((sponsor) => ({
      sources: [{ src: sponsor.path, type: sponsor.type }]
    }));

    (this.player as PlayerWithPlaylist).playlist(newPlaylist);

    // Lancer la nouvelle boucle
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
    const previousScore = this.currentScore;
    this.currentScore = scoreData;
    this.showScoreOverlay = true;

    // Détecter un changement de score pour afficher le popup
    if (previousScore) {
      const scoreChanged =
        previousScore.homeScore !== scoreData.homeScore ||
        previousScore.awayScore !== scoreData.awayScore;

      if (scoreChanged) {
        this.triggerScorePopup();
      }
    }
  }

  /**
   * Affiche temporairement le popup de score (5 secondes)
   */
  private triggerScorePopup(): void {
    // Annuler le timeout précédent s'il existe
    if (this.scorePopupTimeout) {
      clearTimeout(this.scorePopupTimeout);
    }

    // Afficher le popup
    this.showScorePopup = true;

    // Masquer après 5 secondes
    this.scorePopupTimeout = setTimeout(() => {
      this.showScorePopup = false;
      this.scorePopupTimeout = null;
    }, 5000);
  }

  /**
   * Toggle manuel de l'overlay score (appelé par commande remote)
   */
  public toggleScoreOverlay(): void {
    this.showScoreOverlay = !this.showScoreOverlay;
  }

}
