import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnDestroy,
  OnChanges,
  SimpleChanges,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
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
 * V2 du composant (ADR-101 / SPEC-V2-TVMON-01) — preview vidéo réel via MJPEG :
 * - Si `previewUrl` fourni (le parent l'aura reçu via Socket.IO `tv-preview:capability`),
 *   on charge un <img> multipart/x-mixed-replace.
 * - Si l'image fail (onerror) ou ne charge pas, on bascule sur le placeholder visuel
 *   d'origine. Backoff exponentiel sur la reconnexion (1s, 2s, 4s, 8s, cap 30s).
 * - Sur les Pi 4 / SaaS / demo / GPU fallback, le parent ne fournit pas `previewUrl`
 *   et le composant reste en placeholder pur (rétro-compat).
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
      object-fit: cover;
      opacity: 0;
      transition: opacity 200ms ease;
      pointer-events: none;
    }
    .r2-tv-monitor-stream.is-healthy { opacity: 1; }
    .r2-tv-monitor-content.is-hidden-by-stream { opacity: 0; pointer-events: none; }
  `],
  template: `
    <section class="r2-tv-monitor" [class.is-manual]="playingVideo" [class.is-idle]="isIdle" [class.is-streaming]="streamHealthy()">
      <div class="r2-tv-monitor-frame">
        <span class="r2-tv-monitor-scanline"></span>
        <span class="r2-tv-monitor-status" *ngIf="!isIdle">
          <span class="r2-tv-monitor-dot"></span>
          {{ playingVideo ? 'MANUAL' : 'LIVE' }}
          <span *ngIf="throttled()" class="r2-tv-monitor-throttle" title="Stream ralenti côté Pi">⚠️</span>
        </span>
        <span class="r2-tv-monitor-status r2-tv-monitor-status--idle" *ngIf="isIdle">
          IDLE
        </span>
        <img
          *ngIf="streamSrc()"
          class="r2-tv-monitor-stream"
          [class.is-healthy]="streamHealthy()"
          [src]="streamSrc()"
          (load)="onImgLoad()"
          (error)="onImgError()"
          alt=""
          aria-hidden="true" />
        <div class="r2-tv-monitor-content" [class.is-hidden-by-stream]="streamHealthy()">
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
export class R2TvMonitorComponent implements OnChanges, OnDestroy {
  /** Vidéo lue en lecture ponctuelle (mode manuel). Override la boucle live. */
  @Input() playingVideo: PiConfigVideoEntry | null = null;

  /** Nom de la vidéo en cours dans la boucle (mode LIVE), si pas de manual. */
  @Input() loopVideoName?: string;

  /** Subline contextuelle ("X/Y · tourne en fond" ou similaire). */
  @Input() subline = '';

  /** True si la boucle est sur 'neutral' (rotation sponsors par défaut). */
  @Input() isNeutralLoop = false;

  /**
   * URL du flux MJPEG (cf. ADR-101). Fournie par le parent via l'event
   * Socket.IO `tv-preview:capability`. `null` ⇒ Pi 4 / SaaS / demo / GPU fallback,
   * on reste en placeholder visuel.
   */
  @Input() previewUrl: string | null = null;

  /** Indique si une dégradation côté Pi a été signalée (`tv-preview:throttled`). */
  @Input() throttledNotice = false;

  /** État interne — true quand l'<img> a au moins une frame chargée. */
  readonly streamHealthy = signal(false);
  readonly streamSrc = signal<string | null>(null);
  readonly throttled = signal(false);

  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private backoffMs = 1000;
  private static readonly MAX_BACKOFF_MS = 30000;

  ngOnChanges(changes: SimpleChanges): void {
    if ('previewUrl' in changes) {
      this.cancelReconnect();
      this.streamHealthy.set(false);
      this.backoffMs = 1000;
      this.streamSrc.set(this.previewUrl ? this.bust(this.previewUrl) : null);
    }
    if ('throttledNotice' in changes) {
      this.throttled.set(!!this.throttledNotice);
    }
  }

  ngOnDestroy(): void {
    this.cancelReconnect();
  }

  onImgLoad(): void {
    this.streamHealthy.set(true);
    this.backoffMs = 1000;
  }

  onImgError(): void {
    this.streamHealthy.set(false);
    this.scheduleReconnect();
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

  private scheduleReconnect(): void {
    if (!this.previewUrl) return;
    this.cancelReconnect();
    const delay = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 2, R2TvMonitorComponent.MAX_BACKOFF_MS);
    this.reconnectTimer = setTimeout(() => {
      if (!this.previewUrl) return;
      this.streamSrc.set(this.bust(this.previewUrl));
    }, delay);
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private bust(url: string): string {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}_t=${Date.now()}`;
  }
}
