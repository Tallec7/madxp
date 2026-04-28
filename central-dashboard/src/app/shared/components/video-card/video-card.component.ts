import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-video-card',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="vc"
      [class.vc--selected]="selected"
      [class.vc--clickable]="clickable"
      (click)="clickable && cardClick.emit()"
    >
      <div class="vc__thumb">
        <img *ngIf="thumbnailUrl" [src]="thumbnailUrl" [alt]="title" loading="lazy" />
        <div *ngIf="!thumbnailUrl" class="vc__thumb-fallback">
          <span>{{ thumbnailPlaceholder }}</span>
        </div>
        <span *ngIf="thumbOverlayLeft" class="vc__thumb-overlay vc__thumb-overlay--left">{{
          thumbOverlayLeft
        }}</span>
        <span *ngIf="thumbOverlayRight" class="vc__thumb-overlay vc__thumb-overlay--right">{{
          thumbOverlayRight
        }}</span>
        <span
          *ngIf="cornerBadge"
          class="vc__corner-badge"
          [class.vc__corner-badge--warning]="cornerBadgeVariant === 'warning'"
          [title]="cornerBadgeTooltip || cornerBadge"
          >{{ cornerBadge }}</span
        >
      </div>
      <div class="vc__body">
        <div class="vc__title" [title]="titleTooltip || title">{{ title }}</div>
        <div *ngIf="subtitle" class="vc__subtitle">{{ subtitle }}</div>
        <div *ngIf="metaParts?.length" class="vc__meta">
          <ng-container *ngFor="let part of metaParts; let last = last">
            <span>{{ part }}</span>
            <span *ngIf="!last" class="vc__meta-sep">•</span>
          </ng-container>
        </div>
        <div class="vc__badges"><ng-content select="[card-badges]"></ng-content></div>
        <div class="vc__actions"><ng-content select="[card-actions]"></ng-content></div>
      </div>
      <ng-content select="[card-extras]"></ng-content>
    </div>
  `,
  styleUrls: ['./video-card.component.scss'],
})
export class VideoCardComponent {
  @Input() thumbnailUrl: string | null = null;
  @Input() thumbnailPlaceholder = '🎬';
  @Input() thumbOverlayLeft: string | null = null;
  @Input() thumbOverlayRight: string | null = null;
  @Input() title = '';
  @Input() titleTooltip: string | null = null;
  @Input() subtitle: string | null = null;
  @Input() metaParts: string[] = [];
  @Input() selected = false;
  @Input() clickable = false;
  /** Corner badge top-right (ex: "×3" pour signaler un doublon dedup). */
  @Input() cornerBadge: string | null = null;
  @Input() cornerBadgeTooltip: string | null = null;
  @Input() cornerBadgeVariant: 'neutral' | 'warning' = 'neutral';
  @Output() cardClick = new EventEmitter<void>();
}
