/**
 * Template Studio v3 — Wizard shell (ADR-110, plan 03).
 *
 * Mounts on `/content/templates-remotion/new` and `/content/templates-remotion/new/:id`.
 * - currentStep: signal<WizardStep> (1..4) — switches step containers via `[hidden]`
 *   (Pitfall P2 — never *ngIf, so DOM stays mounted for Remotion Player Phase 2).
 * - state: signal<WizardState> — single source of truth across the 4 steps.
 * - On Step 1 Next: calls `dataService.createTemplate(...)` immediately and
 *   `location.replaceState('/.../new/:id')` so refresh resumes (WIZARD-02).
 * - On `/new/:id`: hydrates state from `getStudioView(id)` and resumes at the
 *   first incomplete step (WIZARD-03).
 */

import { CommonModule, Location } from '@angular/common';
import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { RemotionPreviewService } from '../../remotion-preview.service';
import { RemotionTemplatesDataService } from '../../remotion-templates-data.service';
import type {
  TemplateImageSlot,
  TemplateLayer,
  TemplateOption,
  TemplateStudioView,
  TemplateTextField,
} from '../../remotion-templates.types';
import type { RuntimePlayerState } from '../../studio-player/template-studio-player.component';
import {
  DEFAULT_WIZARD_STATE,
  IdentityFormValue,
  STEP_LABELS,
  WizardState,
  WizardStep,
} from '../wizard-state.types';
import { PREVIEW_FIXTURES } from './preview-fixtures';
import { WizardPreviewPanelComponent } from './wizard-preview-panel.component';
import { WizardStepBackgroundsComponent } from './wizard-step-backgrounds.component';
import { WizardStepIdentityComponent } from './wizard-step-identity.component';
import { WizardStepOptionsComponent } from './wizard-step-options.component';
import { WizardStepZonesComponent } from './wizard-step-zones.component';

const ALL_STEPS: WizardStep[] = [1, 2, 3, 4];

@Component({
  selector: 'app-studio-v3-wizard',
  standalone: true,
  imports: [
    CommonModule,
    WizardStepIdentityComponent,
    WizardStepBackgroundsComponent,
    WizardStepZonesComponent,
    WizardStepOptionsComponent,
    WizardPreviewPanelComponent,
  ],
  templateUrl: './studio-v3-wizard.component.html',
  styleUrls: ['./studio-v3-wizard.component.scss'],
})
export class StudioV3WizardComponent implements OnInit {
  private route = inject(ActivatedRoute);
  // Router kept for future programmatic nav (cancel button, etc. plan 05).
  private router = inject(Router);
  private dataService = inject(RemotionTemplatesDataService);
  private previewService = inject(RemotionPreviewService);
  private location = inject(Location);

  readonly stepLabels = STEP_LABELS;
  readonly allSteps = ALL_STEPS;

  currentStep = signal<WizardStep>(1);
  state = signal<WizardState>({ ...DEFAULT_WIZARD_STATE });
  saving = signal<boolean>(false);
  loadError = signal<string | null>(null);

  /**
   * Mirror signals owned by this shell — step components consume them as
   * `WritableSignal` inputs and call `.set(...)` for optimistic UI. The
   * effect below keeps them in sync with the canonical `state` signal.
   * (Plan 03 pattern: form state lifted, step component is pure I/O.)
   */
  layersSignal = signal<TemplateLayer[]>(DEFAULT_WIZARD_STATE.layers);
  textFieldsSignal = signal<TemplateTextField[]>(
    DEFAULT_WIZARD_STATE.zones.textFields,
  );
  imageSlotsSignal = signal<TemplateImageSlot[]>(
    DEFAULT_WIZARD_STATE.zones.imageSlots,
  );
  optionsSignal = signal<TemplateOption[]>(DEFAULT_WIZARD_STATE.options);
  zonesSignal = computed(() => this.state().zones);

  /**
   * Plan 02-04 / UX-03 — When set, the preview panel paints a highlight
   * banner + yellow border around the player to signal which option is
   * being inspected. Auto-cleared after 4s to avoid sticky state.
   */
  highlightedOptionKey = signal<string | null>(null);

  constructor() {
    effect(() => {
      const s = this.state();
      this.layersSignal.set(s.layers);
      this.textFieldsSignal.set(s.zones.textFields);
      this.imageSlotsSignal.set(s.zones.imageSlots);
      this.optionsSignal.set(s.options);
    });

    /**
     * PREV-01 — Recompute previewState whenever the wizard inputs change
     * (identity / layers / zones). The Player is mounted ONCE in the shell
     * (Pitfall P3) and re-renders only via @Input changes — never destroyed.
     */
    effect(() => {
      const s = this.state();
      // Don't compute until step 1 is done — no Player visible yet.
      if (!s.templateId || s.layers.length === 0) {
        if (s.previewState !== null) {
          // Reset when layers go to zero (e.g. user deletes the last layer).
          this.state.update((cur) => ({ ...cur, previewState: null }));
        }
        return;
      }
      const next = this.computePreviewState(s);
      // Replace only when the reference would actually change to avoid
      // an effect feedback loop on the same data.
      if (next !== s.previewState) {
        this.state.update((cur) => ({ ...cur, previewState: next }));
      }
    });
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) this.resumeFromId(id);
  }

  private resumeFromId(id: string): void {
    this.dataService.getStudioView(id).subscribe({
      next: (view) => {
        // TemplateStudioView is flat — identity fields live at the root
        // (camelCase), not under a nested `.template` envelope.
        this.state.update((s) => ({
          ...s,
          templateId: view.id,
          identity: {
            name: view.name,
            description: view.description ?? '',
            durationSec: this.numericOr(view.durationSeconds, 5.9),
            fps: this.numericOr(view.fps, 30),
            width: this.numericOr(view.canvasWidth, 1920),
            height: this.numericOr(view.canvasHeight, 1080),
          },
          layers: view.layers ?? [],
          zones: {
            textFields: view.textFields ?? [],
            imageSlots: view.imageSlots ?? [],
          },
          options: view.options ?? [],
        }));
        this.currentStep.set(this.computeResumeStep(view));
      },
      error: () => {
        this.loadError.set(
          "Impossible de charger ce template (introuvable ou format legacy v1).",
        );
      },
    });
  }

  private computeResumeStep(view: TemplateStudioView): WizardStep {
    // Plan 05 / DUP-01 — quand on arrive depuis une duplication, on saute
    // direct à l'étape 3 (zones modifiables) pour adapter les textes/images
    // du clone, comme prévu par SPEC §Workflow Dupliquer.
    const fromDup = this.route.snapshot.queryParamMap.get('from') === 'duplicate';
    if (fromDup) return 3;
    if (!view.layers || view.layers.length === 0) return 2;
    const zoneCount = (view.textFields?.length ?? 0) + (view.imageSlots?.length ?? 0);
    if (zoneCount === 0) return 3;
    return 4;
  }

  onStep1Submit(value: IdentityFormValue): void {
    this.saving.set(true);
    this.state.update((s) => ({ ...s, identity: value }));

    if (this.state().templateId) {
      // Already created — Plan 05 will add a PATCH for identity edits.
      this.saving.set(false);
      this.currentStep.set(2);
      return;
    }

    const composition_id = this.slugify(value.name) + '-' + Date.now().toString(36);
    this.dataService
      .createTemplate({
        name: value.name,
        composition_id,
        description: value.description || null,
        default_props: {
          duration_seconds: value.durationSec,
          fps: value.fps,
          canvas_width: value.width,
          canvas_height: value.height,
        },
      })
      .subscribe({
        next: (tpl) => {
          this.state.update((s) => ({ ...s, templateId: tpl.id }));
          this.location.replaceState(`/content/templates-remotion/new/${tpl.id}`);
          this.saving.set(false);
          this.currentStep.set(2);
        },
        error: () => {
          this.saving.set(false);
        },
      });
  }

  /**
   * WIZARD-04 — Step 2 emits the new layer list after every mutation
   * (drag-reorder, create, delete). We funnel it back into the canonical
   * state signal so back-nav to Step 1 + return to Step 2 keeps the data.
   */
  onLayersChange(layers: TemplateLayer[]): void {
    this.state.update((s) => ({ ...s, layers }));
  }

  /** WIZARD-05 — Step 3 emits text-fields list after every mutation. */
  onTextFieldsChange(textFields: TemplateTextField[]): void {
    this.state.update((s) => ({
      ...s,
      zones: { ...s.zones, textFields },
    }));
  }

  /** WIZARD-05 — Step 3 emits image-slots list after every mutation. */
  onImageSlotsChange(imageSlots: TemplateImageSlot[]): void {
    this.state.update((s) => ({
      ...s,
      zones: { ...s.zones, imageSlots },
    }));
  }

  /** WIZARD-01 — Step 4 emits options list after every mutation. */
  onOptionsChange(options: TemplateOption[]): void {
    this.state.update((s) => ({ ...s, options }));
  }

  /** WIZARD-01 — Step 4 « Terminer » → retour à la liste des templates. */
  onFinish(): void {
    this.router.navigate(['/content/templates-remotion']);
  }

  /**
   * Plan 02-04 / UX-03 — Click on inline « ✓ N zones reliées » counter in Step 4.
   * Switches to Step 3 (so the zone list is visible), highlights the linked
   * zones in the Player, and scrolls the first matching zone card into view.
   * Auto-clears the highlight after 4s.
   */
  onLinkedZonesClick(optionKey: string): void {
    this.highlightedOptionKey.set(optionKey);
    if (this.currentStep() !== 3) this.goToStep(3);
    setTimeout(() => {
      const re = new RegExp(`\\b${optionKey}\\s*==`);
      const z = this.state().zones;
      const tf = (z.textFields || []).find(
        (f) => f.visibleIf && re.test(f.visibleIf),
      );
      const slot = (z.imageSlots || []).find(
        (s) => s.visibleIf && re.test(s.visibleIf),
      );
      const target = tf ?? slot;
      if (target) {
        document
          .getElementById(`zone-${target.id}`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      // Auto-clear after the user has had time to spot the highlight.
      setTimeout(() => this.highlightedOptionKey.set(null), 4000);
    }, 0);
  }

  /**
   * Plan 02-04 / UX-03 — After a successful renameOptionKey, re-fetch the
   * full studio view so visible_if strings on text_fields / image_slots
   * pick up the regex rewrite (counter recomputes against the new key).
   */
  onZonesRefreshNeeded(): void {
    const id = this.state().templateId;
    if (id) this.resumeFromId(id);
  }

  goToStep(s: WizardStep): void {
    // Back-nav: always allowed. Forward-nav: requires templateId (Step 1 done).
    if (s > this.currentStep() && !this.state().templateId) return;
    this.currentStep.set(s);
  }

  prevStep(): void {
    this.currentStep.update((s) => (s > 1 ? ((s - 1) as WizardStep) : s));
  }

  nextStep(): void {
    this.currentStep.update((s) => (s < 4 ? ((s + 1) as WizardStep) : s));
  }

  /**
   * PREV-01 / PREV-02 — Build a fully-proxied RuntimePlayerState from the
   * current wizard state. Per-layer/per-variant proxyUrl() is delegated to
   * the service (Pitfall P2). Empty user fields fall back to FR fixtures
   * ('PRÉNOM NOM', 'NOM DU CLUB', logo placeholder, photo placeholder).
   *
   * Triggered by the constructor effect AND by Step 3's previewPropsChange
   * output (Plan 02-02 / Task 3 — hybrid debounce/blur).
   */
  private computePreviewState(s: WizardState): RuntimePlayerState {
    const textValues: Record<string, string> = {};
    for (const tf of s.zones.textFields) {
      const dv = (tf.defaultValue ?? '').trim();
      if (dv) {
        textValues[tf.slotKey] = dv;
        continue;
      }
      // Fixture fallback when admin left the default empty.
      const lower = `${tf.slotKey} ${tf.label}`.toLowerCase();
      if (lower.includes('club')) {
        textValues[tf.slotKey] = PREVIEW_FIXTURES.clubName;
      } else if (lower.includes('prenom') || lower.includes('first')) {
        textValues[tf.slotKey] = PREVIEW_FIXTURES.playerFirstName;
      } else if (lower.includes('nom') || lower.includes('last') || lower.includes('name')) {
        textValues[tf.slotKey] = PREVIEW_FIXTURES.playerLastName;
      } else {
        textValues[tf.slotKey] = PREVIEW_FIXTURES.playerFullName;
      }
    }

    const imageUploads: Record<string, string> = {};
    for (const slot of s.zones.imageSlots) {
      const lower = `${slot.slotKey} ${slot.label}`.toLowerCase();
      imageUploads[slot.slotKey] = lower.includes('logo')
        ? PREVIEW_FIXTURES.logoUrl
        : PREVIEW_FIXTURES.photoUrl;
    }

    return this.previewService.buildRuntimePlayerState({
      layers: s.layers,
      // Wizard v3 has no variants column on layers — pass empty array; the
      // service still maps it through proxyUrl recursively (no-op when empty).
      variants: [],
      textFields: s.zones.textFields,
      imageSlots: s.zones.imageSlots,
      canvasWidth: s.identity.width,
      canvasHeight: s.identity.height,
      durationSeconds: s.identity.durationSec,
      fps: s.identity.fps,
      textValues,
      imageUploads,
    }) as unknown as RuntimePlayerState;
  }

  /**
   * Plan 02-02 / PREV-01 — Step 3 emits previewPropsChange after a
   * debounced control change OR a (blur) on a text input. We just bump the
   * effect by re-setting the state; the constructor effect picks it up.
   */
  onPreviewPropsChange(): void {
    const s = this.state();
    if (!s.templateId || s.layers.length === 0) return;
    const next = this.computePreviewState(s);
    this.state.update((cur) => ({ ...cur, previewState: next }));
  }

  private slugify(s: string): string {
    return s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'template';
  }

  private numericOr(value: unknown, fallback: number): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }
}
