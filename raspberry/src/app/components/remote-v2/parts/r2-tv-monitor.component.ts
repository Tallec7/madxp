import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
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
 * V1 du composant : pas de vraie preview vidéo (pas de stream du Pi vers la
 * télécommande). C'est une représentation visuelle (gradient + nom + status)
 * qui donne à l'opérateur le contexte de ce qui passe à l'antenne, sans avoir
 * à lever la tête vers la TV.
 */
@Component({
  selector: 'app-r2-tv-monitor',
  standalone: true,
  imports: [CommonModule, R2IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host { display: contents; }'],
  template: `
    <section class="r2-tv-monitor" [class.is-manual]="playingVideo" [class.is-idle]="isIdle">
      <div class="r2-tv-monitor-frame">
        <span class="r2-tv-monitor-scanline"></span>
        <span class="r2-tv-monitor-status" *ngIf="!isIdle">
          <span class="r2-tv-monitor-dot"></span>
          {{ playingVideo ? 'MANUAL' : 'LIVE' }}
        </span>
        <span class="r2-tv-monitor-status r2-tv-monitor-status--idle" *ngIf="isIdle">
          IDLE
        </span>
        <div class="r2-tv-monitor-content">
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
export class R2TvMonitorComponent {
  /** Vidéo lue en lecture ponctuelle (mode manuel). Override la boucle live. */
  @Input() playingVideo: PiConfigVideoEntry | null = null;

  /** Nom de la vidéo en cours dans la boucle (mode LIVE), si pas de manual. */
  @Input() loopVideoName?: string;

  /** Subline contextuelle ("X/Y · tourne en fond" ou similaire). */
  @Input() subline = '';

  /** True si la boucle est sur 'neutral' (rotation sponsors par défaut). */
  @Input() isNeutralLoop = false;

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
