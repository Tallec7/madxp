import { ChangeDetectionStrategy, Component, EventEmitter, Input, NgZone, OnChanges, OnDestroy, Output, SimpleChanges, inject, signal } from '@angular/core';
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
  styles: [':host{display:contents}.r2-tv-thumb-iframe{position:absolute;inset:0;width:100%;height:100%;border:0;pointer-events:none;opacity:0;transition:opacity 200ms ease;z-index:1}.r2-tv-thumb-iframe.is-loaded{opacity:1}'],
  template: `
    <section class="r2-hero">
      <div class="r2-hero-eyebrow" [class.is-manual]="playingVideo">
        <span class="r2-hero-dot"></span>
        <span>{{ playingVideo ? "Diffusion manuelle" : "À l'antenne" }}</span>
        <!-- ADR-105 Phase A polish — un seul indicateur d'état (REC > LIVE).
             REC prend priorité (état le plus urgent à signaler), LIVE n'apparaît
             que si la boucle "Match" est active sans enregistrement en cours.
             La pastille rouge sur le thumb reste un bouton action (toggle REC),
             pas un indicateur dupliqué. -->
        <span class="r2-tag r2-tag--rec" *ngIf="recording">● REC</span>
        <span class="r2-tag r2-tag--live" *ngIf="!recording && loopId === 'during'">LIVE</span>
      </div>

      <div class="r2-hero-main">
        <div
          class="r2-tv-thumb"
          [class.is-manual]="playingVideo"
          [class.has-preview]="!!previewUrl"
        >
          <!-- ADR-105 Phase A — preview TV directement dans le mini-thumb du
               hero. L'iframe est nativement dimensionnée à la taille du thumb
               (60×38 mobile, 96×54 desktop) — pas de scale CSS, le TvComponent
               s'adapte responsivement. Containment strict via overflow:hidden
               du parent (.r2-tv-thumb a déjà position: relative + overflow). -->
          <iframe
            *ngIf="safePreviewUrl()"
            class="r2-tv-thumb-iframe"
            [class.is-loaded]="iframeLoaded()"
            [src]="safePreviewUrl()"
            (load)="onIframeLoad()"
            sandbox="allow-scripts allow-same-origin"
            loading="lazy"
            aria-hidden="true"
            tabindex="-1"
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

      <div class="r2-hero-progress" *ngIf="playingVideo">
        <span class="r2-hero-progress-bar">
          <span class="r2-hero-progress-fill"
            [style.width.%]="progressPercent()"></span>
        </span>
        <span class="r2-hero-progress-duration" *ngIf="playingVideo.durationSeconds">
          {{ remainingSeconds() }}s
        </span>
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
export class R2HeroComponent implements OnChanges, OnDestroy {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly ngZone = inject(NgZone);

  @Input() loopId: Loop = 'during';
  @Input() loopVideoName?: string;
  @Input() playingVideo: PiConfigVideoEntry | null = null;
  @Input() subline = '';
  @Input() recording = false;
  @Input() displays: DisplayInfo[] = [];
  @Input() targetDisplay = 'all';
  /**
   * ADR-105 Phase A — URL de l'iframe TV preview, injectée dans le mini-thumb
   * du hero. Construite par le parent (`RemoteV2Component.heroPreviewUrl()`)
   * à partir de `document.baseURI + display/0?preview=1`. `null` ⇒ pas
   * d'iframe, le thumb reste un gradient placeholder.
   */
  @Input() previewUrl: string | null = null;

  readonly safePreviewUrl = signal<SafeResourceUrl | null>(null);
  readonly iframeLoaded = signal(false);

  /**
   * Barre de progression vidéo manuelle — pilotée par JS (signal + setInterval)
   * plutôt que par animation CSS. Garantit un reset propre entre vidéos et
   * une progression alignée sur `playingVideo.durationSeconds` (la même
   * valeur sert de TTL côté parent — cf. `remote-v2.component.ts:playVideo`).
   */
  readonly progressPercent = signal(0);
  readonly remainingSeconds = signal(0);
  private progressStart = 0;
  private progressDurationMs = 0;
  private progressTimer: ReturnType<typeof setInterval> | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if ('previewUrl' in changes) {
      this.iframeLoaded.set(false);
      this.safePreviewUrl.set(
        this.previewUrl ? this.sanitizer.bypassSecurityTrustResourceUrl(this.previewUrl) : null,
      );
    }
    if ('playingVideo' in changes) {
      this.resetProgress();
      if (this.playingVideo) {
        this.startProgress(this.playingVideo.durationSeconds || 5);
      }
    }
  }

  ngOnDestroy(): void {
    this.resetProgress();
  }

  onIframeLoad(): void {
    this.iframeLoaded.set(true);
  }

  private startProgress(durationSeconds: number): void {
    this.progressStart = Date.now();
    this.progressDurationMs = durationSeconds * 1000;
    this.progressPercent.set(0);
    this.remainingSeconds.set(durationSeconds);
    this.ngZone.runOutsideAngular(() => {
      this.progressTimer = setInterval(() => {
        const elapsed = Date.now() - this.progressStart;
        const pct = Math.min(100, (elapsed / this.progressDurationMs) * 100);
        const remaining = Math.max(0, Math.ceil((this.progressDurationMs - elapsed) / 1000));
        this.ngZone.run(() => {
          this.progressPercent.set(pct);
          this.remainingSeconds.set(remaining);
        });
        if (pct >= 100 && this.progressTimer) {
          clearInterval(this.progressTimer);
          this.progressTimer = null;
        }
      }, 200);
    });
  }

  private resetProgress(): void {
    if (this.progressTimer) {
      clearInterval(this.progressTimer);
      this.progressTimer = null;
    }
    this.progressPercent.set(0);
    this.remainingSeconds.set(0);
  }

  @Output() setLoop = new EventEmitter<Loop>();
  @Output() setTargetDisplay = new EventEmitter<string>();
  @Output() toggleRecording = new EventEmitter<void>();
  @Output() alignPhase = new EventEmitter<void>();
  /** ADR-103 Phase 2.5 — émis quand l'utilisateur veut couper la diffusion en cours
   *  (vidéo manuelle MP4, page web, ou livestream) et reprendre la boucle. */
  @Output() stopPlaying = new EventEmitter<void>();
}
