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
import { RemotionPreviewService } from '../remotion-preview.service';
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
  private previewService = inject(RemotionPreviewService);

  selectedVariantId = '';
  textValues: Record<string, string> = {};
  imageUploads: Record<string, string> = {};
  uploadingSlot: Record<string, boolean> = {};
  /** PDF JOUEUR §démarrage — choix posés au démarrage par le user. */
  selectedOptions: Record<string, string> = {};

  playerState: RuntimePlayerState | null = null;

  /**
   * Aspect ratio des thumbnails variante, calqué sur le canvas du template.
   * Évite un ratio 9/16 hardcodé qui déformait les templates 16/9 ou 1/1.
   */
  get variantThumbRatio(): string {
    if (!this.view) return '9 / 16';
    return `${this.view.canvasWidth} / ${this.view.canvasHeight}`;
  }

  /** Variante actuellement sélectionnée — lu par l'empty-state du preview. */
  get activeVariant(): TemplateVariant | null {
    return this.view?.variants.find((v) => v.id === this.selectedVariantId) ?? null;
  }

  /** True si la variante active n'a pas de fond vidéo (template legacy v1→v2
   *  dont le scaffold n'a créé qu'un placeholder vide). */
  get isBackgroundMissing(): boolean {
    const v = this.activeVariant;
    if (!v) return false;
    const url = v.backgroundVideoUrl;
    return !url || !url.trim();
  }

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
    // PDF JOUEUR §démarrage — initialise les options à leur valeur par défaut.
    this.selectedOptions = {};
    for (const opt of this.view.options ?? []) {
      this.selectedOptions[opt.key] = opt.defaultValue;
    }
    this.recomputePlayerState();
    this.scheduleEmit();
  }

  /** PDF JOUEUR — change la valeur d'une option et propage au filtrage des slots. */
  onOptionChange(key: string, value: string): void {
    this.selectedOptions = { ...this.selectedOptions, [key]: value };
    this.recomputePlayerState();
    this.scheduleEmit();
  }

  /**
   * Évalue visible_if d'un slot contre selectedOptions courantes.
   * Cohérent avec le runtime (regex VISIBLE_IF_REGEX dans TemplateRuntime.tsx).
   */
  private static readonly VISIBLE_IF_REGEX = /^\s*([a-z_][a-z0-9_]{0,63})\s*==\s*"([^"]{0,200})"\s*$/i;
  isSlotVisible(visibleIf: string | null | undefined): boolean {
    if (!visibleIf || visibleIf.trim() === '') return true;
    const m = StudioV2EditorComponent.VISIBLE_IF_REGEX.exec(visibleIf);
    if (!m) return true; // fail-open
    const [, key, expectedValue] = m;
    const actual = this.selectedOptions[key];
    return actual !== undefined && actual === expectedValue;
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
    // PDF JOUEUR — required ne s'applique qu'aux slots actuellement visibles.
    for (const tf of this.view.textFields) {
      if (!this.isSlotVisible(tf.visibleIf)) continue;
      if (tf.required && !(this.textValues[tf.slotKey] ?? '').trim()) return false;
    }
    for (const slot of this.view.imageSlots) {
      if (!this.isSlotVisible(slot.visibleIf)) continue;
      if (slot.required && !this.imageUploads[slot.slotKey]) return false;
    }
    return true;
  }

  private recomputePlayerState(): void {
    this.playerState = {
      variants: this.view.variants.map((v) => ({
        id: v.id,
        backgroundVideoUrl: this.previewService.proxyUrl(v.backgroundVideoUrl),
      })),
      layers: this.view.layers.map((l) => ({
        id: l.id,
        videoUrl: this.previewService.proxyUrl(l.videoUrl),
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
        visibleIf: tf.visibleIf,
      })),
      imageSlots: this.view.imageSlots.map((s) => ({
        id: s.id,
        slotKey: s.slotKey,
        position: s.position,
        appearAt: s.appearAt,
        appearDuration: s.appearDuration,
        animation: s.animation,
        visibleIf: s.visibleIf,
      })),
      variantId: this.selectedVariantId,
      textValues: { ...this.textValues },
      imageUploads: { ...this.imageUploads },
      // PDF JOUEUR §démarrage — propagé au runtime pour le filtrage visible_if.
      selectedOptions: { ...this.selectedOptions },
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
        selectedOptions: { ...this.selectedOptions },
      });
      this.readyChange.emit(this.isReady());
    }, 250);
  }
}
