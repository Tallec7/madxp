import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PiConfigVideoEntry } from '../../../interfaces/video.interface';
import { formatDuration, videoTags, VideoTag } from '../remote-v2-helpers';
import { R2IconComponent } from '../icons/r2-icon.component';

const THUMB_GRADIENTS = [
  'linear-gradient(135deg, #20473c, #51b28b)',
  'linear-gradient(135deg, #cc384e, #e77085)',
  'linear-gradient(135deg, #1f4e8c, #5a8ed6)',
  'linear-gradient(135deg, #7d3aa3, #b06ed0)',
  'linear-gradient(135deg, #c97a1e, #e3a95a)',
  'linear-gradient(135deg, #2e2e2e, #696969)',
];

/**
 * Ligne vidéo réutilisable — thumb + nom + durée + tags + bouton play.
 * Utilisée par les catégories accordéon ET la sheet de recherche (résultats + récentes).
 */
@Component({
  selector: 'app-r2-video-row',
  standalone: true,
  imports: [CommonModule, R2IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host { display: contents; }'],
  template: `
    <button
      class="r2-video-row"
      [class.playing]="active"
      [class.errored]="errored"
      [attr.data-testid]="errored ? 'video-row-errored' : null"
      (click)="playClick.emit(video)"
    >
      <span class="r2-video-thumb" [style.background]="gradient(video.id || video.path)">
        <img *ngIf="thumbnailUrl(video) as url" [src]="url" [alt]="video.name"
          (error)="onThumbError($event)" loading="lazy"/>
        <span class="r2-video-thumb-initials">
          <ng-container *ngIf="initials(video) as ini">
            <app-r2-icon *ngIf="ini === '__icon_play__'" name="play" [size]="18"></app-r2-icon>
            <ng-container *ngIf="ini !== '__icon_play__'">{{ ini }}</ng-container>
          </ng-container>
        </span>
        <span class="r2-video-error-badge" *ngIf="errored" aria-label="Lecture en erreur" title="Dernière lecture en erreur">!</span>
      </span>
      <span class="r2-video-meta">
        <span class="r2-video-name">{{ video.name }}</span>
        <span class="r2-video-extra" *ngIf="formatDur(video.durationSeconds) || tags(video).length">
          <span class="r2-video-duration" *ngIf="formatDur(video.durationSeconds) as d">{{ d }}</span>
          <ng-container *ngFor="let t of tags(video)">
            <span class="r2-video-dot" *ngIf="formatDur(video.durationSeconds)">·</span>
            <span class="r2-video-tag" [class.is-secondary]="t === 'secondary'"
              [class.is-sponsor]="t === 'sponsor'" [class.is-link]="t === 'link'">
              <ng-container [ngSwitch]="t">
                <span *ngSwitchCase="'secondary'">2ⁿᵈ écran</span>
                <span *ngSwitchCase="'sponsor'">sponsor</span>
                <span *ngSwitchCase="'link'">lien</span>
              </ng-container>
            </span>
          </ng-container>
        </span>
      </span>
      <span class="r2-video-play" [class.active]="active">
        <svg *ngIf="!active" width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
          <path d="M5 3v18l16-9z"/>
        </svg>
        <svg *ngIf="active" width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="12" r="5"/>
        </svg>
      </span>
    </button>
  `,
})
export class R2VideoRowComponent {
  @Input({ required: true }) video!: PiConfigVideoEntry;
  @Input() active = false;
  @Input() errored = false;
  @Input() useLocalThumbnails = true;
  @Input() cacheBuster = Date.now();
  @Output() playClick = new EventEmitter<PiConfigVideoEntry>();

  formatDur = formatDuration;
  tags = videoTags;

  gradient(id: string | undefined | null): string {
    const s = id || 'x';
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return THUMB_GRADIENTS[Math.abs(h) % THUMB_GRADIENTS.length];
  }

  thumbnailUrl(v: PiConfigVideoEntry): string | null {
    if (v.thumbnailUrl) return v.thumbnailUrl;
    if (!v.path || !this.useLocalThumbnails) return null;
    const path = v.path.replace(/^videos\//, 'thumbnails/').replace(/\.\w+$/, '.jpg');
    return `/${path}?t=${this.cacheBuster}`;
  }

  initials(v: PiConfigVideoEntry): string {
    if (!v.name) return '__icon_play__';
    const words = v.name.trim().split(/\s+/);
    return words.length >= 2
      ? (words[0][0] + words[1][0]).toUpperCase()
      : v.name.substring(0, 2).toUpperCase();
  }

  onThumbError(e: Event): void {
    const img = e.target as HTMLImageElement;
    if (img) {
      img.style.display = 'none';
      img.parentElement?.classList.add('thumbnail-error');
    }
  }

  // Tag type helper for template type-narrowing
  _tagSig?: VideoTag;
}
