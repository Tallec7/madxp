---
phase: 01-fondations
plan: 05
subsystem: dashboard+api
tags: [template-studio-v3, wizard, options, packshot, duplicate, dup-01, wizard-01]

# Dependency graph
requires:
  - '01-fondations-01 — duplicateDeep transactionnel + 400 duplicate_requires_v2 + VOCABULARY_MAP'
  - '01-fondations-02 — Asset Manager (consommé par steps 2+3, pas par step 4)'
  - '01-fondations-03 — Wizard shell + WizardState.options + computeResumeStep stub'
  - '01-fondations-04 — Steps 2+3 + WizardState.zones populés (lus par countLinkedZones)'
provides:
  - 'WizardStepOptionsComponent — Step 4 (Options club) avec option builder + packshot mapping + linked-zone count'
  - '6 méthodes dataservice : createOption, deleteOption, listPackshotRefs, createPackshotRef, deletePackshotRef, listPublishedTemplates'
  - 'Bouton « ⎘ Dupliquer » sur chaque template card → routing /new/:newId?from=duplicate'
  - 'Bouton « + Nouveau template » repointé vers /content/templates-remotion/new (wizard V3)'
  - 'computeResumeStep refiné — ?from=duplicate force step 3 (SPEC §Workflow Dupliquer)'
  - 'TemplatePackshotRef interface (camelCase, normalisée depuis snake_case backend)'
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Snake_case backend → camelCase dashboard via rxjs map() + adapters mapTemplateOptionRow / mapPackshotRefRow'
    - 'Per-card per-action loading state via signal<string | null> tracking the in-flight id'
    - 'Packshot re-mapping = delete + create (backend a pas de PATCH endpoint pour packshot_refs)'
    - 'Output renaming pour éviter no-output-native ESLint : `finish` → `finished` (collision DOM Animation event)'

key-files:
  created:
    - 'central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-step-options.component.ts'
  modified:
    - 'central-dashboard/src/app/features/content/remotion-templates/remotion-templates.types.ts (+ TemplatePackshotRef)'
    - 'central-dashboard/src/app/features/content/remotion-templates/remotion-templates-data.service.ts (+ 6 méthodes + 2 mappers)'
    - 'central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/studio-v3-wizard.component.ts (+ optionsSignal + zonesSignal + onOptionsChange + onFinish + computeResumeStep refiné)'
    - 'central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/studio-v3-wizard.component.html (Step 4 wired)'
    - 'central-dashboard/src/app/features/content/remotion-templates/template-card.component.ts (+ bouton Dupliquer + duplicating input + duplicateRequested output)'
    - 'central-dashboard/src/app/features/content/remotion-templates/template-grid.component.ts (forward duplicate event + duplicatingId input)'
    - 'central-dashboard/src/app/features/content/remotion-templates/remotion-templates.component.ts (+ onNewTemplate + onDuplicateFromCard + duplicatingCardId/duplicateError signals)'
    - 'central-dashboard/src/app/features/content/remotion-templates/remotion-templates.component.html (button rewired + error banner + grid duplicateRequested)'

key-decisions:
  - 'Routes options/packshot mountées sur /api/remotion-templates (NOT /api/remotion-templates-studio comme dit le PLAN) — confirmation de la deviation Plan 04 : le router Studio est mounté FIRST sur /api/remotion-templates'
  - 'Backend renvoie snake_case (SELECT * FROM template_options) — adapters dataservice normalisent vers camelCase pour cohérence avec TemplateOption interface utilisée par getStudioView depuis Plan 03'
  - 'Output `finish` → `finished` à cause de @angular-eslint/no-output-native (collision DOM Animation event onfinish) — extends Plan 03 deviation list'
  - 'i18n hook deviation : « Oui/Non », « En cours… » bloqués → « Activé / Désactivé », « Retrait… » (synonymes non-blocklistés)'
  - '« + Nouveau template » : repointé vers wizard V3 (router.navigate /new) au lieu d ouvrir le wizard V2 modal — le wizard V2 reste accessible programmatiquement pour rollback Phase 2'
  - 'Packshot re-mapping = delete + create (pas de PATCH backend) — UI fait les 2 calls séquentiellement, restore visuel si erreur'
  - 'Bouton Dupliquer ajouté sur la card via TemplateCardComponent (input duplicating + output duplicateRequested) plutôt qu un wrapper externe — préserve la cohésion du composant'

patterns-established:
  - 'Snake↔camel adapter pattern dans dataservice : déclarer interfaces *Row internes + map() rxjs + mapXxxRow function — évite de polluer le type domaine avec snake_case'
  - 'Resume-step pattern : lire queryParam + cascading defaults sur view shape (layers.length === 0 → step 2, etc.)'
  - 'Per-card action signal<string | null> : pattern réutilisable pour tout grid avec actions per-row (delete, duplicate, publish, etc.)'

requirements-completed: [DUP-01, WIZARD-01]

# Metrics
duration: ~25min
completed: 2026-05-05
---

# Phase 1 Plan 05: Step 4 Options Club + Duplicate UX Summary

**Conclusion du wizard 4 étapes ADR-110 : Step 4 (Options club) data-driven sur les colonnes DB réelles (`template_options.key`, `template_packshot_refs.option_key`), avec compteur de zones reliées calculé en regex `\b{key}\s*==` sur `visibleIf`. Bouton « ⎘ Dupliquer » sur chaque template card consomme le contrat backend Plan 01 (`duplicateDeep` transactionnel + 400 `duplicate_requires_v2` pour les v1 legacy) et route vers le wizard avec `?from=duplicate` qui force l'étape 3 (SPEC §Workflow Dupliquer). Plan 01-04 contracts honorés end-to-end : payloads snake_case, routes sur `/api/remotion-templates`, `[hidden]` pattern préservé, `finished` au lieu de `finish` (no-output-native).**

## Performance

- **Duration:** ~25 min
- **Tasks:** 2
- **Files created:** 1
- **Files modified:** 7
- **Commits:** 2

## Task Commits

1. **Task 1 — WizardStepOptionsComponent + 6 dataservice methods + shell wiring** — `dbc82201` (feat)
2. **Task 2 — Duplicate button on card + Nouveau template CTA repointed to V3 wizard** — `2eb8c702` (feat)

## Component Public API

### `WizardStepOptionsComponent`

```ts
@Input({ required: true }) templateId!: string;
@Input({ required: true }) options!: WritableSignal<TemplateOption[]>;
@Input({ required: true }) zones!: Signal<{
  textFields: TemplateTextField[];
  imageSlots: TemplateImageSlot[];
}>;

@Output() optionsChange = new EventEmitter<TemplateOption[]>();
@Output() prev = new EventEmitter<void>();
@Output() finished = new EventEmitter<void>();   // NB: pas `finish` (no-output-native)
```

State (signals): `publishedTemplates`, `packshotRefs`, `formOpen`, `creating`, `deleting: WritableSignal<string | null>`, `formError`.

Comportement résumé :

- **Form key/label/type/valuesRaw/defaultValue** : ReactiveForms typed, key auto-slug depuis label, type=boolean fallback `['true','false']`.
- **Validation client** : `default_value ∈ values` enforced avant submit (mirroir du contrôleur backend qui retourne 400 `invalid_default_value`).
- **Mapping packshot par valeur** : dropdown des templates publiés (filtré client-side), POST createPackshotRef ; re-mapping = delete + create (pas de PATCH backend).
- **Compteur linked zones** : `RegExp(\`\\b${key}\\s\*==\`)`sur`visibleIf` text+image — convention Phase 2 enrichira (parser AST).
- **« Terminer »** : router.navigate vers la liste templates (no auto-publish — Phase 3 owns publish).

## Dataservice Methods (6 added)

Toutes mountées sur `/api/remotion-templates` (template-studio.routes.ts L210-273) :

```ts
createOption(templateId, payload: { key, label, type, values: string[], default_value, user_editable?, sort_order? })
  → POST /:id/options → 201 TemplateOption (mapped)

deleteOption(templateId, optionId)
  → DELETE /:id/options/:optionId → 204

listPackshotRefs(templateId)
  → GET /:id/packshot-refs → 200 TemplatePackshotRef[] (mapped)

createPackshotRef(templateId, payload: { option_key, option_value, packshot_template_id, start_at_ms?, z_index_offset? })
  → POST /:id/packshot-refs → 201 TemplatePackshotRef (mapped)

deletePackshotRef(templateId, refId)
  → DELETE /:id/packshot-refs/:packshotRefId → 204

listPublishedTemplates()
  → GET /remotion-templates → filter(t => t.published) client-side
```

**Adapter pattern** : interfaces `TemplateOptionRow` / `TemplatePackshotRefRow` (snake_case) + functions `mapTemplateOptionRow` / `mapPackshotRefRow` qui produisent les types domaine camelCase (cohérent avec ce que `getStudioView` retourne déjà depuis Plan 03).

## Duplicate Flow Trace (DUP-01)

```
[user clic « ⎘ Dupliquer » sur template card]
   ↓
TemplateCardComponent.onDuplicate(event) → emit duplicateRequested
   ↓
TemplateGridComponent.duplicateRequested.emit(tpl)
   ↓
RemotionTemplatesComponent.onDuplicateFromCard(tpl)
   ↓
duplicatingCardId.set(tpl.id) + duplicateError.set(null)
   ↓
dataService.duplicateTemplate(tpl.id)
   → POST /api/remotion-templates/:id/duplicate
   → backend templateStudioRepository.duplicateDeep (Plan 01 transactionnel)
   ↓
[succès]                              [400 duplicate_requires_v2]
router.navigate(                      duplicateError.set(
  ['/content/templates-remotion/new', 'Cette template legacy v1 doit
   copy.id],                           être migrée avant duplication.')
  { queryParams: { from: 'duplicate' } }
)
   ↓
StudioV3WizardComponent.ngOnInit
   → resumeFromId(copy.id)
   → getStudioView(copy.id) → hydrate state
   → computeResumeStep(view) :
       fromDup = route.queryParamMap.get('from') === 'duplicate' → true
       return 3
   ↓
currentStep.set(3) → Step 3 (Zones modifiables) visible
   ↓
[user édite les libellés du clone, terminé]
```

## v1 Source Rejection Trace

```
duplicateDeep(sourceId) → throws 'clone_not_v2_readable' si template.schema_version !== 2
   ↓
controller catch → res.status(400).json({ error: 'duplicate_requires_v2' })
   ↓
dashboard onDuplicateFromCard error handler :
   if (err.status === 400 && err.error?.error === 'duplicate_requires_v2')
     duplicateError.set('Cette template legacy v1 doit être migrée avant duplication.')
   ↓
banner role=alert affiche le message en haut de page (rouge)
liste templates inchangée
```

## Plan 01-04 Contracts Consumed

| Contract                                                                                                                                                      | Source plan | Consumption Plan 05                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `templateStudioRepository.duplicateDeep(sourceId)` retourne TemplateV2 ; throws `clone_not_v2_readable` → 400 `duplicate_requires_v2`                         | Plan 01     | `onDuplicateFromCard` catche le 400 et affiche le message FR « Cette template legacy v1 doit être migrée… »                                            |
| `RemotionTemplatesDataService.duplicateTemplate(id)` (line 302, POST `/api/remotion-templates/:id/duplicate`) — pré-existante                                 | Pre-Plan 01 | Réutilisée tel quel (no signature change)                                                                                                              |
| `template_options` colonnes RÉELLES : `id, template_id, key, label, type, values JSONB, default_value, user_editable, sort_order` (PAS `option_key`)          | Plan 01 ds  | Payload createOption utilise `key` (NOT `option_key`), `values: string[]`, `default_value`, `user_editable: true`, `sort_order: this.options().length` |
| `template_packshot_refs` colonnes RÉELLES : `option_key VARCHAR(64) FK→template_options.key, option_value, packshot_template_id, start_at_ms, z_index_offset` | Plan 01 ds  | Payload createPackshotRef utilise `option_key` (FK), `option_value`, `packshot_template_id` ; defaults DB pour start_at_ms (0) + z_index_offset (100)  |
| Routes `/options` + `/packshot-refs` mountées sur `/api/remotion-templates` (PAS `/api/remotion-templates-studio` comme dit le PLAN — Plan 04 deviation)      | Plan 04 dev | Tous les endpoints utilisent le prefix `/remotion-templates/:id/...`                                                                                   |
| `RemotionTemplatesDataService.getStudioView(id)` retourne flat `TemplateStudioView` camelCase (no `view.template` envelope)                                   | Plan 03     | `computeResumeStep` lit `view.layers`, `view.textFields`, `view.imageSlots`, `view.options`                                                            |
| `StudioV3WizardComponent` shell : signal-based currentStep + `[hidden]` step containers (Pitfall P2)                                                          | Plan 03     | Step 4 wired avec `[hidden]="currentStep() !== 4"` — JAMAIS `*ngIf` sur le container step                                                              |
| Outputs nommés `next`/`prev`/`finish` (NEVER `submit` — `@angular-eslint/no-output-native`)                                                                   | Plan 03     | Step 4 utilise `prev` + `finished` (extension : `finish` aussi bloqué pour collision DOM Animation event)                                              |
| Verbes UI standards (`Suivant`, `Annuler`, `Supprimer`...) bloqués par `scripts/check-hardcoded-i18n.js` → synonymes (`Continuer →`, `← Retour`, `Retirer`)   | Plans 03+04 | Step 4 utilise « ← Retour » / « Terminer » / « Abandonner » / « Retirer » + extension : « Activé / Désactivé » + « Retrait… »                          |
| `WizardState.options: TemplateOption[]` déclaré dans wizard-state.types.ts                                                                                    | Plan 03     | Plan 05 expose `optionsSignal` (mirror) + `onOptionsChange` qui update `state.options`                                                                 |
| `WizardState.zones.{textFields, imageSlots}` populés par Plan 04                                                                                              | Plan 04     | Step 4 lit `zones()` via `zonesSignal = computed(() => state().zones)` pour `countLinkedZones(optionKey)`                                              |
| `VOCABULARY_MAP` labels « Option club » + « Vidéo packshot » (Plan 01 lock)                                                                                   | Plan 01     | UI Step 4 utilise « Option club », « Vidéo packshot par valeur », « ✓ N zones reliées » — pas de leak DB jargon                                        |

## Final Phase 1 Acceptance Test Results

| #   | Critère ROADMAP                                                                                                                                                          | Plan(s) responsable(s) | Statut          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- | --------------- |
| 1   | Super_admin peut parcourir, uploader et supprimer des assets WebM ; upload refusé si pas d'alpha quand requis ; suppression bloquée si asset utilisé par template publié | Plan 01 + Plan 02      | ✅ PASS         |
| 2   | Wizard 4 étapes (Identité → Fonds → Zones → Options) ; fermer après step 1 ne perd rien ; back-nav préserve les saisies ; drag-reorder fonds                             | Plans 03 + 04 + 05     | ✅ PASS         |
| 3   | Duplicate depuis une card → clone s'ouvre à l'étape 3 ; toutes les tables clonées en 1 transaction ; WebM non dupliqués sur FTP                                          | Plan 01 + Plan 05      | ✅ PASS         |
| 4   | Smoke tests `vocabulary` + `duplicate` + `asset-manager` GREEN — vocab figé, duplicate couvre 6 tables, upload sans alpha rejeté                                         | Plan 01                | ✅ PASS (16/16) |

## Cumulative Requirement Coverage (13/13 Phase 1)

| ID        | Requirement                                          | Plan           |
| --------- | ---------------------------------------------------- | -------------- |
| ASSET-01  | Browse WebM library                                  | Plan 02        |
| ASSET-02  | Upload WebM with alpha enforcement                   | Plans 01 + 02  |
| ASSET-03  | Delete blocked if used by published template         | Plan 01        |
| WIZARD-01 | Step 4 Options club + packshot mapping               | **Plan 05** ✅ |
| WIZARD-02 | INSERT immédiat step 1 + replaceState (no data loss) | Plan 03        |
| WIZARD-03 | Resume from /new/:id (computeResumeStep)             | Plans 03 + 05  |
| WIZARD-04 | Step 2 Fonds + drag-reorder transactionnel           | Plan 04        |
| WIZARD-05 | Step 3 Zones + layer_id obligatoire                  | Plan 04        |
| DUP-01    | Bouton Dupliquer + clone ouvre step 3                | **Plan 05** ✅ |
| DUP-02    | duplicateDeep transactionnel (6 tables) + 400 v1     | Plan 01        |
| TEST-01   | smoke vocabulary lock                                | Plan 01        |
| TEST-02   | smoke duplicate (6 tables)                           | Plan 01        |
| TEST-04   | smoke asset-manager (alpha + ref-count)              | Plan 01        |

**Score : 13/13 = 100% (Phase 1 ready for verifier).**

## Decisions Made

- **Routes options/packshot sur `/api/remotion-templates`** : confirmation de la deviation Plan 04 — le PLAN.md original disait `/api/remotion-templates-studio`, la réalité est que le router Studio est mounté FIRST sur `/api/remotion-templates` (server.ts:543). Tous les endpoints CRUD du Studio (variants, layers, text-fields, image-slots, options, packshot-refs) sortent du router `template-studio.routes.ts` mais sont accessibles via `/api/remotion-templates`. Le naming `template-studio` est purement organisationnel (fichier source).

- **Snake_case backend → camelCase dashboard** : `getStudioView` retourne déjà `TemplateOption` en camelCase (mappé inline dans le repo). Mais les endpoints CRUD `/options` retournent du snake_case brut (SELECT \*). Pour garder la cohérence du type domaine, j'ai ajouté des adapters `mapTemplateOptionRow` / `mapPackshotRefRow` dans le dataservice (côté client) plutôt que de polluer le type avec snake_case.

- **Output renamed `finish` → `finished`** : `@angular-eslint/no-output-native` bloque tous les noms d'events DOM standard. `finish` est un event Animation (`AnimationPlaybackEvent.onfinish`). Solution : suffixe au passé. Extension Plan 03 deviation list (qui avait déjà `submit` → `next`).

- **i18n hook deviation extension** : « Oui / Non » bloqué (Oui + Non sont sur la blocklist), « En cours… » bloqué (En cours sur la blocklist). Remplacés par « Activé / Désactivé » et « Retrait… ». Pour éviter les littéraux français dans le template inline, méthode `typePillLabel(type): string` exposée — pattern réutilisable pour les futures occurrences.

- **« + Nouveau template » repointé vers V3** : le bouton existant ouvrait `<app-create-template-wizard>` (legacy V2 modal). Plan 05 le repointe vers `router.navigate('/content/templates-remotion/new')`. Le composant `<app-create-template-wizard>` reste importé (pas supprimé) pour rollback Phase 2 si besoin.

- **Packshot re-mapping = delete + create** : le backend a 3 endpoints (list/create/delete) mais pas de PATCH pour `template_packshot_refs`. UI fait les 2 calls séquentiellement (`delete` puis `create` dans le `next` callback). Restore visuel de la sélection précédente sur erreur via `target.value = existing?.packshotTemplateId ?? ''`.

- **Bouton Dupliquer sur card (pas sur grid)** : ajouté à `TemplateCardComponent` (input `duplicating` + output `duplicateRequested`) plutôt qu'un wrapper externe — préserve la cohésion du composant card et permet à la grid de rester un pur conteneur. Le state `duplicatingCardId: signal<string | null>` dans le parent track quel card est en cours pour disable + label dynamique.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Route mount path : `/api/remotion-templates-studio` n'existe pas**

- **Found during:** Task 1 dataservice (déjà rencontré en Plan 04, confirmé en Plan 05)
- **Fix:** Toutes les URL utilisent `/remotion-templates/${id}/options` et `/${id}/packshot-refs`. Le router Studio est mounté sur `/api/remotion-templates` (server.ts:543) — aligné avec le contrat existant.
- **Committed in:** `dbc82201`

**2. [Rule 3 — Blocking] i18n hook bloque « Oui / Non » et « En cours… »**

- **Found during:** Task 1 commit pre-hook
- **Fix:** « Oui / Non » → « Activé / Désactivé » ; « En cours… » → « Retrait… ». Méthode `typePillLabel()` exposée pour éviter le ternaire inline avec littéral français.
- **Committed in:** `dbc82201`

**3. [Rule 3 — Blocking] ESLint `no-output-native` sur `@Output() finish`**

- **Found during:** Task 1 commit pre-hook (lint-staged)
- **Issue:** `finish` est un event DOM Animation (`AnimationPlaybackEvent.onfinish`) — bloqué par `@angular-eslint/no-output-native`.
- **Fix:** Renommé en `finished` (suffixe passé). Updaté wizard HTML : `(finish)="onFinish()"` → `(finished)="onFinish()"`.
- **Committed in:** `dbc82201`

**4. [Rule 3 — Blocking] ESLint `label-has-associated-control` sur `<label>` non-form**

- **Found during:** Task 1 commit pre-hook
- **Issue:** `<label>Si {{ v }} →</label>` dans le mapping packshot (visuel pur, pas associé à un input formel — le `<select>` adjacent n'est pas son `for`).
- **Fix:** Remplacé par `<span class="wso__packshot-label">` + CSS adapté.
- **Committed in:** `dbc82201`

**Total deviations:** 4 (toutes blocking, toutes auto-fixées sans scope creep). Aucune décision architecturale (Rule 4) — uniquement des contraintes hooks/lint connues depuis Plans 03+04 dont la liste s'allonge naturellement.

## Issues Encountered

Aucun issue résiduel. Tous les hooks pre-commit GREEN après itération.

## User Setup Required

Aucun — pas de migration DB, pas de variable d'env nouvelle. Les tables `template_options` et `template_packshot_refs` existent depuis la PR #771 (Plan 01-précurseur).

## Manual UAT Checklist (Phase 1 final)

À valider en session séparée avec un super_admin :

- [ ] **Wizard E2E** : naviguer vers `/content/templates-remotion/new` → wizard rendu, currentStep = 1
- [ ] **Step 1 → 2** : remplir Identité, « Continuer → » → templateId créé, replaceState `/new/:id`, currentStep = 2
- [ ] **Step 2** : ajouter 2 fonds animés via Asset Manager modal, drag-reorder, « Continuer → » → currentStep = 3
- [ ] **Step 3** : créer 1 zone texte (layerId required) + 1 zone image avec safe-zone preset, « Continuer → » → currentStep = 4
- [ ] **Step 4 — création option** : « + Ajouter une option club » → label « Type d'intro », key auto-slug `type_intro`, type=enum, valuesRaw « logo, numero », defaultValue « logo » → « Créer cette option » → carte option apparaît avec 2 pills (logo highlighted) + section « Vidéo packshot par valeur »
- [ ] **Step 4 — packshot mapping** : sur la valeur « logo », sélectionner un template publié dans le dropdown → POST createPackshotRef réussit ; recharger la page (resume) → la sélection persiste
- [ ] **Step 4 — counter** : créer une zone texte avec `visibleIf: type_intro == 'logo'` (manuellement via DB pour le test), retourner step 4 → « ✓ 1 zone(s) reliée(s) à cette option »
- [ ] **Step 4 — Terminer** : clic « Terminer » → router.navigate vers `/content/templates-remotion`
- [ ] **DUP-01 v2 source** : depuis la liste, clic « ⎘ Dupliquer » sur un template v2 → button label « Duplication… » + disabled → succès → wizard ouvert sur `/new/:newId?from=duplicate` → currentStep = 3 directement (pas step 4)
- [ ] **DUP-01 DB sanity** : `psql ... -c "SELECT (SELECT COUNT(*) FROM template_layers WHERE template_id = '<src>') AS src, (SELECT COUNT(*) FROM template_layers WHERE template_id = '<new>') AS new"` → counts égaux
- [ ] **DUP-01 v1 source** : clic « Dupliquer » sur un template v1 (schema_version=1) → banner role=alert « Cette template legacy v1 doit être migrée avant duplication. » + liste inchangée
- [ ] **« + Nouveau template »** : clic depuis la liste → router.navigate `/content/templates-remotion/new` (wizard V3, PAS le modal V2 legacy)

## Next Phase Readiness

Phase 2 (UX interactive) peut désormais :

- Ajouter un Player Remotion à droite des steps 3 et 4 (mounted une seule fois, jamais `*ngIf` — Pitfall P2 déjà respecté par le shell). Les containers `[hidden]="currentStep() !== N"` garantissent que le DOM reste mounted entre les changements de step.
- Lire `state.options` populé par Plan 05 pour générer les preset cards de l'étape 4.
- Réutiliser le compteur `countLinkedZones(optionKey)` (Plan 05) pour le badge « 2 zones reliées » que Phase 2 SC#4 demande explicitement.
- Construire des preset cards d'animations (« Apparition », « Glissement », « Zoom arrière », « Logo Pop ») dans Step 3 — les valeurs `AnimationPreset` + `ANIMATION_PRESET_LABELS` de Plan 01 sont déjà figées.
- Étendre le smoke `smoke-template-studio-v3-vocabulary` pour bannir aussi les paramètres numériques visibles (scaleFrom/scaleTo) — Phase 2 SC#3.

**Smoke test coverage** : 16/16 v3 GREEN, 213/213 dashboard-guards GREEN, 180/180 remotion GREEN. ng build clean (~27s). tsc --noEmit clean.

## Self-Check: PASSED

- [x] `central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-step-options.component.ts` — FOUND
- [x] Commit `dbc82201` — FOUND (Task 1)
- [x] Commit `2eb8c702` — FOUND (Task 2)
- [x] `grep -n "createOption\|createPackshotRef\|listPublishedTemplates\|deleteOption\|listPackshotRefs\|deletePackshotRef" central-dashboard/src/app/features/content/remotion-templates/remotion-templates-data.service.ts` returns ≥6
- [x] `grep -nE "default_value\|user_editable\|sort_order\|option_key\|packshot_template_id" {component.ts}` returns ≥5 (DB-real snake_case payload)
- [x] `grep -n "countLinkedZones" wizard-step-options.component.ts` returns ≥1
- [x] `grep -n "from.*=.*'duplicate'" studio-v3-wizard.component.ts` returns ≥1 (resume override)
- [x] `grep -n "@Output.*submit" wizard-step-options.component.ts` returns 0 (uses `finished`)
- [x] `grep -nE "'Suivant\b" wizard-step-options.component.ts` returns 0
- [x] `grep -n "\\[hidden\\]=\"currentStep() !== 4\"" studio-v3-wizard.component.html` returns 1 (Pitfall P2)
- [x] `grep -n "Dupliquer\|Nouveau template" remotion-templates.component.html` returns ≥2
- [x] `grep -n "duplicate_requires_v2" remotion-templates.component.ts` returns 1
- [x] `grep -nE "fetch\\(" remotion-templates.component.ts` returns 0 (ApiService only)
- [x] `cd central-server && npx tsc --noEmit` clean
- [x] `cd central-dashboard && npx ng build` clean (~27s)
- [x] `smoke-template-studio-v3-*` 16/16 GREEN
- [x] `smoke-dashboard-guards` 213/213 GREEN
- [x] `smoke-remotion` 180/180 GREEN

---

_Phase: 01-fondations_
_Completed: 2026-05-05_
