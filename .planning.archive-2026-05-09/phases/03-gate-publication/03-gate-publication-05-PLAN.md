---
phase: 03-gate-publication
plan: 05
type: execute
wave: 3
depends_on: ['03-gate-publication-04']
files_modified:
  - central-server/src/controllers/remotion-templates.controller.ts
  - central-server/src/routes/remotion-templates.routes.ts
  - central-server/src/validation/schemas.ts
  - central-dashboard/src/app/features/content/remotion-templates/template-card.component.ts
  - central-dashboard/src/app/features/content/remotion-templates/template-card.component.html
  - central-dashboard/src/app/features/content/remotion-templates/remotion-templates-list.component.ts
  - central-dashboard/src/app/features/content/remotion-templates/remotion-templates-data.service.ts
  - central-dashboard/src/app/features/content/remotion-templates/studio-v3/vocabulary.constants.ts
  - central-server/src/__tests__/smoke/smoke-template-studio-v3-publish-audit.test.ts
autonomous: false
requirements: [PUB-01]
must_haves:
  truths:
    - 'POST /:id/publish + POST /:id/unpublish renvoient 200 + Winston structured log'
    - "Bouton 'Dépublier' visible super_admin sur card avec modale confirmation FR"
    - "Audit Winston log porte action='template.published'|'template.unpublished' + actor_id + template_id"
  artifacts:
    - path: central-server/src/controllers/remotion-templates.controller.ts
      provides: 'publishTemplate + unpublishTemplate controllers (vérifient validation server-side avant publish)'
    - path: central-dashboard/src/app/features/content/remotion-templates/template-card.component.ts
      provides: "Output unpublishRequested + bouton 'Dépublier' visible si published && super_admin"
  key_links:
    - from: 'POST /api/remotion-templates/:id/publish'
      to: 'templateValidation.runValidation + UPDATE templates SET published=true'
      via: 'controller refuses if any error severity result.ok=false'
      pattern: "result.severity === 'error'.*!result.ok"
    - from: "Card 'Dépublier' click"
      to: 'modal confirm → POST /:id/unpublish'
      via: 'dataService.unpublishTemplate'
      pattern: "unpublishTemplate\\("
---

<objective>
Publish/unpublish flow gated par validation serveur + audit Winston structured log + UX card unpublish avec modale confirmation FR.

Purpose: Boucler Phase 3 success criteria #1 — bouton "Publier" backend-gated (refus si validation porte ≥1 erreur), unpublish autorisé super_admin avec confirmation explicite, audit observable.
Output: 2 endpoints, 1 UX card unpublish, 1 smoke audit RED→GREEN. Plan checkpoint humain pour valider l'UX modale.
</objective>

<execution_context>
@/Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/.claude/get-shit-done/workflows/execute-plan.md
@/Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/phases/03-gate-publication/03-CONTEXT.md
@CLAUDE.md
@.claude/rules/templates.md
@.claude/rules/code-patterns.md

<interfaces>
Existing :
- `central-server/src/services/template-validation/index.ts` — `runValidation(id)` (created Plan 02)
- `templateStudioRepository` — has methods to UPDATE templates ; here we need a thin `updatePublishedFlag(id, published: boolean)` method (or reuse existing PATCH endpoint).
- `template-card.component.ts` — exists with `duplicateRequested` Output (Phase 1 Plan 05). Add `unpublishRequested` Output.

Audit log shape (CONTEXT.md L57) :

```typescript
logger.info('template.published', {
  action: 'template.published',
  actor_id: req.user?.id,
  template_id: id,
  timestamp: new Date().toISOString(),
});
logger.info('template.unpublished', {
  action: 'template.unpublished',
  actor_id: req.user?.id,
  template_id: id,
  timestamp: new Date().toISOString(),
});
```

Error contract for publish refused :

```typescript
// Controller
const results = await runValidation(id);
const errors = results.filter((r) => r.severity === 'error' && !r.ok);
if (errors.length > 0) {
  return res
    .status(409)
    .json({ error: 'validation_failed', failed_rules: errors.map((e) => e.rule_id) });
}
```

i18n FR figés (CONTEXT.md L145) :

- Modale unpublish : "Dépublier ce template ? Il ne sera plus disponible pour les nouveaux clubs."
- Boutons modale : "Confirmer" / "Abandonner" (Annuler banlisté).
- Toast publish OK : "Template publié."
- Toast unpublish OK : "Template dépublié."
  </interfaces>
  </context>

<tasks>

<task type="auto">
  <name>Task 1: RED smoke — publish gate + audit log + unpublish</name>
  <files>central-server/src/__tests__/smoke/smoke-template-studio-v3-publish-audit.test.ts</files>
  <read_first>
    - central-server/src/__tests__/smoke/smoke-template-studio-v3-options.test.ts (file-based pattern)
    - central-server/src/services/template-validation/index.ts (runValidation signature)
  </read_first>
  <action>
    Create 4 tests file-based :

    Test A — Routes registered :
    ```typescript
    const routes = readFileSync('src/routes/remotion-templates.routes.ts', 'utf8');
    expect(routes).toMatch(/router\.post\(['"]\/:id\/publish['"]/);
    expect(routes).toMatch(/router\.post\(['"]\/:id\/unpublish['"]/);
    expect(routes).toMatch(/requireSuperAdmin/);
    ```

    Test B — Publish controller calls runValidation + refuses if errors :
    ```typescript
    const ctrl = readFileSync('src/controllers/remotion-templates.controller.ts', 'utf8');
    expect(ctrl).toMatch(/export const publishTemplate/);
    expect(ctrl).toMatch(/runValidation/);
    expect(ctrl).toMatch(/severity === 'error'/);
    expect(ctrl).toMatch(/validation_failed/);
    expect(ctrl).toMatch(/status\(409\)/);
    ```

    Test C — Audit Winston structured log :
    ```typescript
    expect(ctrl).toMatch(/logger\.info\([^)]*'template\.published'[^)]*actor_id/);
    expect(ctrl).toMatch(/logger\.info\([^)]*'template\.unpublished'[^)]*actor_id/);
    ```

    Test D — Unpublish controller :
    ```typescript
    expect(ctrl).toMatch(/export const unpublishTemplate/);
    expect(ctrl).toMatch(/published.*=.*false|published\s*:\s*false/);
    ```

    Lancer : `cd central-server && npx jest --testPathPattern='smoke-template-studio-v3-publish-audit' --no-coverage --forceExit` → DOIT être RED.
    Commit : `test(03-05): add RED smoke for publish gate + audit + unpublish`.

  </action>
  <verify>
    <automated>cd central-server && npx jest --testPathPattern='smoke-template-studio-v3-publish-audit' --no-coverage --forceExit 2>&1 | grep -E 'failed|FAIL'</automated>
  </verify>
  <acceptance_criteria>
    - File `central-server/src/__tests__/smoke/smoke-template-studio-v3-publish-audit.test.ts` exists
    - 4 distinct test blocks
    - At least 10 `expect(...).toMatch(...)` assertions
    - `grep "template.published\|template.unpublished" smoke-template-studio-v3-publish-audit.test.ts` returns ≥ 2
    - jest exits non-zero
    - Commit message starts with `test(03-05):`
  </acceptance_criteria>
  <done>4 RED tests committed.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Implement publish/unpublish endpoints + dataservice + UX card unpublish</name>
  <files>central-server/src/controllers/remotion-templates.controller.ts, central-server/src/routes/remotion-templates.routes.ts, central-server/src/validation/schemas.ts, central-dashboard/src/app/features/content/remotion-templates/remotion-templates-data.service.ts, central-dashboard/src/app/features/content/remotion-templates/template-card.component.ts, central-dashboard/src/app/features/content/remotion-templates/template-card.component.html, central-dashboard/src/app/features/content/remotion-templates/remotion-templates-list.component.ts, central-dashboard/src/app/features/content/remotion-templates/studio-v3/vocabulary.constants.ts</files>
  <read_first>
    - central-server/src/controllers/remotion-templates.controller.ts (existing publish-related logic if any + alpha-gate pattern for AuthRequest + Winston pattern)
    - central-server/src/routes/remotion-templates.routes.ts (route ordering — library before /:id, add new routes BEFORE /:id catch-all)
    - central-server/src/services/template-validation/index.ts (runValidation signature confirmed)
    - central-dashboard/src/app/features/content/remotion-templates/template-card.component.ts (existing duplicateRequested Output as model — mirror shape for unpublishRequested)
    - central-dashboard/src/app/features/content/remotion-templates/remotion-templates-list.component.ts (modal pattern if any exists, or use existing confirm dialog component)
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/vocabulary.constants.ts (extend ERROR_MESSAGES with publish/unpublish toasts + modale)
  </read_first>
  <behavior>
    - POST /:id/publish : super_admin only, runs `runValidation(id)`. If any error rule has `ok=false`, returns 409 `{ error: 'validation_failed', failed_rules: [...] }`. Else UPDATE templates SET published=true WHERE id=$1, returns 200 `{ id, published: true }`. Logs `logger.info('template.published', { action, actor_id, template_id, timestamp })`.
    - POST /:id/unpublish : super_admin only, no validation gate. UPDATE templates SET published=false. Returns 200. Logs `logger.info('template.unpublished', ...)`.
    - Card UI : when `template.published === true && currentUser.role === 'super_admin'`, show "Dépublier" link. Click → modal "Dépublier ce template ? Il ne sera plus disponible pour les nouveaux clubs." with "Confirmer" / "Abandonner". Confirm → emit `(unpublishRequested)`. Parent list calls dataservice + reloads.
    - DataService : add `publishTemplate(id)` and `unpublishTemplate(id)` Observable methods.
    - Vocabulary : add `ERROR_MESSAGES.template_published`, `template_unpublished`, `validation_failed`, `unpublish_confirm_title`, `unpublish_confirm_body`, `unpublish_confirm_cta`, `unpublish_cancel_cta`. All FR strings figés.
  </behavior>
  <action>
    1. Joi schema (`schemas.ts`) :
    ```typescript
    export const publishSchemas = {
      params: Joi.object({ id: Joi.string().uuid().required() }),
    };
    ```

    2. Controllers (`remotion-templates.controller.ts`) :
    ```typescript
    import { runValidation } from '../services/template-validation';

    export const publishTemplate = async (req: AuthRequest, res: Response) => {
      try {
        const { id } = req.params;
        const results = await runValidation(id);
        const errors = results.filter(r => r.severity === 'error' && !r.ok);
        if (errors.length > 0) {
          logger.info('Template publish refused', { templateId: id, failed: errors.map(e => e.rule_id) });
          return res.status(409).json({ error: 'validation_failed', failed_rules: errors.map(e => e.rule_id) });
        }
        await query('UPDATE templates SET published = true WHERE id = $1', [id]);
        logger.info('template.published', {
          action: 'template.published',
          actor_id: req.user?.id ?? null,
          template_id: id,
          timestamp: new Date().toISOString(),
        });
        res.status(200).json({ id, published: true });
      } catch (error) {
        logger.error('Publish template error', { error, templateId: req.params.id });
        res.status(500).json({ error: 'internal_error' });
      }
    };

    export const unpublishTemplate = async (req: AuthRequest, res: Response) => {
      try {
        const { id } = req.params;
        await query('UPDATE templates SET published = false WHERE id = $1', [id]);
        logger.info('template.unpublished', {
          action: 'template.unpublished',
          actor_id: req.user?.id ?? null,
          template_id: id,
          timestamp: new Date().toISOString(),
        });
        res.status(200).json({ id, published: false });
      } catch (error) {
        logger.error('Unpublish template error', { error, templateId: req.params.id });
        res.status(500).json({ error: 'internal_error' });
      }
    };
    ```
    NOTE: the bare `query()` here is OK because this controller already imports it for other endpoints (Phase 1 baseline) ; if ESLint rule has been tightened, route through `templateStudioRepository.updatePublishedFlag` instead — verify by grepping the controller for existing `query(` calls. If the controller currently has zero direct `query`, MUST add the method to the repository instead.

    3. Routes (`remotion-templates.routes.ts`) — add BEFORE the `/:id` catch-all GET :
    ```typescript
    router.post('/:id/publish', requireSuperAdmin, validate(publishSchemas.params, 'params'), remotionTemplatesController.publishTemplate);
    router.post('/:id/unpublish', requireSuperAdmin, validate(publishSchemas.params, 'params'), remotionTemplatesController.unpublishTemplate);
    ```

    4. DataService (`remotion-templates-data.service.ts`) :
    ```typescript
    publishTemplate(id: string): Observable<{id: string; published: true}> {
      return this.http.post<{id: string; published: true}>(`${API}/api/remotion-templates/${id}/publish`, {});
    }
    unpublishTemplate(id: string): Observable<{id: string; published: false}> {
      return this.http.post<{id: string; published: false}>(`${API}/api/remotion-templates/${id}/unpublish`, {});
    }
    ```

    5. Vocabulary extension (`vocabulary.constants.ts`) — add to `ERROR_MESSAGES` :
    ```typescript
    template_published: 'Template publié.',
    template_unpublished: 'Template dépublié.',
    validation_failed: 'Publication refusée — corrigez les critères en rouge.',
    unpublish_confirm_title: 'Dépublier ce template ?',
    unpublish_confirm_body: 'Il ne sera plus disponible pour les nouveaux clubs.',
    unpublish_confirm_cta: 'Confirmer',
    unpublish_cancel_cta: 'Abandonner',
    ```

    6. Card (`template-card.component.ts` + `.html`) :
    - Add `@Input() currentUserRole: string` and `@Output() unpublishRequested = new EventEmitter<string>()`.
    - In HTML, add :
    ```html
    <button *ngIf="template.published && currentUserRole === 'super_admin'"
            class="tc__unpublish"
            type="button"
            (click)="onUnpublishClick()">Dépublier</button>
    ```
    - Method `onUnpublishClick()` shows confirmation modal (use `window.confirm` minimal OR existing project ConfirmDialog if present). On confirm, emit `unpublishRequested.emit(template.id)`.

    7. List (`remotion-templates-list.component.ts`) :
    - Bind `(unpublishRequested)="onUnpublishRequested($event)"`.
    - Method `onUnpublishRequested(id: string)` : call `dataService.unpublishTemplate(id).subscribe()` → reload list + toast `ERROR_MESSAGES.template_unpublished`.

    8. Run smokes :
    - `cd central-server && npx jest --testPathPattern='smoke-template-studio-v3-publish-audit' --no-coverage --forceExit` → GREEN.
    - `cd central-server && npx jest --testPathPattern='smoke-template-studio-v3-' --no-coverage --forceExit` → no regression.
    - `cd central-server && npx tsc --noEmit` → clean.
    - `cd central-dashboard && npx ng build --configuration=production` → clean.
    9. Commit : `feat(03-05): publish gate + unpublish endpoint + audit + UX card unpublish`.

  </action>
  <verify>
    <automated>cd central-server && npx jest --testPathPattern='smoke-template-studio-v3-publish-audit' --no-coverage --forceExit && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `grep "router.post.*'/:id/publish'\|router.post.*'/:id/unpublish'" central-server/src/routes/remotion-templates.routes.ts` returns 2 matches
    - `grep "export const publishTemplate\|export const unpublishTemplate" central-server/src/controllers/remotion-templates.controller.ts` returns 2 matches
    - `grep "runValidation" central-server/src/controllers/remotion-templates.controller.ts` returns ≥ 1
    - `grep "template.published\|template.unpublished" central-server/src/controllers/remotion-templates.controller.ts` returns ≥ 2
    - `grep "validation_failed" central-server/src/controllers/remotion-templates.controller.ts` returns ≥ 1
    - `grep "console.log" central-server/src/controllers/remotion-templates.controller.ts` returns 0
    - `grep "publishTemplate\|unpublishTemplate" central-dashboard/.../remotion-templates-data.service.ts` returns ≥ 2
    - `grep "Dépublier" central-dashboard/.../template-card.component.html` returns ≥ 1
    - `grep "unpublish_confirm_body\|template_unpublished" central-dashboard/.../vocabulary.constants.ts` returns ≥ 2
    - jest smoke-template-studio-v3-publish-audit exits 0
    - `npx tsc --noEmit` exits 0
    - `ng build` exits 0
  </acceptance_criteria>
  <done>RED → GREEN ; publish gate avec runValidation ; unpublish ; audit Winston structured ; UX card.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Human UAT — Publish flow E2E</name>
  <what-built>
    Step 5 wizard (Plan 04) + Publish/Unpublish endpoints (Plan 05) + Card unpublish UX (Plan 05) + Validation registry (Plan 02) + Test render async (Plan 03).
    Daisy doit valider visuellement que le flow gate complet est exécutable et explicite côté UX.
  </what-built>
  <how-to-verify>
    1. Worktree super_admin local (URL `localhost:4300`) → ouvrir un template incomplet (ex: sans layer) → naviguer step 5.
    2. Vérifier checklist : règle `at_least_one_layer` apparaît avec ✗ rouge + label "Au moins un fond animé empilé" + bouton "Corriger →".
    3. Cliquer "Corriger →" → vérifier que le wizard saute step 2.
    4. Ajouter un layer + retour step 5 → vérifier que la règle passe ✓.
    5. Bouton "Publier ce template" doit rester DISABLED tant qu'au moins une autre règle est rouge ; passer le curseur dessus → tooltip FR avec compte exact.
    6. Cliquer "Lancer un rendu de test" → progress visible, à la fin Player switche sur "Rendu de test" automatiquement (ou via toggle manuel "Aperçu live / Rendu de test").
    7. Quand toutes les règles sont vertes, cliquer "Publier ce template" → toast "Template publié.", redirection liste.
    8. Sur la liste templates : carte du template publié → cliquer "Dépublier" → modale FR "Dépublier ce template ? Il ne sera plus disponible pour les nouveaux clubs." avec "Confirmer" / "Abandonner".
    9. Confirmer → toast "Template dépublié.", carte met à jour son état.
    10. Vérifier logs Winston (server-side) :
        ```bash
        # Local : grep dans logs courants
        grep -E 'template\.(published|unpublished)' central-server/logs/*.log | tail -5
        ```
        Doit voir 2 entrées avec `actor_id` + `template_id` + `timestamp`.
    11. **Tentative refus publish** : déconnecter une règle (ex: supprimer une option référencée par visible_if), retourner step 5, cliquer "Publier" via API directement (curl) → vérifier 409 `{ error: 'validation_failed', failed_rules: [...] }`.
  </how-to-verify>
  <resume-signal>Type "approved" si les 11 étapes sont OK, ou décrire les régressions/ajustements nécessaires (ex: "label règle X ambigu", "tooltip {N} non interpolé").</resume-signal>
</task>

</tasks>

<verification>
- `cd central-server && npx jest --testPathPattern='smoke-template-studio-v3-' --no-coverage --forceExit` → all v3 suites GREEN (incl. publish-audit)
- `cd central-server && npx tsc --noEmit` → clean
- `cd central-dashboard && npx ng build --configuration=production` → clean
- `npm run test:smoke:smart` → no regression
- Human UAT validé via checkpoint Task 3
</verification>

<success_criteria>

- POST /:id/publish refuse 409 + Winston warn si validation porte ≥1 erreur ; sinon UPDATE published=true + Winston info structured
- POST /:id/unpublish UPDATE published=false + Winston info structured
- Card "Dépublier" visible super_admin only, modale FR, 2 boutons FR (Confirmer/Abandonner — Annuler banlisté)
- Audit observable via grep `template\.(published|unpublished)` dans logs Winston
- 0 `console.log`, Joi validation présente, 0 import direct `config/database` dans nouveaux exports
- PUB-01 frontend+backend complets ; Phase 3 ROADMAP success criteria #1 + #2 + #3 verifiables
  </success_criteria>

<output>
After completion, create `.planning/phases/03-gate-publication/03-gate-publication-05-SUMMARY.md`
</output>
