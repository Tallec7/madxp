# Phase 2: UX interactive - Context

**Gathered:** 2026-05-05
**Status:** Ready for planning

<domain>

## Phase Boundary

Le wizard Template Studio v3 devient un outil de design à part entière :

1. Player Remotion live monté à droite (steps 3-4-5), refresh dynamique selon les modifications du formulaire
2. Animation choisie par "intention" via cards visuelles nommées (jamais de paramètres numériques exposés)
3. Détection automatique des liens option↔zone via `visible_if` avec UX d'aide à la décision
4. Vocabulaire métier strict figé par smoke test (labels + erreurs serveur traduites)

**Hors scope :** UI club portal (Phase D), versioning visuel (v3.4), table `template_fonts` réelle (v3.2), checklist pré-publication (Phase 3), refonte moteur Remotion.

</domain>

<decisions>

## Implementation Decisions

### Comportement du Player live (PREV-01/02/03)

- **Update timing** : hybride — debounce 300ms sur sliders/dropdowns/color pickers, refresh sur `blur` pour les inputs texte. Évite re-render constant pendant la frappe d'un libellé long, garde la réactivité sur les contrôles visuels.
- **État invalide** : impossible par construction. Form validation upstream (color picker, hex regex, font listées) bloque l'input invalide AVANT qu'il atteigne le Player. Le Player n'est jamais dans un état cassé.
- **Mode lecture** : auto-loop infini par défaut (standard Figma/After Effects pour édition d'animation).
- **Frise temporelle** : contrôles natifs `@remotion/player` (play/pause/scrub bar) — zéro code, look pro, frame-accurate scrubbing.
- **Pattern d'intégration** : Player monté UNE SEULE FOIS dans le shell wizard avec `[hidden]` sur les steps 1-2 (Pitfall P2 — déjà préempté en Phase 1, à respecter en Phase 2).
- **Pitfall P2 (CORB)** : `proxyUrl()` doit être appliqué par layer URL, pas en surface via `proxyFtpUrls(wholeState)` qui ne traverse qu'un niveau. Sinon panneaux noirs silencieux côté Player.

### UX des cards d'animation (UX-02)

- **Direction in/out** : toggle intégré dans la card (segment cliquable). 4 cards de base × 2 directions = 8 états sans grille chargée.
- **Presets v3.0** : garder les 4 actuels — Apparition, Glissement, Zoom arrière, Logo Pop. Pas d'ajout de Pulsation/Rotation/Bounce dans cette phase. Évolution v3.x si CU réel le demande.
- **Style visuel** : card statique + mini-animation CSS preview au **hover** (rectangle qui mime le mouvement). Communicatif sans charge GPU. Pas d'animation toujours en lecture (laggy + distrayant si 4-8 cards).
- **Stack par zone** : MAX 1 animation par zone, et **animation OPTIONNELLE** (zone peut être statique = pas d'animation, juste apparaît au début du layer parent et reste). La card sélecteur doit donc inclure une option "Aucune animation" en plus des 4 presets. Conforme au comportement v2 où `animation` est nullable.
- **Anti-feature** : aucun champ numérique scaleFrom/scaleTo/durationMs exposé à l'utilisateur (confirmé recherche).

### Feedback visible_if auto-détecté (UX-03)

- **Affichage** : inline sous chaque option dans Step 4 — "✓ N zones reliées à cette option". Mise à jour automatique sans interaction.
- **Click sur compteur** : surligne les zones concernées dans le Player (overlay highlight) + scroll vers la zone dans la liste des zones de Step 3 (drill-down visuel). Réutilise le Player live déjà monté.
- **Suppression d'une valeur d'option utilisée** : modale de confirmation (conforme SPEC) — "Cette valeur est utilisée par N zones, qui deviendront toujours visibles si vous la supprimez. Continuer ?". Avertit sans bloquer.
- **Renommage d'une clé d'option** : auto-update transactionnel des `visible_if` correspondants dans la même transaction DB (BEGIN/COMMIT). Aucun risque de drift. Pattern repository : étendre `templateStudioRepository.renameOptionKey(oldKey, newKey, templateId)`.

### Périmètre du vocabulaire métier (UX-01)

- **Scope VOCABULARY_MAP étendu** : labels (14 actuels) + erreurs serveur traduites. Boutons et tooltips libres (mais alignés via revue PR).
  - À ajouter : `asset_alpha_required` → "Ce fond nécessite la transparence (canal alpha) — ré-exportez en yuva420p", `duplicate_requires_v2` → "Ce template ne peut pas être dupliqué (version 1 — migration requise)", `asset_in_use` → "Cet asset est utilisé par {N} template(s) publié(s) — désassignez-le d'abord", etc.
- **Smoke strictness** : hard fail sur **banlist** ciblée — `'layer'`, `'slot'`, `'pix_fmt'`, `'option_key'`, `'composition_id'` détectés comme valeurs string dans tout fichier `.ts`/`.html` du dashboard sous `studio-v3/`. Banlist gelée dans le smoke test = changement requiert update SPEC + smoke dans la même PR. Pas d'assertion positive (chaque label réellement utilisé) en v3.0 — trop fragile à maintenir.
- **Stockage** : Constants TypeScript séparés par catégorie dans `vocabulary.constants.ts` :
  - `VOCABULARY_MAP` (déjà existant, étendu) — labels métier
  - `ANIMATION_PRESET_LABELS` (déjà existant) — noms des animations
  - `ERROR_MESSAGES` (NOUVEAU) — `{ asset_alpha_required: '...', duplicate_requires_v2: '...', ... }`
- **Backend errors** : code only (snake_case `asset_alpha_required`), frontend traduit via `ERROR_MESSAGES[code]`. Backend reste agnostique de la langue. Frontend = source de vérité UX.

### Claude's Discretion

- Animation de la transition entre steps du wizard (slide/fade/instant) — non discuté, choisir le plus fluide sans distraire (probablement `transition: opacity 200ms`).
- Skeleton/loader du Player pendant le chargement initial des assets — pattern Angular standard, choix libre.
- Gestion du cas "Player monté mais aucun layer encore créé" (step 3 fraîche) — afficher un placeholder "Ajoutez un fond animé pour voir l'aperçu" avec lien vers step 2.
- Implémentation exacte de `proxyUrl()` par layer (existing pattern v2 vs nouveau helper) — choix d'architecture libre tant que la règle "URL FTP traversée à chaque niveau" est respectée.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### ADR & SPEC vivantes

- `docs/adr/ADR-110-template-studio-v3-task-oriented-admin-ux.md` — Décision architecturale Phase A/B/C
- `docs/adr/ADR-086-template-studio-n-layers-safe-zones-reversible-animations.md` — Moteur v2 N-layers (inchangé par design v3)
- `docs/adr/ADR-095-template-studio-admin-ux-v2.md` — Admin v2 (cohabitation "Mode avancé")
- `docs/adr/ADR-087-template-studio-v2-corb-proxy.md` — Pattern `proxyUrl()` per-layer (Pitfall P2 reference)
- `docs/specs/features/template-studio-v3.spec.md` — SPEC vivante v3 (workflows, mapping vocabulaire, CU canoniques)
- `docs/templates/mockups/template-studio-v3-mockup.html` — Maquette validée par Daisy 2026-05-05

### Project research

- `.planning/research/SUMMARY.md` — Synthèse stack/features/architecture/pitfalls
- `.planning/research/PITFALLS.md` — 10 pitfalls avec phase assignment (P2 + P3 = Phase 2)
- `.planning/research/STACK.md` — Patterns Angular 20, RemotionPreviewService existant
- `.planning/research/ARCHITECTURE.md` — Wizard shell + intégration Player

### Project rules

- `.claude/rules/templates.md` — Invariants Template Studio (NE JAMAIS FAIRE)
- `.claude/rules/testing.md` — Smoke-first, suites par domaine
- `CLAUDE.md` — TypeScript strict, repository pattern, Winston, worktrees

### Phase 1 outputs (contracts to consume)

- `.planning/phases/01-fondations/01-fondations-VERIFICATION.md` — Phase 1 verification status
- `central-dashboard/src/app/features/content/remotion-templates/studio-v3/vocabulary.constants.ts` — VOCABULARY_MAP, ANIMATION_PRESET_LABELS (à étendre avec ERROR_MESSAGES)
- `central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/studio-v3-wizard.component.ts` — Shell avec `signal()` + `[hidden]` (Player à monter ici)
- `central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard-state.types.ts` — WizardState shape (étendre si nécessaire)
- `central-dashboard/src/app/features/content/remotion-templates/remotion-preview.service.ts` — `sendPropsUpdate()` existant + setTimeout 150ms debounce
- `central-server/src/repositories/template-studio.repository.ts` — `duplicateDeep`, `countLayersSharingVideoUrl` (Phase 1)

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets (Phase 1 outputs)

- **`StudioV3WizardComponent`** : shell wizard avec `currentStep = signal<1|2|3|4>()`, `[hidden]` containers (P2 préempté). Phase 2 ajoute le panneau Player à droite, jamais re-monté.
- **`WizardState` interface** : étendre pour inclure `previewState` (props courantes envoyées au Player). Pattern parent-state via `signal()` + `effect()`.
- **`vocabulary.constants.ts`** : `VOCABULARY_MAP` (14 labels) + `ANIMATION_PRESET_LABELS` (4 presets). Phase 2 ajoute `ERROR_MESSAGES` pour les codes backend.
- **`AssetManagerModalComponent`** : modal/page dual-context. Phase 2 peut le rouvrir depuis l'éditeur de zones si l'admin veut switcher un asset à chaud.
- **3 smoke suites v3** existantes (vocabulary, duplicate, asset-manager). Phase 2 ajoute `smoke-template-studio-v3-preview.test.ts` (vérifie monture unique du Player) et étend `smoke-template-studio-v3-vocabulary.test.ts` avec banlist DB.

### Established Patterns

- **`signal()` + `[hidden]`** au lieu de `*ngIf` pour les containers d'étapes — pré-empte le leak GPU SharedImage du Player React-rooted.
- **Output `next` au lieu de `submit`** — bloqué par lint `@angular-eslint/no-output-native`.
- **`'Continuer →'` au lieu de `'Suivant →'`** — i18n hook pre-commit bloque certains verbes.
- **Form state lifted to parent `WizardState`** — jamais en local d'un step component (sinon perdu au `[hidden]`).
- **Repository pattern strict** — `templateStudioRepository`, 0 `query()` direct dans les controllers.
- **`getClient()` + BEGIN/COMMIT/ROLLBACK** pour les transactions multi-tables (pattern Phase 1).
- **Smoke-first** — tests RED écrits AVANT le code, GREEN après chaque tâche.
- **Pattern `RemotionPreviewService.sendPropsUpdate(props)`** — debounce setTimeout 150ms existant. À adapter à 300ms pour Phase 2 + intégrer le hook hybride keystroke/blur.

### Integration Points

- **`StudioV3WizardComponent` shell** — Phase 2 ajoute un sub-component `<wizard-preview-panel [state]="state()" />` à droite, hidden sur steps 1-2.
- **`RemotionPreviewService`** — point d'injection unique pour le Player. Phase 2 étend avec gestion `proxyUrl()` per-layer (P2).
- **Steps 3 et 4 components** — modifient leur form `valueChanges` pour pousser vers `RemotionPreviewService.sendPropsUpdate()` via debounce hybride.
- **Smoke test infrastructure** — file-based grep pattern (precedent `smoke-remotion.test.ts`). Pas d'HTTP/DB boot.

</code_context>

<specifics>

## Specific Ideas

- **"Aperçu en direct côte-à-côte"** comme dans la maquette HTML validée : panneau gauche = formulaire scrollable, panneau droite = Player + frise. Layout fixe 50/50 sur desktop, à confirmer responsive sur tablette (< 1024px).
- **"Apparition", "Glissement", "Zoom arrière", "Logo Pop"** : noms FR exacts utilisés dans `ANIMATION_PRESET_LABELS` (Phase 1). À conserver.
- **"PRÉNOM NOM", "NOM DU CLUB", logo placeholder Neopro, photo placeholder** : valeurs factices auto-affichées par le Player quand champs utilisateur vides. Non-modifiables par l'admin (anti-feature : "personnaliser les fixtures" hors scope v3.0).
- **"✓ N zones reliées à cette option"** : phrasing exact à utiliser dans l'inline feedback de Step 4 (français + emoji check pour visibilité immédiate).
- **Pattern de référence visuel** : Figma/After Effects pour les cards d'animation au hover, Webflow pour le wizard step navigation.

</specifics>

<deferred>

## Deferred Ideas

- **Personnalisation des fixtures par template** (ex : "PRÉNOM NOM" → "MARTIN DUPONT" pour les démos) — hors scope v3.0, pertinent v3.x si demandé pour démos commerciales.
- **Animations de transition fluides entre steps** (slide horizontal, fade) — Claude's Discretion, choisir le plus simple sans bloquer.
- **Multiplication des presets d'animation** (Pulsation, Rotation, Bounce) — hors scope, attendre signal CU réel.
- **Stack Entry + Exit + Emphasis** par zone — hors scope, complexité After Effects non justifiée.
- **i18n EN** des constants vocabulary — hors scope v3.0, basculer vers ngx-translate si besoin émerge.
- **Personnalisation du layout panneau gauche/droite** (resizable splitter) — hors scope, layout fixe 50/50 suffit pour v3.0.
- **Tests Playwright des comportements UX live** (drag fluidity, modal chrome) — hors scope smoke test, à intégrer en `e2e/` ultérieurement.

</deferred>

---

_Phase: 02-ux-interactive_
_Context gathered: 2026-05-05_
