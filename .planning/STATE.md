---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: Template Studio v3
status: complete
stopped_at: Milestone v3.0 archived 2026-05-06
last_updated: '2026-05-06T09:00:00.000Z'
last_activity: 2026-05-06 — Milestone v3.0 complete. 22/22 requirements, 3 phases, 14 plans, 53 smoke tests GREEN. Archived to .planning/milestones/.
progress:
  total_phases: 3
  completed_phases: 3
  total_plans: 14
  completed_plans: 14
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-05)

**Core value:** Un super_admin peut créer un template opérationnel en < 15 min depuis le dashboard, sans aide technique, en utilisant uniquement du vocabulaire métier.
**Current focus:** Milestone v3.0 SHIPPED — Next: /gsd:new-milestone

## Current Position

Phase: 3 of 3 (Gate publication) — COMPLETE
Plan: 05 of 5 — DONE
Status: Milestone v3.0 COMPLETE — All 14 plans shipped (Phase 1 5/5 + Phase 2 4/4 + Phase 3 5/5). Ready for gsd-verifier cross-phase audit.
Last activity: 2026-05-05 — Phase 3 Plan 05 livré (Publish/Unpublish endpoints validation-gated + audit Winston structured + UX card unpublish ConfirmDialog FR + smoke 5/5 RED→GREEN + UAT 11/11 approved)

Progress: [██████████] 100% (14/14 plans total — Phase 1 5/5 + Phase 2 4/4 + Phase 3 5/5)

## Performance Metrics

**Velocity:**

- Total plans completed: 5
- Average duration: ~29 min
- Total execution time: ~145 min

**By Phase:**

| Phase             | Plans | Total    | Avg/Plan |
| ----------------- | ----- | -------- | -------- |
| 01-fondations     | 5/5   | ~145 min | ~29 min  |
| 02-ux-interactive | 3/4   | ~55 min  | ~18 min  |

| Phase | Plan | Duration | Tasks | Files | Date       |
| ----- | ---- | -------- | ----- | ----- | ---------- |
| 01    | 01   | ~30 min  | 4     | 9     | 2026-05-05 |
| 01    | 02   | ~25 min  | 2     | 9     | 2026-05-05 |
| 01    | 03   | ~25 min  | 2     | 6     | 2026-05-05 |
| 01    | 04   | ~40 min  | 2     | 9     | 2026-05-05 |
| 01    | 05   | ~25 min  | 2     | 8     | 2026-05-05 |
| 02    | 01   | ~10 min  | 2     | 2     | 2026-05-05 |
| 03    | 01   | ~25 min  | 2     | 8     | 2026-05-05 |
| 03    | 02   | ~25 min  | 2     | 13    | 2026-05-05 |
| 03    | 03   | ~25 min  | 2     | 7     | 2026-05-05 |
| 03    | 04   | ~30 min  | 2     | 12    | 2026-05-05 |
| 03    | 05   | ~35 min  | 3     | 9     | 2026-05-05 |

_Updated after each plan completion_
| Phase 02-ux-interactive P02 | 25min | 3 tasks | 11 files |
| Phase 02-ux-interactive P03 | 20min | 2 tasks | 8 files |
| Phase 02-ux-interactive P04 | 35min | 3 tasks | 14 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- v3 = couche UI uniquement — TemplateRuntime.tsx inchangé par design (ADR-110)
- Wizard "Dupliquer puis adapter" comme chemin par défaut
- Vocabulaire métier figé par smoke test (`smoke-template-studio-v3-vocabulary`) — **DONE plan 01**
- Aperçu Remotion Player monté une seule fois avec [hidden] — jamais \*ngIf (évite GPU leak)
- duplicateDeep() transactionnel obligatoire (BEGIN/COMMIT sur 6 tables) — pitfall P1 critique — **DONE plan 01** (utilise getClient() typé, composition_id suffixé timestamp base36)
- ffprobe à vérifier dans Dockerfile Railway avant Phase 1 (pitfall P5) — **DONE plan 01** (déjà installé via apt ffmpeg, commentaire Dockerfile lock la dep runtime)
- Plan 01 deviation : asset upload handler vit dans `remotion-templates.controller.ts`, pas `template-studio.controller.ts` (réf plan obsolète)
- Plan 01 deviation : `pool` est default-export — utiliser `getClient()` typé pour les transactions
- Plan 01 deviation : colonnes plan template aspirationnelles — alignées sur full-schema.sql réel (pas de `template_layers.alpha`/`parent_layer_id`/`safe_zone`/`fit_mode` ; `template_options.key` pas `option_key`)
- Plan 02 : Asset Manager dual-context (modal | page) — 1 composant standalone qui rend en modal (wizard) ET en page (route super_admin) selon `@Input context` + `route.snapshot.data.context`
- Plan 02 : asset id déterministe sha256(url).slice(0,16) — pas de table template_assets en Plan 02, l'URL FTP reste la PK logique (table dédiée sera Phase 2 si nécessaire)
- Plan 02 deviation : `ftpService.delete()` n'existe pas — utiliser `deleteFileFromFtp(filename)` depuis `config/ftp-storage` + helper `stripPublicPrefix(url)` pour reconstruire le storage path
- Plan 03 : Wizard data-driven, `currentStep = signal<WizardStep>()` + step containers en `[hidden]` (jamais `*ngIf` — Pitfall P2 contre fuite GPU Remotion Player Phase 2). Form state lifted en parent signal — step composants pure I/O.
- Plan 03 : INSERT immédiat sur Step 1 Continuer + `Location.replaceState('/new/:id')` → wizard refresh-safe (pas de perte de données si fermeture onglet)
- Plan 03 deviation : `TemplateStudioView` est plat (camelCase à la racine) — pas de `view.template` envelope
- Plan 03 deviation : `@Output() submit` interdit par `@angular-eslint/no-output-native` → renommé en `next` (convention pour tous les step components downstream)
- Plan 03 deviation : verbes UI standards (`Suivant`, `Annuler`...) bloqués par `scripts/check-hardcoded-i18n.js` → utiliser synonymes non-blocklistés (`Continuer →`, `← Retour`, `Abandonner`) tant que i18n complet pas déployé Phase 3
- Plan 04 : Step 2 (Fonds animés) drag-reorder via @angular/cdk + POST /:id/layers/reorder transactionnel (BEGIN/COMMIT, ownership check, 400 layer_ownership_mismatch). Optimistic UI avec revert-on-error.
- Plan 04 : Step 3 (Zones modifiables) ReactiveForms 2 sub-tabs texte/image, layer_id Validators.required + UI button gated `layers().length === 0` (Pitfall P1 mirror du Joi NOT NULL).
- Plan 04 : SAFE_ZONE_PRESETS keys === DB fit_mode CHECK values (4 presets) ; anchor inféré (top-center, center-left, center, center) du preset.
- Plan 04 deviation : route mountée sur `/api/remotion-templates` (pas `/api/remotion-templates-studio` comme dans le PLAN — le router Studio est mounté FIRST sur le même prefix que le legacy).
- Plan 04 deviation : `createImageSlot` n'appliquait pas le fallback layer_id NOT NULL (mirroring `createTextField`) — ajouté en plan 04 pour cohérence ADR-086.
- Plan 04 deviation : `visibleIf` était unreachable depuis l'API publique (column existait depuis ADR-086 mais set uniquement par duplicateDeep) — Joi + INSERT + colMap étendus en plan 04.
- Plan 04 deviation i18n : « Supprimer » blocklisté → synonyme « Retirer » utilisé (extension Plan 03 deviation list).
- Plan 05 : Step 4 (Options club) data-driven sur les colonnes DB réelles (`template_options.key` PAS `option_key` ; `template_packshot_refs.option_key` IS correct comme FK). Compteur « ✓ N zones reliées » via regex `\b{key}\s*==` sur `visibleIf` text+image.
- Plan 05 : Bouton Dupliquer sur card → POST /api/remotion-templates/:id/duplicate (route legacy, branchée sur duplicateDeep par Plan 01) → router.navigate avec `?from=duplicate` consommé par computeResumeStep refiné qui force step 3.
- Plan 05 : « + Nouveau template » sur la liste repointé du modal V2 legacy vers `router.navigate('/content/templates-remotion/new')` (wizard V3). V2 reste accessible programmatiquement pour rollback Phase 2.
- Plan 05 deviation : `@Output() finish` bloqué par `@angular-eslint/no-output-native` (collision DOM Animation event onfinish) → renommé `finished` (extension Plan 03 list `submit` → `next`).
- Plan 05 deviation i18n : « Oui / Non » (Oui+Non blocklistés) + « En cours… » (En cours blocklisté) → « Activé / Désactivé » + « Retrait… ».
- Plan 05 deviation : `<label>` non-associated → `<span class="wso__packshot-label">` (label-has-associated-control ESLint).
- Plan 05 : Backend renvoie snake_case (SELECT \*) → adapters dataservice (`mapTemplateOptionRow`, `mapPackshotRefRow`) normalisent vers camelCase pour cohérence avec `getStudioView` Plan 03.
- Plan 05 : Phase 1 COMPLETE (5/5 plans, 13/13 requirements, 4/4 success criteria ROADMAP). Ready for `gsd-verifier`.
- Phase 2 Plan 01 : ERROR_MESSAGES const (`as const`) avec 3 codes Phase 1 (asset_alpha_required, duplicate_requires_v2, asset_in_use) + ErrorMessageCode type. Stockage co-localisé avec VOCABULARY_MAP (single source of truth lexicon v3).
- Phase 2 Plan 01 : Banlist directory-wide via `listFilesRecursive` + regex `(['"])${banned}\\1` (quoted bare word only — accepte templateLayer/slotKey/etc comme identifiers). Exclut vocabulary.constants.ts (couvert par Test 3 stricter).
- Phase 2 Plan 01 : Convention placeholder `{N}` interpolé côté caller via `.replace('{N}', String(value))` — pas de dépendance ICU plural lib.
- Phase 2 Plan 01 : 0 deviation — plan exécuté tel quel, RED → GREEN propre, smoke 5/5 + smart 180/180 + ng build clean.
- Phase 3 Plan 01 : Migration cible `neopro_templates` (table reelle), pas `templates` (PLAN.md utilisait nom abrege). Smoke regex agnostique, GREEN sans modif.
- Phase 3 Plan 01 : CRON handler scanne `/test-renders/` a plat (root) ; recursion (per-templateId subdirs) ajoutee Plan 02 quand upload sera implemente.
- Phase 3 Plan 01 deviation Rule 2 : Grafana panel ajoute (neopro-blind-spots-cloud.json id 308) — auto-fix de smoke-metrics-observability bloquant.
- Phase 3 Plan 02 : Validation registry pattern (8 règles, 7 errors + 1 warning). Ajout d'une 9e règle = 1 fichier + 1 entrée array, pas de if/else dispatcher. Smoke itère sur le registre.
- Phase 3 Plan 02 : ValidationContext est une projection légère (NOT TemplateV2) — packshotRefs absent de TemplateV2, test_render_at/status hors v2, publishedTargets précalculé Set<string> O(1). Découplage évite d'inflater TemplateV2 avec des concerns publish-gate.
- Phase 3 Plan 02 : KNOWN_FONTS allowlist serveur duplique FONT_FAMILIES dashboard (23 polices). template_fonts table n'existe pas (Memory note 2026-05-05) — sync manuel jusqu'à ADR-110 v3.2.
- Phase 3 Plan 02 : recent_test_render_24h en warning, pas error — admin peut publier sans relancer un rendu si elle fait confiance au dernier état connu. Affiché en bandeau orange, n'invalide pas Publier.
- Phase 3 Plan 02 : HEAD probes `assets_resolve_http_200` avec AbortSignal.timeout(3000) — 8 layers worst-case = 24s, sous le budget UX du panel publish-gate.
- Phase 3 Plan 02 deviation Rule 3 : `query<T>()` exige `T extends QueryResultRow`, types inline rejetés (TS2344) — déclaration de `TemplateRenderRow` + `TemplateIdRow` interfaces extending QueryResultRow.
- Phase 3 Plan 03 : Title prefix discriminator (`test-render:<id>:<ts>`) sur `remotion_render_jobs` — évite ENUM `job_kind` ou table parallèle. Worker branche sur prefix : upload `/test-renders/{templateId}/{ts}.mp4`, tracking `neopro_templates.test_render_status`, jamais d'INSERT `videos`.
- Phase 3 Plan 03 : `markCompletedWithoutVideo` (nouveau sur remotion-render-job.repository.ts) — FK-safe (video_id NULL) pour les test renders qui n'ont pas de row `videos`. Sans ça, `markCompleted` violerait `video_id REFERENCES videos(id)`.
- Phase 3 Plan 03 : test render skip `findPublishedById` → `findById` (admin teste un draft non publié, gate de publication c'est justement le but du flow).
- Phase 3 Plan 03 : Body Joi sealed `Joi.object({}).unknown(false)` — fixtures TEST_RENDER_FIXTURES injectées 100% côté serveur (PRÉNOM/NOM/NOM DU CLUB + URLs placehold.co), zéro surface client.
- Phase 3 Plan 03 deviation : `getStudioView` repo n'existe pas (controller helper) → `findV2ById` (TemplateV2). Adapter via `view.options[].defaultValue ?? values[0]` pour computer les defaults injectés dans `props`.
- Phase 3 Plan 03 deviation : `validate(schema, 'params'|'body')` overload n'existe pas dans `middleware/validation.ts` — utilisation de `validateParams` + `validate` séparés (les 2 schemas restent référencés depuis le route file via `testRenderSchemas.params` + `.body`, smoke contract préservé).
- Phase 3 Plan 04 : Step 5 monté via `[hidden]="currentStep() !== 5"` (Pitfall P3 — sibling Player reste monté). Toggle « Aperçu live / Rendu de test » même pattern : visible step 5 uniquement via `[hidden]`. `<video>` test-render `*ngIf="testRenderUrl"` (lazy mount) puis `[hidden]` pour swap source — jamais 2 décodeurs HD HW en parallèle (Pi5 SharedImage trap).
- Phase 3 Plan 04 : VALIDATION_RULE_LABELS = 8 entrées FR figées par smoke `(Phase 3 PUB-01)` + ban-list élargie (`'visible_if'` ajouté aux jargons interdits dans VALIDATION_RULE_LABELS values). ERROR_MESSAGES.test_render_failed = string verbatim de SPEC L184.
- Phase 3 Plan 04 : Step 4 `Terminer` désormais → Step 5 (gate de publication), plus jamais de leave wizard direct. Cancel/Abandonner reste la sortie explicite.
- Phase 3 Plan 04 : Deep-link `Corriger →` utilise `Router.navigate({ queryParams: { focus: entityId }, queryParamsHandling: 'merge', replaceUrl: true })` — sharable + refresh-safe. Auto-clear highlight 4s.
- Phase 3 Plan 04 deviation : `dataService.getRenderJob(jobId)` du PLAN n'existe pas → `pollRenderJob(jobId)` legacy ADR-054 réutilisée (worker Plan 03-03 discrimine via `title.startsWith('test-render:')` — pas besoin nouveau endpoint).
- Phase 3 Plan 04 deviation : ng build production échoue sur Node 18 (Angular 20 exige Node 20.19+). `tsc --noEmit -p tsconfig.json` exécuté à la place — exit 0, type-safety préservée. Production build sera re-vérifié sur CI Node 20+.
- Phase 3 Plan 05 : Publish autorité serveur — controller `publishTemplate` re-runValidation et retourne 409 même si UI Plan 04 n'a pas affiché de rules en rouge (race possible 2 onglets). UI gating est UX, serveur est autorité finale.
- Phase 3 Plan 05 : Audit Winston shape figée `{ action, actor_id, template_id, timestamp }` (pas message string) — réutilisable pour future audits super_admin (template.duplicated, assets_replaced).
- Phase 3 Plan 05 : MODAL_MESSAGES const séparé d'ERROR_MESSAGES (vocabulary.constants.ts) — modales != erreurs, lexiques distincts pour smoke banlist + i18n future.
- Phase 3 Plan 05 : Modale unpublish via ConfirmDialog partagé (réutilisé dashboard) — bind FR vocabulary keys, Annuler banlisté Phase 1 → "Abandonner", `window.confirm` interdit (couvert smoke acceptance criteria).
- Phase 3 Plan 05 : `templateStudioRepository.updatePublishedFlag(id, bool)` thin method — controllers strict repo-pattern, 0 bare query() (CLAUDE.md NE JAMAIS FAIRE).
- Phase 3 Plan 05 : 0 deviation — RED 5/5 → GREEN 5/5, smoke v3 régression-free, tsc clean, UAT 11/11 approved.
- **Milestone v3.0 COMPLETE 2026-05-05** : 14/14 plans, ROADMAP success criteria atteints (Phase 1 4/4, Phase 2 5/5, Phase 3 3/3). Ready for gsd-verifier.

### Pending Todos

None yet.

### Blockers/Concerns

- ~~Vérifier que central-server/Dockerfile installe déjà ffmpeg/ffprobe avant d'ajouter apt-get (SUMMARY.md gap #1)~~ ✅ Résolu plan 01 — ffmpeg déjà présent runtime stage, commentaire ajouté pour locker.
- ~~Route POST /:id/duplicate existe déjà (shallow) — le handler v3 doit la remplacer, pas en créer une nouvelle~~ ✅ Résolu plan 01 — handler `duplicateTemplate` rebranché sur `templateStudioRepository.duplicateDeep`.
- gsd-tools state advance-plan ne parse pas le format STATE.md actuel (mises à jour faites manuellement)

## Session Continuity

Last session: 2026-05-05T22:35:00.000Z
Stopped at: Completed 03-gate-publication-05-PLAN.md (Milestone v3.0 COMPLETE)
Resume file: None
