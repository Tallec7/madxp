import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnChanges,
  SimpleChanges,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { PiConfigVideoEntry } from '../../../interfaces/video.interface';
import { R2IconComponent } from '../icons/r2-icon.component';

/**
 * Preview "monitor TV" pour le layout régie pro PC C (SPEC-V2-LAYOUT-01 §5C).
 *
 * Affiche dans la colonne centrale du layout dark une zone 16:9 qui matérialise
 * la vidéo en cours :
 * - LIVE      : la boucle tourne (loopVideoName).
 * - MANUAL    : lecture ponctuelle d'une vidéo hors boucle (playingVideo).
 * - IDLE      : ni boucle ni lecture manuelle.
 *
 * ADR-105 — preview vidéo réel via iframe local-first :
 * - `previewUrl` = même URL que la TV (avec `?preview=1` pour mute audio +
 *   skip analytics + skip socket-register côté TV). Construite par le parent
 *   `RemoteV2Component` à partir de `window.location.origin`.
 * - 1 iframe = 1 rendu au niveau page ; même staff visualise la même TV.
 * - Pointer-events désactivés (preview-only, aucune interaction).
 * - Pas de transport cloud ni de canvas/MJPEG : la fiabilité vient du fait
 *   qu'on ne fait que charger la même page web.
 */
@Component({
  selector: 'app-r2-tv-monitor',
  standalone: true,
  imports: [CommonModule, R2IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host { display: contents; }
    .r2-tv-monitor-stream {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      border: 0;
      pointer-events: none;
      opacity: 0;
      transition: opacity 200ms ease;
    }
    .r2-tv-monitor-stream.is-loaded { opacity: 1; }
    .r2-tv-monitor-content.is-hidden-by-stream { opacity: 0; pointer-events: none; }
  `],
  template: `
    <section class="r2-tv-monitor" [class.is-manual]="playingVideo" [class.is-idle]="isIdle" [class.is-streaming]="streamLoaded()">
      <div class="r2-tv-monitor-frame">
        <span class="r2-tv-monitor-scanline"></span>
        <span class="r2-tv-monitor-status" *ngIf="!isIdle">
          <span class="r2-tv-monitor-dot"></span>
          {{ playingVideo ? 'MANUAL' : 'LIVE' }}
        </span>
        <span class="r2-tv-monitor-status r2-tv-monitor-status--idle" *ngIf="isIdle">
          IDLE
        </span>
        <iframe
          *ngIf="safeUrl()"
          class="r2-tv-monitor-stream"
          [class.is-loaded]="streamLoaded()"
          [src]="safeUrl()"
          (load)="onIframeLoad()"
          sandbox="allow-scripts allow-same-origin"
          loading="lazy"
          aria-hidden="true"
          tabindex="-1"
          title="Preview TV"
        ></iframe>
        <div class="r2-tv-monitor-content" [class.is-hidden-by-stream]="streamLoaded()">
          <span class="r2-tv-monitor-icon" aria-hidden="true">
            <app-r2-icon name="play" [size]="32"></app-r2-icon>
          </span>
          <div class="r2-tv-monitor-info">
            <span class="r2-tv-monitor-eyebrow">{{ eyebrow }}</span>
            <span class="r2-tv-monitor-name">{{ displayName }}</span>
            <span class="r2-tv-monitor-subline" *ngIf="subline">{{ subline }}</span>
          </div>
        </div>
      </div>
    </section>
  `,
})
export class R2TvMonitorComponent implements OnChanges {
  private readonly sanitizer = inject(DomSanitizer);

  /** Vidéo lue en lecture ponctuelle (mode manuel). Override la boucle live. */
  @Input() playingVideo: PiConfigVideoEntry | null = null;

  /** Nom de la vidéo en cours dans la boucle (mode LIVE), si pas de manual. */
  @Input() loopVideoName?: string;

  /** Subline contextuelle ("X/Y · tourne en fond" ou similaire). */
  @Input() subline = '';

  /** True si la boucle est sur 'neutral' (rotation sponsors par défaut). */
  @Input() isNeutralLoop = false;

  /**
   * URL absolue de la page TV à embarquer dans l'iframe (avec `?preview=1`).
   * `null` ⇒ demo / état non chargé → placeholder visuel d'origine.
   */
  @Input() previewUrl: string | null = null;

  readonly safeUrl = signal<SafeResourceUrl | null>(null);
  readonly streamLoaded = signal(false);

  ngOnChanges(changes: SimpleChanges): void {
    if ('previewUrl' in changes) {
      this.streamLoaded.set(false);
      this.safeUrl.set(
        this.previewUrl ? this.sanitizer.bypassSecurityTrustResourceUrl(this.previewUrl) : null,
      );
    }
  }

  onIframeLoad(): void {
    this.streamLoaded.set(true);
  }

  get isIdle(): boolean {
    return !this.playingVideo && !this.loopVideoName && !this.isNeutralLoop;
  }

  get eyebrow(): string {
    if (this.playingVideo) return 'Diffusion manuelle';
    if (this.isNeutralLoop) return 'Rotation sponsors';
    if (this.loopVideoName) return 'Boucle active';
    return 'Aucune diffusion';
  }

  get displayName(): string {
    if (this.playingVideo) return this.playingVideo.name || 'Vidéo';
    if (this.isNeutralLoop) return 'Rotation par défaut';
    return this.loopVideoName || '—';
  }
}
