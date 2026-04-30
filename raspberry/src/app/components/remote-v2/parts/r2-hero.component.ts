import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { PiConfigVideoEntry } from '../../../interfaces/video.interface';

export type Loop = 'neutral' | 'before' | 'during' | 'after';

export interface DisplayInfo {
  id: string;
  label: string;
  status: 'online' | 'offline';
}

/**
 * Hero "À l'antenne" — TV thumb + nom vidéo + subline + REC badge + loop selector + display target.
 * Présentationnel pur — délègue setLoop / setTargetDisplay / toggleRecording / alignPhaseToLoop au parent.
 */
@Component({
  selector: 'app-r2-hero',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host { display: contents; }'],
  template: `
    <section class="r2-hero">
      <div class="r2-hero-eyebrow" [class.is-manual]="playingVideo">
        <span class="r2-hero-dot"></span>
        <span>{{ playingVideo ? "Diffusion manuelle" : "À l'antenne" }}</span>
        <span class="r2-tag r2-tag--live" *ngIf="recording || loopId === 'during'">LIVE</span>
        <span class="r2-tag r2-tag--rec" *ngIf="recording">● REC</span>
      </div>

      <div class="r2-hero-main">
        <div
          class="r2-tv-thumb"
          [class.is-manual]="playingVideo"
          [class.has-preview]="!!previewUrl"
        >
          <iframe
            *ngIf="safePreviewUrl()"
            [src]="safePreviewUrl()"
            class="r2-tv-thumb-stream"
            sandbox="allow-scripts allow-same-origin"
            loading="lazy"
            tabindex="-1"
            aria-hidden="true"
            title="Preview TV"
          ></iframe>
          <span class="r2-tv-scanline"></span>
          <button
            class="r2-rec-badge"
            [class.active]="recording"
            (click)="toggleRecording.emit()"
            aria-label="Enregistrer"
          >
            <span class="r2-rec-dot"></span>
          </button>
        </div>
        <div class="r2-hero-info">
          <span class="r2-video-name">{{ playingVideo ? playingVideo.name : (loopVideoName || 'Aucune vidéo') }}</span>
          <span class="r2-video-subline">{{ subline }}</span>
        </div>
        <div class="r2-hero-progress" *ngIf="playingVideo">
          <span class="r2-hero-progress-duration" *ngIf="playingVideo.durationSeconds">
            {{ playingVideo.durationSeconds }}s
          </span>
          <span class="r2-hero-progress-bar">
            <span class="r2-hero-progress-fill"
              [style.animation-duration.s]="playingVideo.durationSeconds || 5"></span>
          </span>
        </div>
        <!-- ADR-103 Phase 2.5 — bouton Stop pour couper la diffusion en cours
             (vidéo manuelle, page web ou livestream) et revenir à la boucle. -->
        <button class="r2-stop-btn-circle" *ngIf="playingVideo" aria-label="Arrêter et revenir à la boucle"
          title="Arrêter et revenir à la boucle"
          (click)="stopPlaying.emit()">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="6" y="6" width="12" height="12" rx="2"/>
          </svg>
        </button>
        <button class="r2-loop-btn-circle" *ngIf="!playingVideo" aria-label="Boucle"
          (click)="alignPhase.emit()">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 2 21 6l-4 4"/><path d="M3 12V8a4 4 0 0 1 4-4h14"/>
            <path d="M7 22 3 18l4-4"/><path d="M21 12v4a4 4 0 0 1-4 4H3"/>
          </svg>
        </button>
      </div>

      <div class="r2-loop-tabs-wrap">
        <div class="r2-hero-section-label">
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 2 21 6l-4 4"/><path d="M3 12V8a4 4 0 0 1 4-4h14"/>
            <path d="M7 22 3 18l4-4"/><path d="M21 12v4a4 4 0 0 1-4 4H3"/>
          </svg>
          Boucle active
        </div>
        <div class="r2-loop-tabs">
          <button [class.active]="loopId === 'neutral'" (click)="setLoop.emit('neutral')">Défaut</button>
          <button [class.active]="loopId === 'before'" (click)="setLoop.emit('before')">Avant</button>
          <button [class.active]="loopId === 'during'" (click)="setLoop.emit('during')">Match</button>
          <button [class.active]="loopId === 'after'" (click)="setLoop.emit('after')">Après</button>
        </div>
      </div>

      <div class="r2-display-wrap" *ngIf="displays.length > 0">
        <div class="r2-hero-section-label">Cible vidéo</div>
        <div class="r2-display-target">
          <button [class.active]="targetDisplay === 'all'" (click)="setTargetDisplay.emit('all')">
            Tous
          </button>
          <button
            *ngFor="let d of displays"
            [class.active]="targetDisplay === d.id"
            (click)="setTargetDisplay.emit(d.id)"
          >
            {{ d.label }}
          </button>
        </div>
      </div>
    </section>
  `,
})
export class R2HeroComponent implements OnChanges {
  private readonly sanitizer = inject(DomSanitizer);

  @Input() loopId: Loop = 'during';
  @Input() loopVideoName?: string;
  @Input() playingVideo: PiConfigVideoEntry | null = null;
  @Input() subline = '';
  @Input() recording = false;
  @Input() displays: DisplayInfo[] = [];
  @Input() targetDisplay = 'all';
  /**
   * URL absolue de la page TV à embarquer dans la mini-thumb iframe (ADR-105).
   * Construite par RemoteV2Component.computeTvPreviewIframeUrl() (avec
   * `?preview=1` pour mute audio + skip analytics + skip socket-register).
   * Sur layout `desktop-pro`, le parent route l'URL vers `<app-r2-tv-monitor>`
   * et passe `null` ici (mutex single-iframe).
   */
  @Input() previewUrl: string | null = null;

  /** SafeResourceUrl wrapper — recomputé à chaque changement de previewUrl. */
  readonly safePreviewUrl = signal<SafeResourceUrl | null>(null);

  @Output() setLoop = new EventEmitter<Loop>();
  @Output() setTargetDisplay = new EventEmitter<string>();
  @Output() toggleRecording = new EventEmitter<void>();
  @Output() alignPhase = new EventEmitter<void>();
  /** ADR-103 Phase 2.5 — émis quand l'utilisateur veut couper la diffusion en cours
   *  (vidéo manuelle MP4, page web, ou livestream) et reprendre la boucle. */
  @Output() stopPlaying = new EventEmitter<void>();

  ngOnChanges(changes: SimpleChanges): void {
    if ('previewUrl' in changes) {
      this.safePreviewUrl.set(
        this.previewUrl
          ? this.sanitizer.bypassSecurityTrustResourceUrl(this.previewUrl)
          : null,
      );
    }
  }
}
