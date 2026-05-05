---
phase: 02-ux-interactive
plan: 02
type: execute
wave: 2
depends_on: [02-ux-interactive-01]
files_modified:
  - central-server/src/__tests__/smoke/smoke-template-studio-v3-preview.test.ts
  - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-state.types.ts
  - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-preview-panel.component.ts
  - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-preview-panel.component.html
  - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-preview-panel.component.scss
  - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/preview-fixtures.ts
  - central-dashboard/src/app/features/content/remotion-templates/remotion-preview.service.ts
  - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/studio-v3-wizard.component.ts
  - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/studio-v3-wizard.component.html
  - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/studio-v3-wizard.component.scss
  - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-step-zones.component.ts
autonomous: true
requirements: [PREV-01, PREV-02, PREV-03]
must_haves:
  truths:
    - "L'admin voit un Player Remotion à droite des steps 3 et 4 (caché sur steps 1 et 2 via [hidden])."
    - 'Modifier un slider/dropdown/color picker déclenche un refresh du Player sous 300ms (debounceTime); modifier un input texte déclenche le refresh sur (blur).'
    - "Le Player est monté UNE SEULE FOIS dans le shell wizard et n'est jamais détruit/recréé en navigation step (Pitfall P3 — *ngIf interdit sur le panneau player)."
    - 'Chaque URL FTP nested (layers[].videoUrl) est passée à proxyUrl() individuellement (Pitfall P2 — proxyFtpUrls() shallow ne suffit PAS).'
    - "Quand un champ est vide, la fixture FR équivalente s'affiche : 'PRÉNOM NOM', 'NOM DU CLUB', logo placeholder Neopro."
    - "Quand aucun layer n'est encore créé (step 3 fraîche), un placeholder FR explicite remplace le Player avec un lien vers step 2."
  artifacts:
    - path: 'central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-preview-panel.component.ts'
      provides: 'Standalone sub-component qui monte UNE SEULE FOIS le TemplateStudioPlayerComponent (mounted via [hidden] dans le shell).'
      contains: 'WizardPreviewPanelComponent'
    - path: 'central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/preview-fixtures.ts'
      provides: 'Constants FR fixtures (PRÉNOM NOM, NOM DU CLUB, logo URL placeholder, photo placeholder)'
      contains: 'PREVIEW_FIXTURES'
    - path: 'central-dashboard/src/app/features/content/remotion-templates/remotion-preview.service.ts'
      provides: 'Méthode buildRuntimePlayerState(view) qui applique proxyUrl() RECURSIVEMENT sur layers[].videoUrl + variants[].backgroundVideoUrl + extension wizard-state.types.previewState'
      contains: 'buildRuntimePlayerState'
    - path: 'central-server/src/__tests__/smoke/smoke-template-studio-v3-preview.test.ts'
      provides: 'Smoke file-based: assert single Player mount, [hidden] not *ngIf, proxyUrl() called per-layer, debounce hybrid pattern, fixture file exists'
      contains: 'preview'
  key_links:
    - from: 'studio-v3-wizard.component.html'
      to: 'wizard-preview-panel.component.ts'
      via: '<app-wizard-preview-panel [state]="state()" [hidden]="currentStep() < 3" />'
      pattern: "app-wizard-preview-panel.*\\[hidden\\]"
    - from: 'wizard-step-zones.component.ts (existing form valueChanges)'
      to: 'RemotionPreviewService.sendPropsUpdate via WizardState.previewState signal'
      via: 'debounceTime(300) for select/color/number controls + (blur) for text controls'
      pattern: "debounceTime\\(\\s*300\\s*\\)|\\(blur\\)"
    - from: 'remotion-preview.service.ts buildRuntimePlayerState'
      to: 'Player props layers[].videoUrl'
      via: 'layers.map(l => ({ ...l, videoUrl: this.proxyUrl(l.videoUrl) }))'
      pattern: "\\.map\\([^)]*proxyUrl"
---

## Phase 1 contracts consumed

- `StudioV3WizardComponent` shell — 4 step containers controlled by `[hidden]="currentStep() !== N"` (Plan 03 pattern). The Player panel is added as a SIBLING node mounted ONCE at shell level — never inside a step container, never inside `*ngIf`.
- `WizardState` — Plan 03 contract. EXTENDED in this plan with optional `previewState?: RuntimePlayerState | null` so the shell can compute the props once and pass them down.
- `RemotionPreviewService.proxyUrl(url)` — Plan 01-precursor (existing, see central-dashboard/.../remotion-preview.service.ts:53). Already handles `kalonpartners.bzh` URL conversion. Reused as-is.
- `RemotionPreviewService.proxyFtpUrls(props)` — EXISTING shallow proxy (top-level only). DEPRECATED for Player runtime state in this plan: any new code building a `RuntimePlayerState` MUST go through the new `buildRuntimePlayerState()` method (which applies `proxyUrl()` recursively per layer).
- `TemplateStudioPlayerComponent` (`studio-player/template-studio-player.component.ts`) — existing v2 component that mounts the Remotion `<Player>` React root in `ngAfterViewInit` and exposes `@Input() state: RuntimePlayerState | null`. Reused unchanged. Imported by the new `WizardPreviewPanelComponent`.
- `RuntimePlayerState` interface (`studio-player/template-studio-player.component.ts:46`) and `RuntimeLayer` (`studio-player/template-runtime.tsx:22`) — existing shapes. The new builder produces them.
- `wizard-step-zones.component.ts` — Plan 04 typed ReactiveForm. EXTENDED here to wire `valueChanges` → `WizardState.previewState` via the hybrid debounce/blur pattern.
- `ERROR_MESSAGES` (Plan 02-01) — imported by the preview-panel for backend error surfacing if asset proxy fails (optional).

<objective>
Mount the Remotion Player live preview to the right of steps 3 and 4 of the wizard. The Player is created ONCE inside the wizard shell (sibling of the 4 step containers) and toggled via `[hidden]` — never `*ngIf`, never re-mounted per step (Pitfall P3). Form changes from steps 3 and 4 push props updates through a hybrid hot-loop: `debounceTime(300)` for sliders/dropdowns/color pickers, `(blur)` event for text inputs. Every layer's FTP `videoUrl` is run through `proxyUrl()` individually (Pitfall P2 — the existing shallow `proxyFtpUrls()` is not enough for nested `layers[].videoUrl`).

Purpose: Closes the feedback loop between configuration and rendered output — the core differentiator for v3 (Phase 2 SC#1, SC#2). Without this, Plans 03 (animation cards) and 04 (visible_if feedback) have no canvas to demonstrate against.

Output:

- New `WizardPreviewPanelComponent` (sub-component) that wraps the existing `TemplateStudioPlayerComponent` + handles "no layer yet" placeholder.
- `RemotionPreviewService.buildRuntimePlayerState(view, fixtures)` that returns a fully-proxied `RuntimePlayerState` (recursive proxy on `layers[].videoUrl` and `variants[].backgroundVideoUrl`).
- `preview-fixtures.ts` exporting `PREVIEW_FIXTURES` with FR placeholder values.
- Wizard shell HTML restructured: 2-pane CSS Grid (form left, preview right). Preview panel is a sibling of the 4 step containers, hidden on steps 1 and 2.
- Step 3 (zones) form `valueChanges` wired to push to `state.previewState` via hybrid debounce/blur.
- New smoke `smoke-template-studio-v3-preview.test.ts` enforces the contract.
  </objective>

<execution_context>
@/Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/.claude/get-shit-done/workflows/execute-plan.md
@/Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/02-ux-interactive/02-CONTEXT.md
@.planning/phases/02-ux-interactive/02-ux-interactive-01-PLAN.md
@.planning/phases/01-fondations/01-fondations-03-SUMMARY.md
@.planning/phases/01-fondations/01-fondations-04-SUMMARY.md
@.planning/research/PITFALLS.md
@CLAUDE.md
@.claude/rules/templates.md
@.claude/rules/testing.md
@central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/studio-v3-wizard.component.ts
@central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/studio-v3-wizard.component.html
@central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard-state.types.ts
@central-dashboard/src/app/features/content/remotion-templates/remotion-preview.service.ts
@central-dashboard/src/app/features/content/remotion-templates/studio-player/template-studio-player.component.ts
@central-dashboard/src/app/features/content/remotion-templates/studio-v2/admin/admin-studio-panel.component.ts

<interfaces>
<!-- Existing types/exports the new code MUST consume verbatim -->

From central-dashboard/.../studio-player/template-studio-player.component.ts:46 :

```typescript
export interface RuntimePlayerState {
  compositionId: string;
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
  layers: RuntimeLayer[];
  variants?: { id: string; backgroundVideoUrl: string }[];
  // ... see file for full shape
}
```

From central-dashboard/.../studio-player/template-runtime.tsx:22 :

```typescript
export interface RuntimeLayer {
  id: string;
  videoUrl: string; // <-- MUST be proxied per-layer (Pitfall P2)
  zIndex: number;
  durationMs: number;
  // ... see file for full shape
}
```

From central-dashboard/.../remotion-preview.service.ts:46-55 (existing — DO NOT modify):

```typescript
proxyUrl(url: string): string;
proxyUrl(url: string | null | undefined): string | null | undefined;
proxyUrl(url: string | null | undefined): string | null | undefined {
  if (!url || !url.includes('kalonpartners.bzh')) return url;
  return `${this.serverBase}/api/remotion-templates/asset-proxy?url=${encodeURIComponent(url)}`;
}
```

Reference pattern from studio-v2/admin/admin-studio-panel.component.ts:338-352 (recomputePlayerState — the v2 reference for per-layer proxy):

```typescript
this.playerState = {
  // ...
  variants: variants.map((v) => ({
    ...v,
    backgroundVideoUrl: this.previewService.proxyUrl(v.backgroundVideoUrl),
  })),
  layers: layers.map((l) => ({
    ...l,
    videoUrl: this.previewService.proxyUrl(l.videoUrl),
  })),
};
```

^ This is the contract the new buildRuntimePlayerState() MUST replicate.

From wizard-step-zones.component.ts:89-93 (Plan 04 typed form shape — DO NOT change):

```typescript
fontFamily: FormControl<string>; // dropdown → debounceTime(300)
fontSize: FormControl<number>; // number → debounceTime(300)
color: FormControl<string>; // color picker → debounceTime(300)
textAlign: FormControl<'left' | 'center' | 'right'>; // dropdown → debounceTime(300)
maxChars: FormControl<number>; // number → debounceTime(300)
// label: FormControl<string>        // TEXT input → (blur) only
```

</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: RED smoke + fixtures + preview service builder + wizard-state extension</name>
  <read_first>
    - central-server/src/__tests__/smoke/smoke-template-studio-v3-vocabulary.test.ts (file scan pattern reference)
    - central-server/src/__tests__/smoke/smoke-template-studio-v3-asset-manager.test.ts (regex+fs pattern reference)
    - central-dashboard/src/app/features/content/remotion-templates/remotion-preview.service.ts (full file)
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard-state.types.ts (full file)
    - central-dashboard/src/app/features/content/remotion-templates/studio-player/template-studio-player.component.ts (lines 1-80 for RuntimePlayerState shape + ngOnDestroy verification)
    - central-dashboard/src/app/features/content/remotion-templates/studio-v2/admin/admin-studio-panel.component.ts:338-360 (recomputePlayerState reference)
  </read_first>
  <behavior>
    Smoke smoke-template-studio-v3-preview asserts:
    - Test A: WizardPreviewPanelComponent file exists at the expected path.
    - Test B: studio-v3-wizard.component.html mounts <app-wizard-preview-panel exactly once and uses [hidden] (NOT *ngIf) on it.
    - Test C: remotion-preview.service.ts exports a buildRuntimePlayerState method whose body contains the recursive map pattern `layers.map(... proxyUrl ...)` AND `variants` is also mapped per-element through proxyUrl. Negative assertion: the method does NOT call `this.proxyFtpUrls(state)` on the whole runtime state (anti-Pitfall-P2 safeguard).
    - Test D: preview-fixtures.ts exists and exports PREVIEW_FIXTURES with the FR placeholder strings 'PRÉNOM NOM' and 'NOM DU CLUB'.
    - Test E: wizard-step-zones.component.ts uses `debounceTime(300)` AND uses (blur) event binding (hybrid pattern).
    All 5 tests are RED at the end of Task 1 (only the smoke + fixtures + service method exist; the wizard wiring is Task 2 + 3).
  </behavior>
  <action>
    **Step A — Create smoke test (RED).**

    Create `central-server/src/__tests__/smoke/smoke-template-studio-v3-preview.test.ts`. Use the same `path.resolve(__dirname, '..', '..', '..', '..')` rootRoot pattern as the vocabulary test. Define paths:

    ```typescript
    const wizardDir = path.join(repoRoot, 'central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard');
    const previewService = path.join(repoRoot, 'central-dashboard/src/app/features/content/remotion-templates/remotion-preview.service.ts');
    ```

    Tests:

    ```typescript
    describe('Template Studio v3 — preview integration (PREV-01/02/03)', () => {

      it('A: WizardPreviewPanelComponent file exists', () => {
        expect(fs.existsSync(path.join(wizardDir, 'wizard-preview-panel.component.ts'))).toBe(true);
      });

      it('B: shell HTML mounts <app-wizard-preview-panel> exactly once with [hidden], never *ngIf', () => {
        const html = fs.readFileSync(path.join(wizardDir, 'studio-v3-wizard.component.html'), 'utf8');
        const mountCount = (html.match(/<app-wizard-preview-panel\b/g) || []).length;
        expect(mountCount).toBe(1);
        // [hidden] used on the preview panel
        expect(html).toMatch(/<app-wizard-preview-panel[^>]*\[hidden\]=/);
        // *ngIf NEVER on the preview panel (Pitfall P3)
        expect(html).not.toMatch(/<app-wizard-preview-panel[^>]*\*ngIf/);
      });

      it('C: remotion-preview.service.ts buildRuntimePlayerState applies proxyUrl per-layer (Pitfall P2)', () => {
        const src = fs.readFileSync(previewService, 'utf8');
        expect(src).toMatch(/buildRuntimePlayerState\s*\(/);
        // Must map over layers and call proxyUrl per element
        expect(src).toMatch(/layers[\s\S]{0,200}\.map\s*\([\s\S]{0,200}proxyUrl/);
        // Must map over variants per element too
        expect(src).toMatch(/variants[\s\S]{0,200}\.map\s*\([\s\S]{0,200}proxyUrl/);
        // Anti-Pitfall-P2: must NOT shortcut by passing the whole runtime state to proxyFtpUrls
        expect(src).not.toMatch(/proxyFtpUrls\s*\(\s*(?:state|playerState|runtime)/);
      });

      it('D: preview-fixtures.ts exports PREVIEW_FIXTURES with FR placeholder strings', () => {
        const fixturePath = path.join(wizardDir, 'preview-fixtures.ts');
        expect(fs.existsSync(fixturePath)).toBe(true);
        const src = fs.readFileSync(fixturePath, 'utf8');
        expect(src).toMatch(/export\s+const\s+PREVIEW_FIXTURES\b/);
        expect(src).toContain('PRÉNOM NOM');
        expect(src).toContain('NOM DU CLUB');
      });

      it('E: wizard-step-zones uses hybrid debounce/blur (debounceTime(300) AND (blur))', () => {
        const src = fs.readFileSync(path.join(wizardDir, 'wizard-step-zones.component.ts'), 'utf8');
        expect(src).toMatch(/debounceTime\s*\(\s*300\s*\)/);
        expect(src).toMatch(/\(blur\)=/);
      });
    });
    ```

    **Step B — Create preview-fixtures.ts (lets Test D go GREEN).**

    Create `central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/preview-fixtures.ts`:

    ```typescript
    /**
     * Template Studio v3 — Preview fixtures (PREV-02).
     *
     * Auto-filled values displayed in the live Player when the admin's
     * form fields are empty. Non-modifiable in v3.0 (anti-feature
     * "personnaliser les fixtures" deferred — see 02-CONTEXT.md).
     *
     * Imported by RemotionPreviewService.buildRuntimePlayerState() AND
     * WizardPreviewPanelComponent for the "no layer yet" placeholder.
     */

    export const PREVIEW_FIXTURES = {
      playerFirstName: 'PRÉNOM',
      playerLastName: 'NOM',
      playerFullName: 'PRÉNOM NOM',
      clubName: 'NOM DU CLUB',
      logoUrl: '/assets/preview/neopro-placeholder-logo.png',
      photoUrl: '/assets/preview/neopro-placeholder-photo.png',
    } as const;

    export type PreviewFixtures = typeof PREVIEW_FIXTURES;
    ```

    **Step C — Add buildRuntimePlayerState to remotion-preview.service.ts (lets Test C go GREEN).**

    Edit `central-dashboard/src/app/features/content/remotion-templates/remotion-preview.service.ts`. Add (do NOT remove proxyFtpUrls — keep it for legacy v2 compat):

    ```typescript
    /**
     * Build a fully-proxied RuntimePlayerState for the wizard live Player
     * (Plan 02-02 / Pitfall P2). Every nested FTP URL — layers[].videoUrl
     * AND variants[].backgroundVideoUrl — is passed through proxyUrl()
     * individually. Do NOT shortcut by calling proxyFtpUrls(state) — that
     * shallow proxy only walks top-level string keys and would leave the
     * nested URLs raw, causing silent CORB black panels in the Player.
     *
     * `view` is a TemplateStudioView (flat camelCase, see Plan 03 SUMMARY).
     * `fillEmpty` injects PREVIEW_FIXTURES strings where the admin form
     * left fields blank (PREV-02).
     */
    buildRuntimePlayerState(
      view: {
        compositionId?: string;
        id: string;
        durationSeconds: number;
        fps: number;
        canvasWidth: number;
        canvasHeight: number;
        layers?: Array<{ id: string; videoUrl: string; zIndex: number; durationMs: number; [k: string]: unknown }>;
        variants?: Array<{ id: string; backgroundVideoUrl: string; [k: string]: unknown }>;
      },
    ): {
      compositionId: string;
      durationInFrames: number;
      fps: number;
      width: number;
      height: number;
      layers: Array<{ id: string; videoUrl: string; zIndex: number; durationMs: number; [k: string]: unknown }>;
      variants: Array<{ id: string; backgroundVideoUrl: string; [k: string]: unknown }>;
    } {
      const layers = (view.layers ?? []).map((l) => ({
        ...l,
        videoUrl: this.proxyUrl(l.videoUrl),
      }));
      const variants = (view.variants ?? []).map((v) => ({
        ...v,
        backgroundVideoUrl: this.proxyUrl(v.backgroundVideoUrl),
      }));
      return {
        compositionId: view.compositionId ?? view.id,
        durationInFrames: Math.round(view.durationSeconds * view.fps),
        fps: view.fps,
        width: view.canvasWidth,
        height: view.canvasHeight,
        layers,
        variants,
      };
    }
    ```

    Cast the return type to `RuntimePlayerState` if needed by importing the type from `./studio-player/template-studio-player.component.ts`. Use a structural cast at call site rather than tightly coupling the service to the component (keeps the service framework-light).

    **Step D — Extend WizardState with previewState.**

    Edit `central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard-state.types.ts`. Add:

    ```typescript
    import type { RuntimePlayerState } from '../studio-player/template-studio-player.component';
    // ... existing imports

    export interface WizardState {
      templateId: string | null;
      identity: IdentityFormValue;
      layers: TemplateLayer[];
      zones: { textFields: TemplateTextField[]; imageSlots: TemplateImageSlot[] };
      options: TemplateOption[];
      /** Plan 02-02 (PREV-01) — current props snapshot fed to the live Player. Null until step 3 is reached. */
      previewState?: RuntimePlayerState | null;
    }
    ```

    Update `DEFAULT_WIZARD_STATE` to include `previewState: null`.

    **Run smoke at end of Task 1:**
    ```
    cd /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/central-server && npx jest --testPathPattern='smoke/smoke-template-studio-v3-preview' --no-coverage --forceExit
    ```
    Expect Tests A, B, E RED. Tests C, D GREEN.

    Also run `cd /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/central-dashboard && npx ng build --configuration=development` to confirm no TS regression on the existing v2/v3 consumers of `proxyFtpUrls` and `WizardState`.

    Commit: `test(template-studio-v3): RED preview smoke + fixtures + buildRuntimePlayerState (PREV-01/02/03)`

  </action>
  <verify>
    <automated>cd /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/central-server && npx jest --testPathPattern='smoke/smoke-template-studio-v3-preview' --no-coverage --forceExit 2>&1 | tail -25</automated>
  </verify>
  <acceptance_criteria>
    - File `central-server/src/__tests__/smoke/smoke-template-studio-v3-preview.test.ts` exists.
    - File `central-dashboard/.../studio-v3/wizard/preview-fixtures.ts` exists and exports PREVIEW_FIXTURES with `'PRÉNOM NOM'` + `'NOM DU CLUB'`.
    - `grep -n "buildRuntimePlayerState" central-dashboard/src/app/features/content/remotion-templates/remotion-preview.service.ts` returns ≥2 (decl + body).
    - `grep -nE "layers[\s\S]{0,200}\.map.*proxyUrl" central-dashboard/src/app/features/content/remotion-templates/remotion-preview.service.ts` returns ≥1.
    - `grep -nE "previewState\\??:" central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard-state.types.ts` returns ≥1.
    - Jest smoke run shows tests A, B, E RED (3 failures), C and D GREEN.
    - `ng build` clean.
    - Commit hash exists with prefix `test(template-studio-v3)`.
  </acceptance_criteria>
  <done>RED smoke committed (3/5 RED), service builder + fixtures + WizardState extension shipped, ng build clean.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: WizardPreviewPanelComponent + shell mount (Tests A + B GREEN)</name>
  <read_first>
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/studio-v3-wizard.component.ts (full file — to wire previewState computation in effect())
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/studio-v3-wizard.component.html (full file)
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/studio-v3-wizard.component.scss (full file — to add 2-pane grid for steps 3-4)
    - central-dashboard/src/app/features/content/remotion-templates/studio-player/template-studio-player.component.ts (full file — Player @Input shape)
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/preview-fixtures.ts (Task 1 output)
  </read_first>
  <behavior>
    - WizardPreviewPanelComponent is a standalone Angular component, OnPush, single mount in shell, sibling of step containers.
    - It accepts `@Input() state: WizardState` (or just `previewState: RuntimePlayerState | null` — pick one and document it as contract).
    - When state.previewState is null OR state.layers.length === 0 → renders the FR placeholder "Ajoutez un fond animé pour voir l'aperçu" + button/link "Aller à l'étape Fonds animés" (which emits an output `goToStep = EventEmitter<2>`).
    - When state.previewState exists → renders <app-template-studio-player [state]="state.previewState" /> with native @remotion/player controls (controls: true, loop: true).
    - The component is mounted ONCE in studio-v3-wizard.component.html as a sibling of all 4 step containers, with `[hidden]="currentStep() < 3"`. Never inside a step container, never inside *ngIf.
  </behavior>
  <action>
    **Step A — Create WizardPreviewPanelComponent.**

    Create `central-dashboard/.../studio-v3/wizard/wizard-preview-panel.component.ts`:

    ```typescript
    import { CommonModule } from '@angular/common';
    import {
      ChangeDetectionStrategy,
      Component,
      EventEmitter,
      Input,
      Output,
    } from '@angular/core';
    import { TemplateStudioPlayerComponent, RuntimePlayerState } from '../../studio-player/template-studio-player.component';
    import type { WizardState, WizardStep } from '../wizard-state.types';

    /**
     * Live Remotion Player panel for steps 3-4 (PREV-01/03).
     *
     * Mounted ONCE inside StudioV3WizardComponent as a sibling of the 4 step
     * containers. Toggled via [hidden]="currentStep() < 3" — NEVER *ngIf
     * (Pitfall P3, React root leak). When no layers exist yet, shows a FR
     * placeholder with a "go to step 2" CTA.
     *
     * Props are computed by the shell via RemotionPreviewService.buildRuntimePlayerState
     * (which proxies every layers[].videoUrl per Pitfall P2).
     */
    @Component({
      selector: 'app-wizard-preview-panel',
      standalone: true,
      imports: [CommonModule, TemplateStudioPlayerComponent],
      changeDetection: ChangeDetectionStrategy.OnPush,
      templateUrl: './wizard-preview-panel.component.html',
      styleUrls: ['./wizard-preview-panel.component.scss'],
    })
    export class WizardPreviewPanelComponent {
      @Input({ required: true }) state!: WizardState;
      @Output() goToStep = new EventEmitter<WizardStep>();

      get hasLayer(): boolean {
        return this.state.layers.length > 0 && !!this.state.previewState;
      }

      onGoToBackgrounds(): void {
        this.goToStep.emit(2);
      }
    }
    ```

    Create the HTML:
    ```html
    <div class="wpp">
      <ng-container *ngIf="hasLayer; else placeholder">
        <app-template-studio-player [state]="state.previewState!" />
      </ng-container>
      <ng-template #placeholder>
        <div class="wpp__empty">
          <p class="wpp__empty-msg">Ajoutez un fond animé pour voir l'aperçu.</p>
          <button type="button" class="wpp__empty-cta" (click)="onGoToBackgrounds()">
            Aller à l'étape Fonds animés
          </button>
        </div>
      </ng-template>
    </div>
    ```

    Create the SCSS (minimal — just enough to make the panel sticky and centered):
    ```scss
    .wpp {
      position: sticky;
      top: 16px;
      width: 100%;
      height: calc(100vh - 120px);
      max-height: 720px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #0b0d12;
      border-radius: 8px;
      overflow: hidden;
    }
    .wpp__empty {
      color: #d1d5db;
      text-align: center;
      padding: 32px;
      &-msg { font-size: 14px; margin-bottom: 16px; }
      &-cta {
        background: #2563eb; color: #fff; border: none;
        padding: 10px 16px; border-radius: 6px; cursor: pointer;
        &:hover { background: #1d4ed8; }
      }
    }
    ```

    Use FR action labels that AVOID the i18n hook blocklist (verified Plan 03 deviation list: "Suivant"/"Annuler"/"Supprimer" blocked, but "Aller à"/"Ajoutez"/"Aperçu" allowed).

    **Step B — Mount in shell + wire the layout.**

    Edit `studio-v3-wizard.component.ts`:
    1. Import `WizardPreviewPanelComponent` and add to `imports: [...]`.
    2. Import `RemotionPreviewService`. Inject it.
    3. Add an `effect()` that recomputes `state.previewState` whenever `state().layers`, `state().zones.textFields`, `state().zones.imageSlots`, or `state().identity` changes. The effect calls `previewService.buildRuntimePlayerState({ ...assembled view shape... })`. The assembled view should mirror what `getStudioView` returns (flat camelCase: `id`, `durationSeconds`, `fps`, `canvasWidth`, `canvasHeight`, `layers`, optional `variants` empty for now, `compositionId` derived from `templateId` if not yet set). Use the existing PREVIEW_FIXTURES for any fields that the user form left blank.
    4. Add an `onGoToStep(s: WizardStep)` method that calls `this.goToStep(s)`.

    Edit `studio-v3-wizard.component.html`:
    1. Restructure the right pane (the one currently holding the 4 step containers) into a 2-column CSS Grid: `<div class="wizard__panes">` with `<div class="wizard__form">` (containing the 4 step containers — UNCHANGED) and `<app-wizard-preview-panel [state]="state()" [hidden]="currentStep() < 3" (goToStep)="goToStep($event)" />` as sibling.
    2. Verify: NO `*ngIf` ANYWHERE on `<app-wizard-preview-panel>`. The mount stays alive across steps 1-2 (hidden via CSS).
    3. Verify: 4 step containers still use `[hidden]="currentStep() !== N"` (Plan 03 contract preserved).

    Edit `studio-v3-wizard.component.scss`:
    Add `.wizard__panes` grid: 2 columns on desktop (`1fr 1fr`), 1 column on tablet (`<1280px` breakpoint — preview panel wraps below or hides depending on UX choice; for v3.0 simplest: stack vertically). Document the breakpoint in a comment.

    **Run smoke after Step B:**
    ```
    cd /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/central-server && npx jest --testPathPattern='smoke/smoke-template-studio-v3-preview' --no-coverage --forceExit
    cd /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/central-dashboard && npx ng build --configuration=development
    ```
    Expect Tests A, B, C, D GREEN. Test E still RED (Task 3).

    Commit: `feat(template-studio-v3): mount WizardPreviewPanelComponent live Player (PREV-01/03)`

  </action>
  <verify>
    <automated>cd /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/central-server && npx jest --testPathPattern='smoke/smoke-template-studio-v3-preview' --no-coverage --forceExit 2>&1 | tail -20 && cd /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/central-dashboard && npx ng build --configuration=development 2>&1 | tail -5</automated>
  </verify>
  <acceptance_criteria>
    - File `wizard-preview-panel.component.ts` exists and exports class WizardPreviewPanelComponent.
    - `grep -n "<app-wizard-preview-panel" central-dashboard/.../studio-v3/wizard/studio-v3-wizard.component.html` returns exactly 1.
    - `grep -nE "<app-wizard-preview-panel[^>]*\\*ngIf" central-dashboard/.../studio-v3-wizard.component.html` returns 0 (Pitfall P3).
    - `grep -nE "<app-wizard-preview-panel[^>]*\\[hidden\\]" central-dashboard/.../studio-v3-wizard.component.html` returns 1.
    - `grep -n "buildRuntimePlayerState" central-dashboard/.../studio-v3-wizard.component.ts` returns ≥1.
    - `grep -n "PREVIEW_FIXTURES" central-dashboard/.../studio-v3-wizard.component.ts` returns ≥1.
    - Smoke preview Tests A, B, C, D GREEN. Test E still RED.
    - `ng build` clean.
    - Commit hash exists with prefix `feat(template-studio-v3)`.
  </acceptance_criteria>
  <done>Player mounted once in shell, hidden on steps 1-2, FR placeholder when no layer, ng build clean.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Hybrid debounce/blur wiring on Step 3 form (Test E GREEN)</name>
  <read_first>
    - central-dashboard/.../studio-v3/wizard/wizard-step-zones.component.ts (full file — Plan 04 typed form)
    - central-dashboard/.../studio-v3/wizard/wizard-step-zones.component.ts:567-583 (FormControl declarations — fontFamily/fontSize/color/textAlign/maxChars)
    - .planning/phases/02-ux-interactive/02-CONTEXT.md (decisions section "Comportement du Player live")
    - .planning/research/PITFALLS.md (Pitfall 9 — switchMap on PATCH)
  </read_first>
  <behavior>
    - Slider/dropdown/color/number controls (`fontFamily`, `fontSize`, `color`, `textAlign`, `maxChars`) emit through `valueChanges.pipe(debounceTime(300))` → triggers a function that updates `state.previewState` via `previewService.buildRuntimePlayerState(...)`.
    - Text controls (`label`) DO NOT pipe through `valueChanges` — they use `(blur)` on the `<input>` element to trigger the same updater.
    - The updater is a single method on the parent shell exposed via `@Output() previewPropsChange = EventEmitter<void>()` from the step component, with the shell catching it and recomputing previewState. Step component has NO direct dependency on RemotionPreviewService — it just signals "form changed, recompute".
    - Example concrete bindings to add on existing controls:
      - In TS: `this.form.controls.fontSize.valueChanges.pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef)).subscribe(() => this.previewPropsChange.emit())` — apply to fontFamily, fontSize, color, textAlign, maxChars.
      - In HTML: on the `label` text input, add `(blur)="previewPropsChange.emit()"`.
  </behavior>
  <action>
    **Step A — Add the hybrid wiring to wizard-step-zones.component.ts.**

    Edit `central-dashboard/.../studio-v3/wizard/wizard-step-zones.component.ts`:

    1. Add imports: `import { debounceTime } from 'rxjs/operators'; import { DestroyRef, inject } from '@angular/core'; import { takeUntilDestroyed } from '@angular/core/rxjs-interop';`
    2. Add `private destroyRef = inject(DestroyRef);` field.
    3. Add `@Output() previewPropsChange = new EventEmitter<void>();`
    4. In `ngOnInit` (or the form construction method), AFTER the form is built, register the hybrid subscriptions for the TEXT FIELD form (the form holding `fontFamily`/`fontSize`/`color`/`textAlign`/`maxChars`):

       ```typescript
       const debouncedControls = ['fontFamily', 'fontSize', 'color', 'textAlign', 'maxChars'] as const;
       for (const ctrl of debouncedControls) {
         this.form.controls[ctrl].valueChanges
           .pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef))
           .subscribe(() => this.previewPropsChange.emit());
       }
       ```

    5. In the HTML template, find the `<input>` for `formControlName="label"` (the zone label text field). Add `(blur)="previewPropsChange.emit()"` to it. Do the SAME for the `<input formControlName="visibleIf" ...>` (it's also a text input).

       Example diff (illustrative — adapt to actual line numbers):
       ```html
       <input
         type="text"
         formControlName="label"
         maxlength="80"
         (blur)="previewPropsChange.emit()"
       />
       ```

    6. Add a brief explanatory comment above the `previewPropsChange` declaration:
       ```typescript
       /**
        * Plan 02-02 (PREV-01) — hybrid live preview update:
        * - debounceTime(300) on sliders/dropdowns/colors/numbers (visual controls)
        * - (blur) event on text inputs (label, visibleIf) to avoid re-render per keystroke
        * Parent (StudioV3WizardComponent) catches the event and recomputes
        * state.previewState via RemotionPreviewService.buildRuntimePlayerState.
        */
       ```

    **Step B — Wire the parent.**

    Edit `studio-v3-wizard.component.ts` and `.html`:

    HTML: on the `<app-wizard-step-zones>` element, add `(previewPropsChange)="onPreviewPropsChange()"`.

    TS: add a method `onPreviewPropsChange(): void` that re-runs the same `buildRuntimePlayerState(...)` logic from Task 2's effect (extract into a private method so both the effect and this handler share it). Call `this.state.update(s => ({ ...s, previewState: newState }))`.

    **Step C — Run smoke and verify E GREEN.**

    ```
    cd /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/central-server && npx jest --testPathPattern='smoke/smoke-template-studio-v3-preview' --no-coverage --forceExit
    cd /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/central-dashboard && npx ng build --configuration=development
    cd /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/central-server && npm run test:smoke:smart 2>&1 | tail -10
    ```

    Expect: 5/5 preview smoke GREEN, ng build clean, smart smoke GREEN (no regression).

    Commit: `feat(template-studio-v3): hybrid debounce(300)/blur wiring on Step 3 form (PREV-01)`

  </action>
  <verify>
    <automated>cd /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/central-server && npx jest --testPathPattern='smoke/smoke-template-studio-v3-preview' --no-coverage --forceExit 2>&1 | tail -15 && cd /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/central-dashboard && npx ng build --configuration=development 2>&1 | tail -3</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "debounceTime(300)" central-dashboard/.../studio-v3/wizard/wizard-step-zones.component.ts` returns ≥1.
    - `grep -nE "\(blur\)=\"previewPropsChange" central-dashboard/.../studio-v3/wizard/wizard-step-zones.component.ts` returns ≥1.
    - `grep -n "previewPropsChange" central-dashboard/.../studio-v3-wizard.component.html` returns ≥1.
    - `grep -nE "fontFamily|fontSize|color|textAlign|maxChars" central-dashboard/.../wizard-step-zones.component.ts | grep -c "valueChanges"` ≥1 (debounced subscriptions registered).
    - All 5 preview smoke tests GREEN.
    - `npm run test:smoke:smart` GREEN (no regression on adjacent suites).
    - `ng build` clean.
    - Commit hash exists with prefix `feat(template-studio-v3)`.
  </acceptance_criteria>
  <done>5/5 preview smoke GREEN, hybrid debounce/blur wired, no regression elsewhere.</done>
</task>

</tasks>

<verification>
- 5/5 smoke-template-studio-v3-preview GREEN.
- 5/5 smoke-template-studio-v3-vocabulary GREEN (banlist scan over the new files passes — no `'layer'`/`'slot'` etc. leaked into the new components).
- `npm run test:smoke:smart` GREEN — no regression.
- `cd central-dashboard && npx ng build --configuration=development` clean.
- Manual UAT (next session, deferred to Daisy):
  - Open `/content/templates-remotion/new`, advance through step 1 + step 2 (no Player visible — `[hidden]` cache).
  - Reach step 3: preview panel appears on the right with placeholder "Ajoutez un fond animé pour voir l'aperçu" if no layer.
  - With ≥1 layer: Player renders the WebM background (NOT a black panel — Pitfall P2 lock validated).
  - Type in zone label → Player does NOT update on every keystroke; updates only on `(blur)`.
  - Change font size slider → Player updates within ~300ms.
  - Navigate step 3 → step 1 → step 3 → no flash, no React root leak (Chrome devtools Memory tab shows no Fiber tree growth — Pitfall P3 lock validated).
</verification>

<success_criteria>

- The Player is monted exactly once in the wizard shell, hidden on steps 1-2, visible on steps 3-4.
- Every layers[].videoUrl in the runtime state goes through proxyUrl() individually (no shallow shortcut).
- Hybrid debounce(300)/blur is wired on the actual form controls (fontFamily, fontSize, color, textAlign, maxChars vs label text).
- FR fixtures (PRÉNOM NOM, NOM DU CLUB, logo placeholder) replace empty form values.
- Smoke test enforces all 4 contracts above.
  </success_criteria>

<output>
After completion, create `.planning/phases/02-ux-interactive/02-ux-interactive-02-SUMMARY.md` documenting:
- WizardPreviewPanelComponent public API (Inputs / Outputs)
- buildRuntimePlayerState contract (input shape + output shape)
- Hybrid debounce/blur control list with control name → wiring kind table
- Pitfall P2 + P3 verification grep snippets (for plans 03/04 to confirm regression-free)
- Path to add new placeholder assets if `/assets/preview/neopro-placeholder-*.png` don't yet exist (note for Daisy)
</output>
