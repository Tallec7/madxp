/**
 * ADR-075 Sprint 2 — Éditeur Studio v2 (user-facing).
 *
 * Vue data-driven pour schema_version = 2 :
 *   - Variant picker (fond vidéo au choix)
 *   - Text field inputs (one per slotKey)
 *   - Image slot uploads (one per slotKey, via POST /:id/user-uploads, ADR-077)
 *   - Preview temps réel via <app-template-studio-player> (@remotion/player)
 *
 * Émet `payloadChange` (debounce 250ms) pour que l'orchestrateur rende quand prêt.
 */

import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NotificationService } from '../../../../core/services/notification.service';
import { RemotionTemplatesDataService } from '../remotion-templates-data.service';
import type {
  RenderTemplateRequestV2,
  TemplateImageSlot,
  TemplateStudioView,
  TemplateTextField,
  TemplateVariant,
} from '../remotion-templates.types';
import { TemplateStudioPlayerComponent, RuntimePlayerState } from '../studio-player/template-studio-player.component';

@Component({
  selector: 'app-studio-v2-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, TemplateStudioPlayerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './studio-v2-editor.component.html',
  styleUrls: ['./studio-v2-editor.component.scss'],
})
export class StudioV2EditorComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) view!: TemplateStudioView;

  @Output() payloadChange = new EventEmitter<RenderTemplateRequestV2>();
  @Output() readyChange = new EventEmitter<boolean>();

  private dataService = inject(RemotionTemplatesDataService);
  private notifications = inject(NotificationService);

  selectedVariantId = '';
  textValues: Record<string, string> = {};
  imageUploads: Record<string, string> = {};
  uploadingSlot: Record<string, boolean> = {};

  playerState: RuntimePlayerState | null = null;

  private emitTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['view'] && this.view) {
      this.resetFromView();
    }
  }

  ngOnDestroy(): void {
    if (this.emitTimer) clearTimeout(this.emitTimer);
  }

  private resetFromView(): void {
    this.selectedVariantId = this.view.variants[0]?.id ?? '';
    this.textValues = {};
    for (const tf of this.view.textFields) {
      this.textValues[tf.slotKey] = tf.defaultValue ?? '';
    }
    this.imageUploads = {};
    this.uploadingSlot = {};
    this.recomputePlayerState();
    this.scheduleEmit();
  }

  trackVariant(_i: number, v: TemplateVariant): string {
    return v.id;
  }

  trackTextField(_i: number, f: TemplateTextField): string {
    return f.id;
  }

  trackImageSlot(_i: number, s: TemplateImageSlot): string {
    return s.id;
  }

  selectVariant(v: TemplateVariant): void {
    if (this.selectedVariantId === v.id) return;
    this.selectedVariantId = v.id;
    this.recomputePlayerState();
    this.scheduleEmit();
  }

  onTextChange(slotKey: string, value: string): void {
    this.textValues = { ...this.textValues, [slotKey]: value };
    this.recomputePlayerState();
    this.scheduleEmit();
  }

  onImageFile(slot: TemplateImageSlot, fileList: FileList | null): void {
    const file = fileList?.[0];
    if (!file) return;
    this.uploadingSlot = { ...this.uploadingSlot, [slot.slotKey]: true };
    this.dataService.uploadUserImage(this.view.id, file, slot.slotKey).subscribe({
      next: ({ url }) => {
        this.uploadingSlot = { ...this.uploadingSlot, [slot.slotKey]: false };
        this.imageUploads = { ...this.imageUploads, [slot.slotKey]: url };
        this.recomputePlayerState();
        this.scheduleEmit();
        this.notifications.success(`Image "${slot.label}" uploadée`);
      },
      error: (err) => {
        this.uploadingSlot = { ...this.uploadingSlot, [slot.slotKey]: false };
        const msg = (err?.error?.error as string) || 'Échec upload image';
        this.notifications.error(msg);
      },
    });
  }

  removeImage(slot: TemplateImageSlot): void {
    const { [slot.slotKey]: _removed, ...rest } = this.imageUploads;
    void _removed;
    this.imageUploads = rest;
    this.recomputePlayerState();
    this.scheduleEmit();
  }

  charCount(slotKey: string): number {
    return (this.textValues[slotKey] ?? '').length;
  }

  isReady(): boolean {
    if (!this.selectedVariantId) return false;
    for (const tf of this.view.textFields) {
      if (tf.required && !(this.textValues[tf.slotKey] ?? '').trim()) return false;
    }
    for (const slot of this.view.imageSlots) {
      if (slot.required && !this.imageUploads[slot.slotKey]) return false;
    }
    return true;
  }

  private recomputePlayerState(): void {
    this.playerState = {
      variants: this.view.variants.map((v) => ({
        id: v.id,
        backgroundVideoUrl: v.backgroundVideoUrl,
      })),
      layers: this.view.layers.map((l) => ({
        id: l.id,
        videoUrl: l.videoUrl,
        zIndex: l.zIndex,
        mask: l.mask,
      })),
      textFields: this.view.textFields.map((tf) => ({
        id: tf.id,
        slotKey: tf.slotKey,
        position: tf.position,
        maxWidth: tf.maxWidth,
        fontFamily: tf.fontFamily,
        fontSize: tf.fontSize,
        color: tf.color,
        align: tf.align,
        appearAt: tf.appearAt,
        appearDuration: tf.appearDuration,
        animation: tf.animation,
        defaultValue: tf.defaultValue,
      })),
      imageSlots: this.view.imageSlots.map((s) => ({
        id: s.id,
        slotKey: s.slotKey,
        position: s.position,
        appearAt: s.appearAt,
        appearDuration: s.appearDuration,
        animation: s.animation,
      })),
      variantId: this.selectedVariantId,
      textValues: { ...this.textValues },
      imageUploads: { ...this.imageUploads },
      // ADR-075 — Canvas dimensions piloté par le template (format picker admin).
      canvasWidth: this.view.canvasWidth,
      canvasHeight: this.view.canvasHeight,
      durationSeconds: this.view.durationSeconds,
      fps: this.view.fps,
    };
  }

  private scheduleEmit(): void {
    if (this.emitTimer) clearTimeout(this.emitTimer);
    this.emitTimer = setTimeout(() => {
      this.payloadChange.emit({
        variantId: this.selectedVariantId,
        textValues: { ...this.textValues },
        imageUploads: { ...this.imageUploads },
      });
      this.readyChange.emit(this.isReady());
    }, 250);
  }
}
