import { Component, ElementRef, inject, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';
import videojs from 'video.js';
import "videojs-playlist";
import Player from 'video.js/dist/types/player';
import { SocketService } from '../../services/socket.service';
import { AnalyticsService } from '../../services/analytics.service';
import { Video } from '../../interfaces/video.interface';
import { Configuration } from '../../interfaces/configuration.interface';
import { Command } from '../../interfaces/command.interface';

interface PlayerWithPlaylist extends Player {
  playlist: {
    first(): void;
    repeat(value: boolean): void;
    autoadvance(delay: number): void;
  };
}

@Component({
  selector: 'app-tv',
  templateUrl: './tv.component.html',
  styleUrl: './tv.component.scss'
})
export class TvComponent implements OnInit, OnDestroy {
  private readonly socketService = inject(SocketService);
  private readonly analyticsService = inject(AnalyticsService);

  @Input() public configuration: Configuration;

  private lastTriggerType: 'auto' | 'manual' = 'auto';
  private currentSponsorIndex = 0;

  @ViewChild('target', { static: true }) target: ElementRef;

  public player: Player;

  public ngOnInit() {
    // Démarrer une session analytics
    this.analyticsService.startSession();

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
      this.player.requestFullscreen().then(() => {
        console.log('fullscreen activated');
      }).catch((error) => {
        console.error('fullscreen issue', error);
      })
      this.sponsors();
    });

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
        }
      }
    });

    this.player.on('ended', () => {
      // Pour les vidéos de la boucle, tracker la fin
      if (this.lastTriggerType === 'auto') {
        this.analyticsService.trackVideoEnd(true);
      }
    });

    this.socketService.on('action', (command: Command) => {
      console.log('tv action received', command);
      if (command.type === 'video' && command.data) {
        this.lastTriggerType = 'manual';
        this.play(command.data);
      } else if (command.type === 'sponsors') {
        this.lastTriggerType = 'auto';
        this.sponsors();
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

    this.player.src({ src: video.path, type: video.type });
    this.player.one('ended', () => {
      console.log('tv player : video ended', video.path);
      // Tracker la fin de la vidéo manuelle
      this.analyticsService.trackVideoEnd(true);
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

}
