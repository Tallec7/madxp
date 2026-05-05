---
phase: 03-gate-publication
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - central-server/src/services/template-validation/index.ts
  - central-server/src/services/template-validation/types.ts
  - central-server/src/services/template-validation/rules/at-least-one-layer.ts
  - central-server/src/services/template-validation/rules/assets-resolve-http-200.ts
  - central-server/src/services/template-validation/rules/fonts-known.ts
  - central-server/src/services/template-validation/rules/zones-in-safe-zone.ts
  - central-server/src/services/template-validation/rules/visible-if-keys-exist.ts
  - central-server/src/services/template-validation/rules/packshot-refs-options-match.ts
  - central-server/src/services/template-validation/rules/packshot-refs-target-published.ts
  - central-server/src/services/template-validation/rules/recent-test-render-24h.ts
  - central-server/src/controllers/template-studio.controller.ts
  - central-server/src/routes/template-studio.routes.ts
  - central-server/src/__tests__/smoke/smoke-template-studio-v3-validation.test.ts
autonomous: true
requirements: [PUB-01, TEST-03]
must_haves:
  truths:
    - 'GET /api/remotion-templates/:id/validation retourne array de 8 ValidationResult'
    - 'Registre rules/index.ts exporte un array itérable de 8 entrées'
    - 'Chaque règle implémente { id, severity, check(template, context) → {ok, message, fixHint?} }'
    - 'Smoke itère sur le registre et vérifie un cas RED par règle'
  artifacts:
    - path: central-server/src/services/template-validation/index.ts
      provides: 'VALIDATION_RULES array + runValidation(templateId) orchestrator'
    - path: central-server/src/services/template-validation/types.ts
      provides: 'ValidationRule, ValidationResult, ValidationContext interfaces'
    - path: central-server/src/__tests__/smoke/smoke-template-studio-v3-validation.test.ts
      provides: 'Itération registre + 8 cas RED + assertion exhaustive sur les 8 IDs'
  key_links:
    - from: GET /api/remotion-templates/:id/validation
      to: runValidation(templateId)
      via: 'controller getValidation → service orchestrator → rules.map(check)'
      pattern: "router\\.get\\(['\"]\\/:id\\/validation['\"]"
    - from: rules/index.ts
      to: 8 rule files
      via: 'import + named exports + VALIDATION_RULES array'
      pattern: "VALIDATION_RULES.*length.*8|VALIDATION_RULES\\s*=\\s*\\["
---

<objective>
Backend validation registry server-side : 8 règles extensibles + endpoint GET /:id/validation + smoke TEST-03 RED→GREEN itérant sur le registre.

Purpose: Source de vérité PUB-01 + TEST-03. Plan 04 (UI step 5) consomme cet endpoint sans réimplémenter la logique. Phase 3 success criteria #1 + #3.
Output: 1 service registry, 8 règles, 1 endpoint, 1 smoke ≥9 tests (1 par règle + 1 array length + 1 endpoint contract).
</objective>

<execution_context>
@/Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/.claude/get-shit-done/workflows/execute-plan.md
@/Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/phases/03-gate-publication/03-CONTEXT.md
@docs/specs/features/template-studio-v3.spec.md
@CLAUDE.md
@.claude/rules/templates.md
@.claude/rules/code-patterns.md
@.claude/rules/testing.md

<interfaces>
Contract figé par CONTEXT.md Decisions :

```typescript
// central-server/src/services/template-validation/types.ts
export type Severity = 'error' | 'warning';
export type RuleId =
  | 'at_least_one_layer'
  | 'assets_resolve_http_200'
  | 'fonts_known'
  | 'zones_in_safe_zone'
  | 'visible_if_keys_exist'
  | 'packshot_refs_options_match'
  | 'packshot_refs_target_published'
  | 'recent_test_render_24h';

export interface ValidationContext {
  template: {
    id: string;
    layers: Array<{ id: string; video_url: string; ... }>;
    textFields: Array<{ font_family: string; visible_if: string | null; layer_id: string; ... }>;
    imageSlots: Array<{ visible_if: string | null; anchor: string; fit_mode: string; ... }>;
    options: Array<{ key: string; values: string[]; ... }>;
    packshotRefs: Array<{ option_key: string; option_value: string; packshot_template_id: string; ... }>;
    test_render_at: Date | null;
    test_render_status: string | null;
  };
}
export interface ValidationResult {
  rule_id: RuleId;
  severity: Severity;
  ok: boolean;
  message: string;       // FR via VALIDATION_RULE_LABELS
  fixHint?: { step: number; entityId?: string };
}
export interface ValidationRule {
  id: RuleId;
  severity: Severity;
  check(ctx: ValidationContext): Promise<Omit<ValidationResult, 'rule_id' | 'severity'>>;
}

// rules/index.ts
export const VALIDATION_RULES: ValidationRule[] = [
  atLeastOneLayer, assetsResolveHttp200, fontsKnown, zonesInSafeZone,
  visibleIfKeysExist, packshotRefsOptionsMatch, packshotRefsTargetPublished,
  recentTestRender24h,
];
export async function runValidation(templateId: string): Promise<ValidationResult[]>;
```

Severity assignment (CONTEXT.md L29-32) :

- error: at_least_one_layer, assets_resolve_http_200, fonts_known, zones_in_safe_zone, visible_if_keys_exist, packshot_refs_options_match, packshot_refs_target_published
- warning: recent_test_render_24h

FR messages (sample, CONTEXT.md L147) :

- at_least_one_layer → "Au moins un fond animé empilé"
- assets_resolve_http_200 → "Tous les fonds résolvent (accessibles en ligne)"
- recent_test_render_24h → "Test de rendu réussi récemment (24h)"

Existing :

- `templateStudioRepository.getStudioView(templateId)` returns hydrated template — REUSE.
- Route mounting : `router.get('/:id/validation', requireSuperAdmin, controller.getValidation)` in `template-studio.routes.ts`.
- Joi : pas de body (GET), juste `params: { id: Joi.string().uuid().required() }`.
- FONT_FAMILIES : hardcoded in `central-dashboard/.../admin-field-editor.component.ts` — pour l'instant, dupliquer la liste côté serveur dans `rules/fonts-known.ts` (ou exposer via a shared json file). Note : `template_fonts` n'existe pas (Memory).
  </interfaces>
  </context>

<tasks>

<task type="auto">
  <name>Task 1: RED smoke — registry shape + 8 RED cases + endpoint contract</name>
  <files>central-server/src/__tests__/smoke/smoke-template-studio-v3-validation.test.ts</files>
  <read_first>
    - central-server/src/__tests__/smoke/smoke-template-studio-v3-options.test.ts (file-based smoke pattern)
    - central-server/src/__tests__/smoke/smoke-template-studio-v3-duplicate.test.ts (DB-isolated smoke pattern)
    - central-server/src/repositories/template-studio.repository.ts (getStudioView signature for fixture creation)
  </read_first>
  <action>
    Créer un smoke RED qui itère sur le registre. Structure :

    Test 1 — Registry shape :
    ```typescript
    import { VALIDATION_RULES } from '../../services/template-validation';
    expect(VALIDATION_RULES).toHaveLength(8);
    const ids = VALIDATION_RULES.map(r => r.id).sort();
    expect(ids).toEqual([
      'assets_resolve_http_200', 'at_least_one_layer', 'fonts_known',
      'packshot_refs_options_match', 'packshot_refs_target_published',
      'recent_test_render_24h', 'visible_if_keys_exist', 'zones_in_safe_zone',
    ]);
    const errors = VALIDATION_RULES.filter(r => r.severity === 'error').map(r => r.id);
    expect(errors).toHaveLength(7);
    expect(VALIDATION_RULES.find(r => r.id === 'recent_test_render_24h')?.severity).toBe('warning');
    ```

    Test 2 — Each rule has check function :
    ```typescript
    for (const rule of VALIDATION_RULES) {
      expect(typeof rule.check).toBe('function');
    }
    ```

    Test 3 — Each rule has a RED case (parametrized) :
    Boucler sur 8 fixtures factices (un par rule_id) construits inline qui doivent provoquer `ok: false` pour la règle ciblée :
    ```typescript
    const RED_FIXTURES: Record<RuleId, ValidationContext> = {
      at_least_one_layer: { template: { ...base, layers: [] } },
      fonts_known: { template: { ...base, textFields: [{...tf, font_family: 'NonExistentFont'}] } },
      visible_if_keys_exist: { template: { ...base, options: [], textFields: [{...tf, visible_if: 'ghost == "x"'}] } },
      packshot_refs_options_match: { template: { ...base, options: [{key:'mode', values:['a']}], packshotRefs: [{option_key:'unknown', option_value:'a', packshot_template_id:'...'}] } },
      packshot_refs_target_published: { template: { ...base, packshotRefs: [{...pr, packshot_template_id: UNPUBLISHED_ID}] } },
      zones_in_safe_zone: { template: { ...base, imageSlots: [{...is, position_x: 1.5}] } },
      assets_resolve_http_200: { template: { ...base, layers: [{...l, video_url: 'http://localhost:9/dead'}] } },
      recent_test_render_24h: { template: { ...base, test_render_at: null, test_render_status: null } },
    };
    for (const [ruleId, ctx] of Object.entries(RED_FIXTURES)) {
      const rule = VALIDATION_RULES.find(r => r.id === ruleId)!;
      const result = await rule.check(ctx);
      expect(result.ok).toBe(false);
      expect(typeof result.message).toBe('string');
      expect(result.message.length).toBeGreaterThan(5);
    }
    ```

    Test 4 — Endpoint contract :
    File-based check on `central-server/src/routes/template-studio.routes.ts` :
    ```typescript
    expect(routes).toMatch(/router\.get\(['"]\/:id\/validation['"]/);
    expect(routes).toMatch(/getValidation/);
    ```
    File-based check on `central-server/src/controllers/template-studio.controller.ts` :
    ```typescript
    expect(ctrl).toMatch(/export const getValidation/);
    expect(ctrl).toMatch(/runValidation/);
    ```

    Lancer : `cd central-server && npx jest --testPathPattern='smoke-template-studio-v3-validation' --no-coverage --forceExit` → DOIT être RED.
    Commit : `test(03-02): add RED smoke for validation registry + endpoint`.

  </action>
  <verify>
    <automated>cd central-server && npx jest --testPathPattern='smoke-template-studio-v3-validation' --no-coverage --forceExit 2>&1 | grep -E 'failed|FAIL'</automated>
  </verify>
  <acceptance_criteria>
    - File `central-server/src/__tests__/smoke/smoke-template-studio-v3-validation.test.ts` exists
    - File contains exactly 8 entries in `RED_FIXTURES` Record (`grep -c '_24h:\|_layer:\|_known:\|_safe_zone:\|_keys_exist:\|_options_match:\|_target_published:\|_http_200:'` ≥ 8)
    - File asserts `VALIDATION_RULES).toHaveLength(8)`
    - File asserts severity split 7 errors + 1 warning
    - jest exits non-zero (RED)
    - Commit message starts with `test(03-02):`
  </acceptance_criteria>
  <done>RED smoke committed with 8 parametrized cases + endpoint file-based contract.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Implement 8 rules + registry + endpoint → GREEN</name>
  <files>central-server/src/services/template-validation/types.ts, central-server/src/services/template-validation/index.ts, central-server/src/services/template-validation/rules/at-least-one-layer.ts, central-server/src/services/template-validation/rules/assets-resolve-http-200.ts, central-server/src/services/template-validation/rules/fonts-known.ts, central-server/src/services/template-validation/rules/zones-in-safe-zone.ts, central-server/src/services/template-validation/rules/visible-if-keys-exist.ts, central-server/src/services/template-validation/rules/packshot-refs-options-match.ts, central-server/src/services/template-validation/rules/packshot-refs-target-published.ts, central-server/src/services/template-validation/rules/recent-test-render-24h.ts, central-server/src/controllers/template-studio.controller.ts, central-server/src/routes/template-studio.routes.ts</files>
  <read_first>
    - central-server/src/repositories/template-studio.repository.ts (getStudioView return shape — copy field names verbatim)
    - central-server/src/routes/template-studio.routes.ts (router structure, requireSuperAdmin middleware import, validate() helper usage)
    - central-server/src/controllers/template-studio.controller.ts (existing AuthRequest pattern, error handler shape)
    - central-dashboard/src/app/features/content/remotion-templates/studio-v2/admin/admin-field-editor.component.ts (FONT_FAMILIES list to mirror server-side)
    - docs/specs/features/template-studio-v3.spec.md (L121-132 — checklist 8 critères)
    - .claude/rules/code-patterns.md (controller pattern to follow)
  </read_first>
  <behavior>
    - `runValidation(templateId)` calls `templateStudioRepository.getStudioView` once and runs all rules in parallel via `Promise.all` ; returns array `ValidationResult[]` ordered by severity (errors first).
    - HTTP probe rule `assets_resolve_http_200` uses `fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(3000) })`, treats network error as `ok: false`.
    - `fonts_known` reads a hardcoded `KNOWN_FONTS` array (Inter, Bebas Neue, Roboto, Montserrat, Oswald, Anton, Raleway, Poppins) — matching dashboard FONT_FAMILIES verbatim.
    - `zones_in_safe_zone` checks `position_x ∈ [0,1]` and `position_y ∈ [0,1]` for both text fields and image slots.
    - `visible_if_keys_exist` parses `visible_if` strings of form `<key> == "<value>"` and asserts the key exists in `template_options.key` AND the value is in `template_options.values`.
    - `packshot_refs_options_match` : every `packshotRefs.option_key` must equal an existing `template_options.key` AND `option_value` must be in that option's `values`.
    - `packshot_refs_target_published` : every `packshot_template_id` resolves to `templates.published = true` (1 SQL roundtrip).
    - `recent_test_render_24h` : `test_render_status === 'success'` AND `test_render_at` not older than 24h ; severity warning (does NOT block publish).
    - `at_least_one_layer` : `template.layers.length >= 1`.
    - All `message` strings are FR (locked) — they will be re-mapped to `VALIDATION_RULE_LABELS` on the dashboard side in plan 04, but server returns the FR string by default.
  </behavior>
  <action>
    1. Create `central-server/src/services/template-validation/types.ts` with exact `Severity`, `RuleId`, `ValidationContext`, `ValidationResult`, `ValidationRule` interfaces (see <interfaces>).

    2. Create 8 rule files in `central-server/src/services/template-validation/rules/`. Sample :
    ```typescript
    // at-least-one-layer.ts
    import { ValidationRule } from '../types';
    export const atLeastOneLayer: ValidationRule = {
      id: 'at_least_one_layer',
      severity: 'error',
      async check(ctx) {
        const ok = ctx.template.layers.length >= 1;
        return {
          ok,
          message: ok ? 'Au moins un fond animé empilé' : 'Aucun fond animé empilé — ajoutez au moins un fond à l\'étape 2.',
          fixHint: ok ? undefined : { step: 2 },
        };
      },
    };
    ```
    Implement the 7 others mirroring the same shape. For `assets_resolve_http_200`, run HEAD requests in parallel (Promise.all) with 3s timeout each.

    3. Create `central-server/src/services/template-validation/index.ts` :
    ```typescript
    import { templateStudioRepository } from '../../repositories';
    import { atLeastOneLayer } from './rules/at-least-one-layer';
    // ... 7 other imports
    import { ValidationRule, ValidationResult } from './types';

    export const VALIDATION_RULES: ValidationRule[] = [
      atLeastOneLayer, assetsResolveHttp200, fontsKnown, zonesInSafeZone,
      visibleIfKeysExist, packshotRefsOptionsMatch, packshotRefsTargetPublished,
      recentTestRender24h,
    ];

    export async function runValidation(templateId: string): Promise<ValidationResult[]> {
      const view = await templateStudioRepository.getStudioView(templateId);
      if (!view) throw new Error('template_not_found');
      const ctx = { template: view };
      const raw = await Promise.all(
        VALIDATION_RULES.map(async (rule) => {
          const result = await rule.check(ctx);
          return { rule_id: rule.id, severity: rule.severity, ...result };
        })
      );
      return raw.sort((a, b) => (a.severity === 'error' ? -1 : 1));
    }

    export * from './types';
    ```

    4. Add controller `getValidation` in `central-server/src/controllers/template-studio.controller.ts` :
    ```typescript
    export const getValidation = async (req: AuthRequest, res: Response) => {
      try {
        const { id } = req.params;
        const results = await runValidation(id);
        res.json({ results });
      } catch (error) {
        if (error instanceof Error && error.message === 'template_not_found') {
          return res.status(404).json({ error: 'template_not_found' });
        }
        logger.error('Get validation error', { error, templateId: req.params.id });
        res.status(500).json({ error: 'internal_error' });
      }
    };
    ```

    5. Wire route in `central-server/src/routes/template-studio.routes.ts` :
    ```typescript
    router.get('/:id/validation', requireSuperAdmin, validate(querySchemas.uuidParam, 'params'), templateStudioController.getValidation);
    ```
    (Si `querySchemas.uuidParam` n'existe pas, ajouter `Joi.object({ id: Joi.string().uuid().required() })` inline ou réutiliser pattern existant des autres routes du fichier.)

    6. Run `cd central-server && npx jest --testPathPattern='smoke-template-studio-v3-validation' --no-coverage --forceExit` → DOIT être GREEN (≥10 assertions).
    7. `cd central-server && npx tsc --noEmit` → clean.
    8. Run all v3 smokes : `cd central-server && npx jest --testPathPattern='smoke-template-studio-v3-' --no-coverage --forceExit` → no regression.
    9. Commit : `feat(03-02): template validation registry + GET /:id/validation`.

  </action>
  <verify>
    <automated>cd central-server && npx jest --testPathPattern='smoke-template-studio-v3-validation' --no-coverage --forceExit && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `ls central-server/src/services/template-validation/rules/ | wc -l` returns ≥ 8
    - `grep -c "ValidationRule = {" central-server/src/services/template-validation/rules/*.ts` returns 8
    - `grep "VALIDATION_RULES" central-server/src/services/template-validation/index.ts` returns ≥ 1 match
    - `grep "router.get('/:id/validation'" central-server/src/routes/template-studio.routes.ts` returns match
    - `grep "export const getValidation" central-server/src/controllers/template-studio.controller.ts` returns match
    - `grep "import.*../config/database" central-server/src/controllers/template-studio.controller.ts` returns 0 (repo pattern)
    - `grep "console.log" central-server/src/services/template-validation/` returns 0 (Winston only)
    - jest smoke-template-studio-v3-validation exits 0 with all tests passing
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>RED → GREEN ; 8 rules implemented ; endpoint wired ; tsc clean ; no v3 regression.</done>
</task>

</tasks>

<verification>
- `cd central-server && npx jest --testPathPattern='smoke-template-studio-v3-' --no-coverage --forceExit` → all suites GREEN
- `npm run test:smoke:smart` → no regression
- `cd central-server && npx tsc --noEmit` → clean
</verification>

<success_criteria>

- 8 fichiers de règles dans `rules/` (registre extensible — ajout d'une 9e règle = 1 fichier + 1 entrée array, pas de if/else hardcodé)
- Endpoint `GET /api/remotion-templates/:id/validation` (mounted sur `/api/remotion-templates` prefix per Plan 04 deviation Phase 1) renvoie 200 + `{results: ValidationResult[]}`
- Smoke `smoke-template-studio-v3-validation` GREEN avec 1 cas RED par règle
- 0 `query()` direct dans controller (repository pattern), 0 `console.log` (Winston)
- TEST-03 satisfait, PUB-01 backend prêt pour Plan 04
  </success_criteria>

<output>
After completion, create `.planning/phases/03-gate-publication/03-gate-publication-02-SUMMARY.md`
</output>
