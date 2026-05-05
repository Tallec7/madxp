---
phase: 03-gate-publication
plan: 04
type: execute
wave: 2
depends_on: ['03-gate-publication-02', '03-gate-publication-03']
files_modified:
  - central-dashboard/src/app/features/content/remotion-templates/studio-v3/vocabulary.constants.ts
  - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-step-publish.component.ts
  - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-step-publish.component.html
  - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-step-publish.component.scss
  - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/studio-v3-wizard.component.ts
  - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/studio-v3-wizard.component.html
  - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-preview-panel.component.ts
  - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-preview-panel.component.html
  - central-dashboard/src/app/features/content/remotion-templates/remotion-templates-data.service.ts
  - central-dashboard/src/app/features/content/remotion-templates/remotion-preview.service.ts
  - central-server/src/__tests__/smoke/smoke-template-studio-v3-vocabulary.test.ts
autonomous: true
requirements: [PUB-01, PUB-02]
must_haves:
  truths:
    - "Step 5 'Validation' rendu via [hidden] (jamais *ngIf — Pitfall P3)"
    - 'Checklist consomme GET /:id/validation et affiche ✓/✗/⚠ + label FR + fixHint deep-link'
    - "Toggle 'Aperçu live / Rendu de test' sur le panneau Player (Player reste monté)"
    - 'VOCABULARY_RULE_LABELS expose 8 entrées FR figées + ERROR_MESSAGES.test_render_failed'
    - 'Smoke vocabulary banlist étendue scelle les 8 labels + erreur FR test render'
  artifacts:
    - path: central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-step-publish.component.ts
      provides: 'Step5 component standalone — checklist + Publier button gated + deep-link Corriger'
    - path: central-dashboard/src/app/features/content/remotion-templates/studio-v3/vocabulary.constants.ts
      provides: 'VALIDATION_RULE_LABELS + ERROR_MESSAGES.test_render_failed'
  key_links:
    - from: studio-v3-wizard.component.html
      to: <wizard-step-publish [hidden]="currentStep() !== 5">
      via: 'Pattern [hidden] cohérent steps 1-4'
      pattern: "wizard-step-publish[\\s\\S]+\\[hidden\\]"
    - from: WizardStepPublishComponent
      to: GET /:id/validation
      via: 'RemotionTemplatesDataService.getValidation(id)'
      pattern: "getValidation\\("
    - from: Toggle 'Rendu de test'
      to: RemotionPreviewService.setMode('test-render')
      via: 'Player reste monté, switch source URL'
      pattern: "setMode\\(['\"]test-render"
---

<objective>
Wizard Step 5 'Validation' (`[hidden]`) consommant `GET /:id/validation`, déclenchant test render via `POST /:id/test-render`, affichant résultat dans Player toggle. Bouton "Publier" disabled tant qu'≥1 erreur. Deep-link "Corriger" vers step+entité fautive.

Purpose: Phase 3 success criteria #1 + #2 — UX gate publication. PUB-01 + PUB-02 frontend.
Output: 1 step component, 1 toggle Player, vocabulaire FR figé par smoke étendu.
</objective>

<execution_context>
@/Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/.claude/get-shit-done/workflows/execute-plan.md
@/Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/phases/03-gate-publication/03-CONTEXT.md
@.planning/phases/02-ux-interactive/02-ux-interactive-VERIFICATION.md
@docs/specs/features/template-studio-v3.spec.md
@CLAUDE.md
@.claude/rules/templates.md

<interfaces>
Phase 1+2 patterns to extend (READ FIRST) :

```typescript
// studio-v3-wizard.component.ts
export type WizardStep = 1 | 2 | 3 | 4; // → étendre à 1 | 2 | 3 | 4 | 5
currentStep = signal<WizardStep>(1);
// HTML : 4 containers [hidden]="currentStep() !== N" — ajouter le 5e
```

```typescript
// vocabulary.constants.ts
export const ERROR_MESSAGES = { ... } as const;   // étendre avec test_render_failed
// AJOUTER:
export const VALIDATION_RULE_LABELS: Record<string, string> = {
  at_least_one_layer: 'Au moins un fond animé empilé',
  assets_resolve_http_200: 'Tous les fonds résolvent (accessibles en ligne)',
  fonts_known: 'Toutes les polices sont connues',
  zones_in_safe_zone: 'Toutes les zones sont en zone sûre',
  visible_if_keys_exist: 'Conditions d\'apparition cohérentes avec les options',
  packshot_refs_options_match: 'Vidéos packshot correspondent aux options',
  packshot_refs_target_published: 'Vidéos packshot pointent vers des templates publiés',
  recent_test_render_24h: 'Test de rendu réussi récemment (24h)',
};
```

```typescript
// remotion-templates-data.service.ts — ADD
getValidation(templateId: string): Observable<{results: ValidationResult[]}>;
createTestRender(templateId: string): Observable<{jobId: string; status: string}>;
getRenderJob(jobId: string): Observable<{status: string; video_url?: string; progress: number}>;
```

```typescript
// remotion-preview.service.ts — ADD
setMode(mode: 'live' | 'test-render'): void;
loadTestRenderUrl(url: string): void;
// Le Player reste monté ; setMode swap source sans démonter (Pitfall P2 respecté)
```

Wizard FR vocab (CONTEXT.md L142) — strings exactes à utiliser :

- Bouton : "Publier ce template"
- Tooltip disabled : "Corrigez d'abord les {N} critères en rouge"
- Toggle : "Aperçu live" / "Rendu de test"
- Toast échec : "Le rendu de test a échoué — vérifiez vos fonds animés et fonts."
- Bandeau warning : "Lancez un test de rendu pour valider votre template."
- Lien fix : "Corriger →"

i18n blocklist (Phase 1 deviation, Phase 2 reuse) : ne pas utiliser "Suivant", "Annuler", "Oui", "Non", "Publier" en standalone — utiliser "Continuer →", "Abandonner", "Activé", "Désactivé", "Publier ce template" (libellé long, déjà figé SPEC L93).

Banlist additions (smoke-template-studio-v3-vocabulary) :

- Conserver les bans Phase 1+2 (`layer`, `slot`, `pix_fmt`, `option_key`, `composition_id`, `scaleFrom`, `scaleTo`, `durationMs`).
- AJOUTER aucun nouveau ban — au contraire, ajouter Test 6 qui asserte que `VALIDATION_RULE_LABELS` contient exactement 8 entries et qu'aucune valeur ne contient un mot banni.

Pattern `[hidden]` Phase 1 (Pitfall P3 — GPU SharedImage leak interdit) :

```html
<wizard-step-publish
  [hidden]="currentStep() !== 5"
  [templateId]="templateId()"
  [validationResults]="validationResults()"
  (requestTestRender)="onRequestTestRender()"
  (publish)="onPublish()"
  (fixHint)="onFixHint($event)"
/>
```

</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extend smoke vocabulary — VALIDATION_RULE_LABELS + test_render_failed</name>
  <files>central-server/src/__tests__/smoke/smoke-template-studio-v3-vocabulary.test.ts</files>
  <read_first>
    - central-server/src/__tests__/smoke/smoke-template-studio-v3-vocabulary.test.ts (existing 5 tests + BANLIST)
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/vocabulary.constants.ts (existing VOCABULARY_MAP + ERROR_MESSAGES)
  </read_first>
  <action>
    Add Test 6 (RED) to existing smoke file — DO NOT remove the 5 existing tests :

    ```typescript
    describe('VALIDATION_RULE_LABELS (Phase 3 PUB-01)', () => {
      const vocab = readFileSync(
        'central-dashboard/src/app/features/content/remotion-templates/studio-v3/vocabulary.constants.ts',
        'utf8'
      );
      it('exports 8 FR labels matching server rule IDs', () => {
        expect(vocab).toMatch(/VALIDATION_RULE_LABELS/);
        const expectedIds = [
          'at_least_one_layer','assets_resolve_http_200','fonts_known','zones_in_safe_zone',
          'visible_if_keys_exist','packshot_refs_options_match','packshot_refs_target_published',
          'recent_test_render_24h',
        ];
        for (const id of expectedIds) {
          expect(vocab).toMatch(new RegExp(`${id}\\s*:\\s*['"]`));
        }
      });
      it('declares ERROR_MESSAGES.test_render_failed in FR', () => {
        expect(vocab).toMatch(/test_render_failed:\s*['"]Le rendu de test a échoué/);
      });
      it('VALIDATION_RULE_LABELS values contain no DB jargon', () => {
        const m = vocab.match(/VALIDATION_RULE_LABELS[\s\S]*?\}\s*;/);
        expect(m).not.toBeNull();
        const block = m![0];
        for (const banned of ['layer','slot','pix_fmt','option_key','composition_id','scaleFrom','scaleTo','durationMs','visible_if']) {
          expect(block).not.toMatch(new RegExp(`['"]\\b${banned}\\b['"]`));
        }
      });
    });
    ```

    Lancer : `cd central-server && npx jest --testPathPattern='smoke-template-studio-v3-vocabulary' --no-coverage --forceExit` → 3 nouveaux tests DOIVENT être RED, les 5 anciens GREEN.
    Commit : `test(03-04): extend vocab smoke for VALIDATION_RULE_LABELS + test_render_failed`.

  </action>
  <verify>
    <automated>cd central-server && npx jest --testPathPattern='smoke-template-studio-v3-vocabulary' --no-coverage --forceExit 2>&1 | grep -E 'failed.*\d|passed.*\d'</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "VALIDATION_RULE_LABELS" central-server/src/__tests__/smoke/smoke-template-studio-v3-vocabulary.test.ts` returns ≥ 3
    - `grep "test_render_failed" central-server/src/__tests__/smoke/smoke-template-studio-v3-vocabulary.test.ts` returns ≥ 1
    - jest reports exactly 3 new failed tests + 5 passing baseline tests
    - Commit message starts with `test(03-04):`
  </acceptance_criteria>
  <done>3 RED tests committed, baseline preserved.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Vocabulary extension + Step 5 component + Player toggle + dataservice</name>
  <files>central-dashboard/src/app/features/content/remotion-templates/studio-v3/vocabulary.constants.ts, central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-step-publish.component.ts, central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-step-publish.component.html, central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-step-publish.component.scss, central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/studio-v3-wizard.component.ts, central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/studio-v3-wizard.component.html, central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-preview-panel.component.ts, central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-preview-panel.component.html, central-dashboard/src/app/features/content/remotion-templates/remotion-templates-data.service.ts, central-dashboard/src/app/features/content/remotion-templates/remotion-preview.service.ts</files>
  <read_first>
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/vocabulary.constants.ts (full file — figer le format exact ERROR_MESSAGES)
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/studio-v3-wizard.component.ts (currentStep signal type + WizardStep export)
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/studio-v3-wizard.component.html (4 [hidden] containers — ajouter le 5e)
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-step-options.component.ts (pattern d'output `linkedZonesClick` Phase 2 — réutiliser le shape pour `fixHint`)
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-preview-panel.component.ts (existing inputs : `state`, `highlightedOptionKey` — ajouter `mode` + `testRenderUrl`)
    - central-dashboard/src/app/features/content/remotion-templates/remotion-preview.service.ts (existing `buildRuntimePlayerState` — ajouter `setMode`/`loadTestRenderUrl`)
    - central-dashboard/src/app/features/content/remotion-templates/remotion-templates-data.service.ts (existing patterns d'Observable + headers auth)
  </read_first>
  <behavior>
    - Step 5 component standalone (Angular 20, signals + ChangeDetection.OnPush) ; props `[templateId]`, `[validationResults]` ; outputs `(requestTestRender)`, `(publish)`, `(fixHint: { step: number; entityId?: string })`.
    - On step entry (effect on `currentStep()===5`), parent calls `dataService.getValidation(templateId)` → results stored in signal `validationResults`. Re-validation on focus or after retour depuis autre step.
    - Publish button : `[disabled]="(errorCount() > 0)"`, `title="Corrigez d\'abord les {N} critères en rouge".replace('{N}', errorCount())`.
    - Each row : `<div class="vrow vrow--{{result.severity}} vrow--{{result.ok ? 'ok' : 'fail'}}">` with icon ✓/✗/⚠, label from `VALIDATION_RULE_LABELS[result.rule_id]`, message, "Corriger →" link emitting `fixHint` event.
    - Parent shell handles `fixHint` : sets `currentStep.set(fixHint.step)` ; if entityId provided, sets `highlightedSlotId` signal (similar to Phase 2 highlightedOptionKey pattern).
    - Player toggle : new input `[mode]` ('live'|'test-render') on `wizard-preview-panel.component.ts` ; segmented control HTML with 2 buttons "Aperçu live" / "Rendu de test" ; clicking "Rendu de test" emits `(modeChange)` to shell which polls `dataService.getRenderJob(jobId)` until status=success → loads URL via `RemotionPreviewService.loadTestRenderUrl(url)`.
    - On render failure : show toast `ERROR_MESSAGES.test_render_failed` ("Le rendu de test a échoué — vérifiez vos fonds animés et fonts.").
    - Player NEVER recreated (Pitfall P2/P3 respected) — `setMode` only swaps internal source signal.
  </behavior>
  <action>
    1. Extend `vocabulary.constants.ts` :
    ```typescript
    export const VALIDATION_RULE_LABELS: Record<string, string> = {
      at_least_one_layer: 'Au moins un fond animé empilé',
      assets_resolve_http_200: 'Tous les fonds résolvent (accessibles en ligne)',
      fonts_known: 'Toutes les polices sont connues',
      zones_in_safe_zone: 'Toutes les zones sont en zone sûre',
      visible_if_keys_exist: "Conditions d'apparition cohérentes avec les options",
      packshot_refs_options_match: 'Vidéos packshot correspondent aux options',
      packshot_refs_target_published: 'Vidéos packshot pointent vers des templates publiés',
      recent_test_render_24h: 'Test de rendu réussi récemment (24h)',
    } as const;
    ```
    Étendre `ERROR_MESSAGES` avec :
    ```typescript
    test_render_failed: 'Le rendu de test a échoué — vérifiez vos fonds animés et fonts.',
    ```
    Étendre `ErrorMessageCode` type avec `'test_render_failed'`.

    2. Étendre `WizardStep` type in `studio-v3-wizard.component.ts` à `1 | 2 | 3 | 4 | 5` ; signals/computeResumeStep adapter pour accepter step 5.

    3. Créer `wizard-step-publish.component.ts` (standalone, OnPush) :
    ```typescript
    @Component({
      selector: 'wizard-step-publish',
      standalone: true,
      imports: [CommonModule],
      templateUrl: './wizard-step-publish.component.html',
      styleUrls: ['./wizard-step-publish.component.scss'],
      changeDetection: ChangeDetectionStrategy.OnPush,
    })
    export class WizardStepPublishComponent {
      readonly templateId = input.required<string>();
      readonly validationResults = input.required<ValidationResult[]>();
      readonly testRenderInProgress = input<boolean>(false);

      readonly requestTestRender = output<void>();
      readonly publish = output<void>();
      readonly fixHint = output<{ step: number; entityId?: string }>();

      readonly errorCount = computed(() => this.validationResults().filter(r => r.severity === 'error' && !r.ok).length);
      readonly canPublish = computed(() => this.errorCount() === 0);
      readonly disabledTitle = computed(() =>
        this.canPublish() ? '' : `Corrigez d'abord les ${this.errorCount()} critères en rouge`
      );
      readonly LABELS = VALIDATION_RULE_LABELS;
    }
    ```

    4. HTML `wizard-step-publish.component.html` :
    ```html
    <div class="wsp">
      <h2 class="wsp__title">Validation</h2>
      <ul class="wsp__list">
        <li *ngFor="let r of validationResults()"
            class="vrow"
            [class.vrow--ok]="r.ok"
            [class.vrow--fail]="!r.ok && r.severity === 'error'"
            [class.vrow--warning]="!r.ok && r.severity === 'warning'">
          <span class="vrow__icon">{{ r.ok ? '✓' : (r.severity === 'error' ? '✗' : '⚠') }}</span>
          <span class="vrow__label">{{ LABELS[r.rule_id] }}</span>
          <span class="vrow__msg">{{ r.message }}</span>
          <button *ngIf="!r.ok && r.fixHint"
                  class="vrow__fix"
                  type="button"
                  (click)="fixHint.emit(r.fixHint!)">Corriger →</button>
        </li>
      </ul>
      <div class="wsp__actions">
        <button class="wsp__test"
                type="button"
                [disabled]="testRenderInProgress()"
                (click)="requestTestRender.emit()">
          {{ testRenderInProgress() ? 'Rendu en cours…' : 'Lancer un rendu de test' }}
        </button>
        <button class="wsp__publish"
                type="button"
                [disabled]="!canPublish()"
                [title]="disabledTitle()"
                (click)="publish.emit()">
          Publier ce template
        </button>
      </div>
    </div>
    ```

    5. Mount in `studio-v3-wizard.component.html` (5e container, après les 4 existants) :
    ```html
    <wizard-step-publish [hidden]="currentStep() !== 5"
                         [templateId]="templateId()"
                         [validationResults]="validationResults()"
                         [testRenderInProgress]="testRenderInProgress()"
                         (requestTestRender)="onRequestTestRender()"
                         (publish)="onPublish()"
                         (fixHint)="onFixHint($event)" />
    ```

    6. Shell `studio-v3-wizard.component.ts` :
    - Add `validationResults = signal<ValidationResult[]>([])`, `testRenderInProgress = signal(false)`, `currentTestRenderJobId = signal<string|null>(null)`.
    - Effect : when `currentStep() === 5`, call `dataService.getValidation(templateId()).subscribe(r => validationResults.set(r.results))`.
    - `onRequestTestRender()` : set inProgress, call `dataService.createTestRender(id)`, store jobId, start polling (2s interval) `getRenderJob(jobId)` until status=success|failed. On success : `previewService.loadTestRenderUrl(url)` + `previewService.setMode('test-render')`. On failure : toast `ERROR_MESSAGES.test_render_failed` + reset inProgress.
    - `onFixHint(hint)` : `currentStep.set(hint.step)` ; if `hint.entityId` provided, set highlightedSlotId signal (read by step components).
    - `onPublish()` : call `dataService.updateTemplate(id, { published: true })` + Winston-style audit happens server-side. Navigate to template list with success toast.

    7. Add to `remotion-templates-data.service.ts` :
    ```typescript
    getValidation(id: string): Observable<{results: ValidationResult[]}> {
      return this.http.get<{results: ValidationResult[]}>(`${API}/api/remotion-templates/${id}/validation`);
    }
    createTestRender(id: string): Observable<{jobId: string; status: string}> {
      return this.http.post<{jobId: string; status: string}>(`${API}/api/remotion-templates/${id}/test-render`, {});
    }
    getRenderJob(jobId: string): Observable<{status: string; video_url?: string; progress: number}> {
      return this.http.get<{status: string; video_url?: string; progress: number}>(`${API}/api/remotion-render-jobs/${jobId}`);
    }
    ```
    (Vérifier route GET render job existante côté backend ; sinon faire un GET simple — endpoint existe via ADR-054 `getRenderJob`. Si absent du dashboard service, l'ajouter, mais l'endpoint serveur existe déjà.)

    8. Extend `remotion-preview.service.ts` :
    ```typescript
    private mode = signal<'live'|'test-render'>('live');
    private testRenderUrl = signal<string|null>(null);
    setMode(m: 'live'|'test-render'): void { this.mode.set(m); }
    loadTestRenderUrl(url: string): void { this.testRenderUrl.set(url); this.mode.set('test-render'); }
    // L'état Player reste monté ; la source switche selon mode().
    ```

    9. Mount toggle in `wizard-preview-panel.component.html` :
    ```html
    <div class="wpp__toggle" *ngIf="currentStep() === 5">
      <button [class.wpp__toggle--active]="previewMode() === 'live'"
              (click)="onModeChange('live')">Aperçu live</button>
      <button [class.wpp__toggle--active]="previewMode() === 'test-render'"
              (click)="onModeChange('test-render')">Rendu de test</button>
    </div>
    ```

    10. Run smokes :
    - `cd central-server && npx jest --testPathPattern='smoke-template-studio-v3-vocabulary' --no-coverage --forceExit` → 8/8 GREEN.
    - `cd central-dashboard && npx ng build --configuration=production` → clean.
    - `cd central-server && npx jest --testPathPattern='smoke-template-studio-v3-' --no-coverage --forceExit` → no regression.
    11. Commit : `feat(03-04): wizard step 5 publish gate + Player test-render toggle`.

  </action>
  <verify>
    <automated>cd central-server && npx jest --testPathPattern='smoke-template-studio-v3-vocabulary' --no-coverage --forceExit && cd ../central-dashboard && npx ng build --configuration=production 2>&1 | tail -5</automated>
  </verify>
  <acceptance_criteria>
    - `grep "VALIDATION_RULE_LABELS" central-dashboard/src/app/features/content/remotion-templates/studio-v3/vocabulary.constants.ts` returns ≥ 1 match
    - `grep -c "_24h:\|_layer:\|_known:\|_safe_zone:\|_keys_exist:\|_options_match:\|_target_published:\|_http_200:" central-dashboard/.../vocabulary.constants.ts` returns ≥ 8
    - `grep "test_render_failed" central-dashboard/.../vocabulary.constants.ts` returns ≥ 1
    - `grep "wizard-step-publish" central-dashboard/.../studio-v3-wizard.component.html` returns ≥ 1
    - `grep "\\[hidden\\]=\"currentStep() !== 5\"" central-dashboard/.../studio-v3-wizard.component.html` returns 1
    - `grep "\\*ngIf=\"currentStep() === 5\"" central-dashboard/.../studio-v3-wizard.component.html` returns 0 OR is only on the toggle (not on the step container)
    - `grep "Publier ce template" central-dashboard/.../wizard-step-publish.component.html` returns ≥ 1
    - `grep "getValidation\\|createTestRender\\|getRenderJob" central-dashboard/.../remotion-templates-data.service.ts` returns ≥ 3 matches
    - `grep "setMode\\|loadTestRenderUrl" central-dashboard/.../remotion-preview.service.ts` returns ≥ 2
    - jest smoke-template-studio-v3-vocabulary exits 0 with 8 tests passing
    - `ng build` exits 0
  </acceptance_criteria>
  <done>RED → GREEN ; step 5 mounted via [hidden] ; toggle Player ; vocabulaire FR figé ; ng build clean.</done>
</task>

</tasks>

<verification>
- `cd central-server && npx jest --testPathPattern='smoke-template-studio-v3-' --no-coverage --forceExit` → all v3 suites GREEN
- `cd central-dashboard && npx ng build --configuration=production` → clean
- `npm run test:smoke:smart` → no regression
- Manuel UAT pour Daisy : ouvrir `/content/templates-remotion/new/:id`, naviguer step 5, cliquer "Lancer un rendu de test", vérifier toggle Player, cliquer "Corriger →" sur une règle rouge, vérifier deep-link.
</verification>

<success_criteria>

- Step 5 monté via [hidden] (Pitfall P3 respecté — 0 \*ngIf="currentStep() === 5" sur le container step)
- Bouton "Publier ce template" disabled tant qu'≥1 erreur, tooltip FR avec `{N}`
- Toggle "Aperçu live / Rendu de test" — Player reste monté (Pitfall P2 respecté)
- Test render : POST + polling + load URL ; échec → toast FR figé `test_render_failed`
- Smoke vocabulary 8/8 GREEN (5 baseline Phase 1+2 + 3 Phase 3)
- PUB-01 + PUB-02 frontend complets
  </success_criteria>

<output>
After completion, create `.planning/phases/03-gate-publication/03-gate-publication-04-SUMMARY.md`
</output>
