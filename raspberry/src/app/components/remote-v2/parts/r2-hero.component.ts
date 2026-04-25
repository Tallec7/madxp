import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
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
        <div class="r2-tv-thumb" [class.is-manual]="playingVideo">
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
export class R2HeroComponent {
  @Input() loopId: Loop = 'during';
  @Input() loopVideoName?: string;
  @Input() playingVideo: PiConfigVideoEntry | null = null;
  @Input() subline = '';
  @Input() recording = false;
  @Input() displays: DisplayInfo[] = [];
  @Input() targetDisplay = 'all';

  @Output() setLoop = new EventEmitter<Loop>();
  @Output() setTargetDisplay = new EventEmitter<string>();
  @Output() toggleRecording = new EventEmitter<void>();
  @Output() alignPhase = new EventEmitter<void>();
}
