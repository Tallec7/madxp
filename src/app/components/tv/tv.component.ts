import { Component, ElementRef, inject, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';
import videojs from 'video.js';
import "videojs-playlist";
import Player from 'video.js/dist/types/player';
import { SocketService } from '../../services/socket.service';
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

  @Input() public configuration: Configuration;

  @ViewChild('target', { static: true }) target: ElementRef;

  public player: Player;

  public ngOnInit() {
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

    this.player.on('error', (error: Event) => {
      console.error('tv player error', error);
      this.sponsors()
    });

    this.socketService.on('action', (command: Command) => {
      console.log('tv action received', command);
      if (command.type === 'video' && command.data) {
        this.play(command.data);
      } else if (command.type === 'sponsors') {
        this.sponsors();
      }
    });
  }

  public ngOnDestroy() {
    if (this.player) {
      this.player.dispose();
    }
  }

  private play(video: Video) {
    console.log('tv player : play video', video.path);
    this.player.src({ src: video.path, type: video.type });
    this.player.one('ended', () => {
      console.log('tv player : video ended', video.path);
      this.sponsors()
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
