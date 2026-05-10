# SPEC : Template Studio v3 — UX admin orientée tâche

> **Owner** : Daisy
> **Statut** : Proposed (ADR-110, à implémenter)
> **Dernière revue** : 2026-05-05
> **last_verified** : 2026-05-10
> **verified_against_commit** : 1890d43
> **Code principal (futur)** :
> - `central-dashboard/src/app/features/content/remotion-templates/studio-v3/` — module Angular wizard + asset manager + validation
> - `central-server/src/controllers/template-studio.controller.ts` — endpoints duplicate/validate/test-render
> - `central-server/src/repositories/template-studio.repository.ts` — méthodes `duplicateTemplate()`, `validateTemplateIntegrity()`
> **Tables DB (inchangées)** : `neopro_templates`, `template_layers`, `template_text_fields`, `template_image_slots`, `template_options`, `template_packshot_refs`, `template_variants`, `template_versions`
> **ADR liés** : ADR-110 (cette spec), ADR-086 (moteur n-layers), ADR-095 (admin UX v2 sous-jacent), ADR-108 (versioning), ADR-109 (backgrounds grants)
> **Maquette validée** : `docs/templates/mockups/template-studio-v3-mockup.html` (validée Daisy 2026-05-05)
> **Spec source designer** : `docs/templates/SPEC-Animation-Joueur.pdf` (Daisy, 2026-04-30)
> **`.claude/rules/` lié** : `templates.md` (à étendre en fin de Phase C)

## En une phrase

Le Template Studio v3 ajoute une couche UX admin par-dessus le moteur v2 existant pour qu'un super_admin (Daisy ou un designer non-Neopro) puisse **créer, dupliquer, configurer et publier un template sans terminal, sans SQL, sans connaître les concepts DB**, en utilisant exclusivement un vocabulaire métier.

## Périmètre

- **Services backend** : `central-server/src/controllers/template-studio.controller.ts`, `central-server/src/repositories/template-studio.repository.ts`
- **Composants UI (à créer)** : `central-dashboard/src/app/features/content/remotion-templates/studio-v3/` (wizard, asset manager, validation)
- **Composants UI existants (cohabitation)** : `studio-v2/admin/` (admin-canvas-overlay, admin-field-editor, admin-layers-panel)
- **Tables DB** : `neopro_templates`, `template_layers`, `template_text_fields`, `template_image_slots`, `template_options`, `template_packshot_refs`, `template_variants`
- **Routes API** : `POST /api/remotion-templates` (create), `POST /api/remotion-templates/:id/duplicate`, `POST /api/remotion-templates/:id/validate`, `POST /api/remotion-templates/upload`
- **ADR** : ADR-110 (v3), ADR-086 (moteur n-layers), ADR-095 (admin UX v2), ADR-108 (versioning), ADR-109 (backgrounds grants)
- **Smoke tests (à créer)** : `smoke-template-studio-v3-vocabulary.test.ts`, `smoke-template-studio-v3-wizard-validation.test.ts`, `smoke-template-studio-v3-duplicate.test.ts`
- **`.claude/rules/`** : `templates.md`

## Personas et autonomie cible

| Persona | Action | Autonomie cible v3 | Autonomie actuelle v2 |
|---|---|---|---|
| Super_admin Neopro (Daisy) | Créer un template à partir d'une SPEC PDF | ✅ 100% UI dashboard | ❌ ~30% (SQL + CLI nécessaires) |
| Designer externe non-Neopro | Adapter un template existant (cloner + tweaker) | ✅ 100% UI dashboard | ❌ ~10% |
| Bénévole club (utilisateur final) | Consommer un template pour générer une vidéo joueur | ⚠️ Hors scope v3 — Phase D ultérieure (UI club portal) | N/A |
| Developer Neopro | Ajouter un nouveau preset d'animation au moteur | Inchangé (reste un job dev backend) | Idem |

## Règles métier (ce qui DOIT marcher)

### Vocabulaire métier (mapping figé UI ↔ DB)

Le vocabulaire UI est **strictement métier**. Le vocabulaire DB reste technique. Le mapping suivant est figé et testé via smoke test.

| Concept UI (vu par l'admin) | Concept DB (technique) | Notes |
|---|---|---|
| Fond animé / calque vidéo | `template_layers` (1 row par fond) | L'ordre = `z_index` (1 = arrière) |
| Zone modifiable | `template_text_fields` ∪ `template_image_slots` | Type "Texte" ou "Image" |
| Limite de caractères | `template_text_fields.max_chars` | Affiché en aide UX, validation Joi serveur |
| Police | `template_text_fields.font_family` | Liste figée dans `FONT_FAMILIES` (à terme : table `template_fonts`) |
| Quand cette zone apparaît | `template_text_fields.visible_if` / `template_image_slots.visible_if` | Format `<option_key> == "<value>"` |
| Zone sûre & cadrage | `template_image_slots.anchor` + `fit_mode` | Presets visuels nommés ("Photo en haut, déborde en bas", "Logo centré dans hexagone") |
| Animation : Apparition | `animation: 'fade'` + `direction: 'in'` | |
| Animation : Glissement | `animation: 'slide-up'` ou `'slide-down'` | |
| Animation : Zoom out reverse | `animation: 'zoom'` + `direction: 'out'` + `scale_from`/`scale_to` | |
| Animation : Logo Pop | `animation: 'logo-pop'` + `scale_from`/`scale_to` | |
| Option club | `template_options` (1 row par option, type `enum` ou `boolean`) | Visible au démarrage côté club |
| Vidéo packshot à empiler | `template_packshot_refs` (1 row par valeur d'option) | Avec `start_at_ms` + `z_index_offset` |
| Bibliothèque de fonds animés | `template_variants` + assets WebM Railway/FTP | Phase v3.1 (UI lib switchable user, hors scope initial) |

### Workflow "Nouveau template" (Wizard 4 étapes)

**Étape 1 — Identité** :
- Champs : nom, description, durée totale (s), format (1920×1080 par défaut), FPS (30 par défaut)
- Validation : nom unique côté `composition_id` (auto-slugifié)
- Sortie DB : INSERT `neopro_templates` (sans options ni layers encore)

**Étape 2 — Fonds animés** :
- Empilage visuel (drag-to-reorder) des layers WebM depuis l'Asset Manager
- Pour chaque layer : nom métier, `start_at_ms` (calculé auto par défaut, modifiable), durée, position dans la pile
- Asset Manager (modal) : grille des WebM dispos (thumbnail + durée + dim + flag alpha), bouton "＋ Uploader" (super_admin only, refus si pas alpha quand layer prévu pour slot avec `respect_alpha`)
- Sortie DB : INSERT `template_layers` (1 par fond, `z_index` = ordre, `duration_ms`, `alpha=true`)

**Étape 3 — Zones modifiables** (vue split éditeur live) :
- Gauche : liste des zones avec form contextuel
- Droite : aperçu Player Remotion avec poignées draggables sur la zone sélectionnée + frise temporelle des layers
- Form contextuel selon type de zone :
  - **Texte** : libellé, police, taille, couleur, alignement, limite caractères, condition d'apparition (dropdown listant `template_options` créées + valeur)
  - **Image** : libellé, preset zone sûre & cadrage (dropdown nommée), condition d'apparition
- Animation : 3-5 cards visuelles par zone (Apparition / Glissement / Zoom out reverse / Logo Pop), pas de chiffres exposés
- Sortie DB : INSERT `template_text_fields` ou `template_image_slots`, `layer_id` lié

**Étape 4 — Options club** :
- Builder d'options : nom métier ("Type d'intro"), valeurs possibles (pills "Logo du club", "Numéro joueur"), valeur par défaut
- Pour chaque option de type `packshot` : 2 dropdowns "Si Générique → packshot template X", "Si Image → packshot template Y"
- **Détection auto** : afficher les zones du template dont `visible_if` référence cette option ("✓ 2 zones reliées à cette option")
- Sortie DB : INSERT `template_options` + `template_packshot_refs` selon mapping

**Étape 5 — Validation** :
- Checklist auto : tous fonds animés résolus, alpha détectée, fonts dispos, zones dans safe-zone, options cohérentes avec `visible_if` slots, packshot refs cohérents avec options
- Bouton "▶ Lancer un test avec données factices" → render Remotion async + lecture player
- Si tout vert : bouton "✓ Publier ce template" (UPDATE `published=true`)

### Workflow "Dupliquer un template"

- Bouton "Dupliquer" sur chaque card de la liste templates
- Clone DB intégral : `neopro_templates` (nouveau slug `<original>-copie`), `template_layers`, `template_text_fields`, `template_image_slots`, `template_options`, `template_packshot_refs` (refs vers les mêmes packshot templates, pas duplication des packshots)
- **Pas de duplication des assets WebM** : les `file_url` des layers pointent vers les mêmes URLs Railway/FTP
- État initial : `published=false` (forcé), nom suffixé "(copie)"
- Ouvre directement l'éditeur étape 3 (zones modifiables) du clone

### Asset Manager (fonds animés)

- Page dédiée `/templates/assets` accessible depuis sidebar admin
- Grille des WebM uploadés sur Railway (et FTP en v3.1)
- Métadonnées affichées : nom, durée, dimensions, flag alpha, date upload, nombre de templates qui l'utilisent
- **Poster JPEG** généré côté serveur via ffmpeg (1ère frame, scale 320:-1, q=2) à l'upload — stocké à `<basename>.poster.jpg` dans le même répertoire FTP. Affiché en `<img loading="lazy" decoding="async">` dans la modale ; fallback `<video preload="none">` pour les assets legacy sans poster (préserve le freeze-fix). Backfill via `npm run backfill:asset-posters`.
- Upload super_admin only, refus si :
  - Pas WebM
  - Pas alpha quand prévu pour layer avec slot `respect_alpha=true`
  - Dimensions ≠ canvas du template cible
- Suppression bloquée si asset référencé par ≥ 1 layer publié

### Aperçu temps réel (live preview)

- Player Remotion intégré côté droit en étapes 3, 4, 5 du wizard et dans l'éditeur de zones
- Hot-reload sur chaque changement de form (debounce 300ms)
- Mode "play en boucle" + scrub frise temporelle
- Données factices auto si pas de saisie utilisateur ("PRÉNOM NOM", "NOM DU CLUB", logo placeholder Neopro, photo placeholder)

### Validation pré-publication (smoke-tested)

Le bouton "Publier" est désactivé tant que la checklist suivante n'est pas verte :

1. ≥ 1 fond animé empilé
2. Tous les fonds animés résolvent (HTTP 200 sur file_url)
3. Toutes les fonts référencées sont dans `FONT_FAMILIES` (à terme : `template_fonts`)
4. Toutes les zones ont `position_x ∈ [0,1]`, `position_y ∈ [0,1]`
5. Tous les `visible_if` référencent une `template_options.key` existante avec une valeur listée dans `template_options.values`
6. Tous les `template_packshot_refs.option_key` correspondent à une option existante du template
7. Tous les `template_packshot_refs.packshot_template_id` pointent vers un template publié
8. ≥ 1 test render réussi avec données factices dans les 24h précédentes (warning, pas blocker)

## Comportements observables

| Règle | Comment on vérifie |
|---|---|
| Wizard crée un template sans SQL ni CLI | Smoke test `smoke-template-studio-v3-wizard-validation` + CU1 manuel < 15 min |
| Duplication clone toutes les rows DB sans dupliquer les assets | Smoke test `smoke-template-studio-v3-duplicate` : COUNT rows avant/après + vérif `file_url` identiques |
| Bouton "Publier" bloqué si checklist incomplète | Smoke test vérifie les 8 critères de la checklist pré-publication |
| Upload WebM refusé si pas alpha + `respect_alpha=true` | Smoke test `smoke-template-studio-v3-asset-manager` |
| Vocabulaire UI ↔ DB figé (mapping non-régressé) | Smoke test `smoke-template-studio-v3-vocabulary` — changement de clé = rouge |
| Test render Remotion disponible avant publication | Log Winston `info` + retour player + feedback UI étape 5 |

## Cas d'usage canoniques (à exécuter manuellement avant chaque release)

### CU1 : Daisy crée le template "Joueur Simple — Image" depuis le PDF

1. Clic "+ Nouveau template" → Wizard étape 1
2. Saisit nom, durée 5,9s, format 1920×1080
3. Étape 2 : empile JOUEUR_simple_A.webm + JOUEUR_simple_B.webm depuis Asset Manager
4. Étape 3 : ajoute 6 zones (prénom-nom, club haut, club bas, logo intro, numéro intro, photo joueur), positionne via drag, configure animations
5. Étape 4 : crée 2 options club ("Type d'intro" : logo/numéro, "Type de packshot" : générique/image) + map les packshot_refs vers les 2 templates packshot
6. Étape 5 : validation auto verte, lance un test → vidéo générée, valide à l'œil
7. Publie

**Critère succès** : terminé en < 15 min sans aide, sans terminal, sans SQL.

### CU2 : Daisy duplique "BUT Simple" en "BUT Hiver" avec fond bleu

1. Clic "Dupliquer" sur card "BUT Simple"
2. Renomme en "BUT Hiver" dans étape 1
3. Étape 2 : remplace JOUEUR_but_A.webm par JOUEUR_but_A_BLEU.webm (uploadé en amont) via Asset Manager
4. Saute étapes 3 et 4 (héritées identiques)
5. Étape 5 : validation, publie

**Critère succès** : terminé en < 5 min.

### CU3 : Designer externe (non-Neopro) ajoute un coloris à un template existant

1. Reçoit accès super_admin temporaire
2. Reçoit le WebM nouveau coloris par email
3. Upload via Asset Manager
4. Duplique le template, swap le layer, publie

**Critère succès** : terminé sans assistance Neopro, < 10 min, vocabulaire UI suffisant pour comprendre.

## Cas d'edge connus

- **Asset WebM uploadé sans alpha alors qu'utilisé par un slot `respect_alpha=true`** : refus à l'upload, message "Ce fond est utilisé par une zone qui nécessite la transparence — ré-exportez en yuva420p".
- **Suppression d'une option utilisée par un `visible_if`** : confirmation modale "Cette option est utilisée par 2 zones, qui deviendront toujours visibles si vous la supprimez. Continuer ?".
- **Renommage de la valeur d'une option** : auto-update des `visible_if` correspondants en transaction DB.
- **Duplication d'un template avec packshot_refs vers un template non-publié** : warning étape 5, blocage publication.
- **Test render échoue (erreur Remotion)** : log Winston `error`, message UI "Le rendu de test a échoué — vérifiez vos fonds animés et fonts. Logs disponibles dans..."

## Relation avec v2 (cohabitation)

- Le moteur v2 (`TemplateRuntime.tsx`) ne change pas. v3 = couche UI Angular au-dessus.
- L'admin Studio v2 (`admin-canvas-overlay`, `admin-field-editor`, `admin-layers-panel`) reste accessible via "Mode avancé" pour cas exceptionnels (super_admin only).
- Le CLI `template:import` reste actif pour seeding initial / migrations bulk (cas exceptionnel).
- Les rules `templates.md` v2 restent toutes valides — v3 ne casse aucun invariant.

## Phasage et delivery

- **Phase A (~1 sem)** : Asset Manager + Wizard 4 étapes (sans aperçu live) + Bouton Dupliquer
- **Phase B (~1 sem)** : Aperçu temps réel + vocabulaire métier complet + presets animation visuels
- **Phase C (~3-5j)** : Validation auto pré-publication + test render fixtures + onboarding guidé 1er template

## Garde-fous (smoke tests à ajouter)

- `smoke-template-studio-v3-vocabulary.test.ts` : le mapping UI ↔ DB est figé (changement détecté = test rouge).
- `smoke-template-studio-v3-wizard-validation.test.ts` : la checklist pré-publication refuse un template incomplet selon les 8 critères listés.
- `smoke-template-studio-v3-duplicate.test.ts` : la duplication clone toutes les rows DB liées sans dupliquer les assets WebM.
- `smoke-template-studio-v3-asset-manager.test.ts` : l'upload refuse les WebM sans alpha quand `respect_alpha=true` requis.

## Ce qui n'est PAS dans ce domaine

- **Moteur Remotion** (`TemplateRuntime.tsx`) → inchangé, couvert par SPEC [features/templates-studio](templates-studio.spec.md)
- **UI club portal pour consommer un template** → Phase D ultérieure (hors scope v3)
- **Versioning visuel / rollback templates** → v3.4, ADR-108
- **Table `template_fonts`** → v3.2 (fonts hardcodées dans `FONT_FAMILIES` en attendant)
- **Bibliothèque de fonds switchables côté club** → v3.1 (exploite `template_variants` existant)
- **CLI `template:import`** → reste actif pour seeding bulk, non remplacé par v3

## Notes d'évolution future (hors scope v3 initial)

- **v3.1** — Bibliothèque de fonds switchables côté club (utiliser `template_variants` existant) — pas dans le scope v3 initial.
- **v3.2** — Table `template_fonts` réelle (remplacer `FONT_FAMILIES` hardcodée du dashboard) + endpoint `GET /api/remotion-templates/fonts`.
- **v3.3** — UI club portal pour consommer un template (formulaire 4 champs + 2 toggles → render vidéo) — Phase D ultérieure.
- **v3.4** — Versioning visuel des templates publiés (rollback, diff visuel entre versions) — exploite ADR-108.
