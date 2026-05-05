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
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { RemotionTemplatesDataService } from '../../remotion-templates-data.service';
import type { TemplateStudioView } from '../../remotion-templates.types';
import {
  DEFAULT_WIZARD_STATE,
  IdentityFormValue,
  STEP_LABELS,
  WizardState,
  WizardStep,
} from '../wizard-state.types';
import { WizardStepIdentityComponent } from './wizard-step-identity.component';

const ALL_STEPS: WizardStep[] = [1, 2, 3, 4];

@Component({
  selector: 'app-studio-v3-wizard',
  standalone: true,
  imports: [CommonModule, WizardStepIdentityComponent],
  templateUrl: './studio-v3-wizard.component.html',
  styleUrls: ['./studio-v3-wizard.component.scss'],
})
export class StudioV3WizardComponent implements OnInit {
  private route = inject(ActivatedRoute);
  // Router kept for future programmatic nav (cancel button, etc. plan 05).
  private router = inject(Router);
  private dataService = inject(RemotionTemplatesDataService);
  private location = inject(Location);

  readonly stepLabels = STEP_LABELS;
  readonly allSteps = ALL_STEPS;

  currentStep = signal<WizardStep>(1);
  state = signal<WizardState>({ ...DEFAULT_WIZARD_STATE });
  saving = signal<boolean>(false);
  loadError = signal<string | null>(null);

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
