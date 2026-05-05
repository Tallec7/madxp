/**
 * Template Studio v3 — Wizard state shared across the 4 steps (ADR-110).
 *
 * The state lives in the parent `StudioV3WizardComponent` (signal) so that
 * step sub-components stay mounted via `[hidden]` (Pitfall P2 — never
 * `*ngIf` per step container). Form values are passed top-down via `@Input`
 * and bubbled up via `@Output` events, never stored in step-local state.
 */

import type {
  TemplateLayer,
  TemplateTextField,
  TemplateImageSlot,
  TemplateOption,
} from '../remotion-templates.types';
import type { RuntimePlayerState } from '../studio-player/template-studio-player.component';

export interface IdentityFormValue {
  name: string;
  description: string;
  durationSec: number;
  fps: number;
  width: number;
  height: number;
}

export interface WizardState {
  templateId: string | null;
  identity: IdentityFormValue;
  layers: TemplateLayer[];
  zones: { textFields: TemplateTextField[]; imageSlots: TemplateImageSlot[] };
  options: TemplateOption[];
  /** Plan 02-02 (PREV-01) — current props snapshot fed to the live Player. Null until step 3 is reached. */
  previewState?: RuntimePlayerState | null;
}

export const DEFAULT_WIZARD_STATE: WizardState = {
  templateId: null,
  identity: {
    name: '',
    description: '',
    durationSec: 5.9,
    fps: 30,
    width: 1920,
    height: 1080,
  },
  layers: [],
  zones: { textFields: [], imageSlots: [] },
  options: [],
  previewState: null,
};

export type WizardStep = 1 | 2 | 3 | 4 | 5;

export const STEP_LABELS: Record<WizardStep, { title: string; subtitle: string }> = {
  1: { title: 'Identité', subtitle: 'Nom, durée, format' },
  2: { title: 'Fonds animés', subtitle: 'Empilez vos calques vidéo' },
  3: { title: 'Zones modifiables', subtitle: 'Texte, image, animations' },
  4: { title: 'Options club', subtitle: "Choix proposés à l'utilisateur" },
  5: { title: 'Validation', subtitle: 'Rendu de test + publication' },
};

/**
 * Plan 03-04 / PUB-01 — Result of a single validation rule check returned
 * by `GET /api/remotion-templates/:id/validation`. The shape mirrors the
 * server registry contract (`central-server/src/services/template-validation/types.ts`).
 */
export interface ValidationResult {
  rule_id: string;
  ok: boolean;
  severity: 'error' | 'warning';
  message?: string;
  fixHint?: { step: number; entityId?: string };
}
