# SPEC : Template Studio v2 (Remotion data-driven)

> **Owner** : Daisy
> **Statut** : Live (en parallèle du système Templates Studio V1 code-driven — voir ci-dessous)
> **Dernière revue** : 2026-04-25
> **last_verified** : 2026-05-10
> **verified_against_commit** : 1890d43

> ⚠️ **Coexistence avec Templates Studio (code-driven)** :
> Cette SPEC couvre **uniquement** le système data-driven legacy (rows DB + moteur générique unique). Un second système **Templates Studio code-driven** (1 `.tsx` + 1 `manifest.json` par template, in-process dans `central-server`) vit en parallèle pour les nouveaux templates. Le legacy data-driven est planifié pour mort (ses 3 templates actifs seront portés vers le code-driven).
> **ADR Templates Studio (code-driven)** :
>
> - [ADR-123](../../adr/ADR-123-templates-studio-v1-sharing-distribution.md) — Players globaux + grants multi-sites + distribution renders (réutilise pattern ADR-082)
> - [ADR-124](../../adr/ADR-124-templates-studio-consolidation-in-central.md) — Consolidation in-process dans central-server (déprécie ADR-118 + ADR-119)
> - Spec source : `studio-template/templates-remotion/spec/STUDIO_V1.md` (sibling repo, naming "V1" historique)
> - Recette E2E : [`docs/runbooks/STUDIO-RECIPE.md`](../../runbooks/STUDIO-RECIPE.md)
> - Guide portage template : [`docs/templates/STUDIO-PORTING-GUIDE.md`](../../templates/STUDIO-PORTING-GUIDE.md)

> **Code principal (legacy v2 data-driven)** :
>
> - `templates-remotion/src/runtime/TemplateRuntime.tsx` (moteur générique unique)
> - `central-server/src/scripts/import-template-spec.ts` (CLI `template:import` v1)
> - `central-dashboard/src/app/features/templates/admin-*` (UI admin Studio v2)
> - `central-server/src/repositories/template-studio.repository.ts` (DB layer)
> - Tables DB : `remotion_templates`, `template_layers`, `template_text_fields`, `template_image_slots`, `template_fonts`

> **ADR liés (legacy v2)** : ADR-075 (Template Studio évolutions V2/V3 — 9 sprints livrés), ADR-077 (CLI import), ADR-084 (data-driven), ADR-086 (n-layers + safe-zones), ADR-087 (asset proxy avec rate limit), ADR-095 (Admin UX v2 — drag/snap/undo)

> **Smoke tests** :
>
> - `central-server/src/__tests__/smoke/smoke-remotion.test.ts` (async render + versions)
> - Smoke tests sur règles `templates.md` (admin UX, CLI import, fonts, upload)

> **`.claude/rules/` lié** : `templates.md`

## En une phrase

Le Template Studio v2 permet aux super_admins (et clubs Premium en libre-service via ADR-075 V3) de créer/modifier/visualiser des templates vidéo Remotion **paramétriques data-driven** (vs templates hardcodés en .tsx) — un template = des rows DB + des assets FTP, jamais du code.

## Règles métier (ce qui DOIT marcher)

### Architecture data-driven (cœur ADR-075/084/086)

- **Tout template passe par le moteur générique unique** `templates-remotion/src/runtime/TemplateRuntime.tsx`. Si une capacité manque, on l'ajoute au moteur — **jamais** à un template spécifique en .tsx.
- **Un template = des rows DB + des assets FTP**. Pas de code par template. Si le designer livre un nouveau template, il livre une SPEC.md (frontmatter YAML) que le CLI `template:import` parse et insère.
- **Les layers sont la source de vérité de la durée** : `template_layers.duration_ms` détermine combien de temps un layer (et ses slots enfants) sont visibles. La colonne `template_text_fields.duration_ms` existe pour backward-compat mais le runtime l'ignore en v2.
- **Les animations sont paramétriques** : `preset` + `direction` + options (`scaleFrom`, `scaleTo`, `durationMs`). Pas d'animation hardcodée. `zoom-out` = `zoom + direction: 'out'`.
- **Safe-zones définies par l'admin** : positions/tailles des slots fixées. L'utilisateur final (club) ne peut pas déplacer les éléments — il subit la composition validée.
- **`template_text_fields.layer_id` est NOT NULL** depuis ADR-086. Un texte appartient toujours à un layer parent (source de vérité durée + alpha).

### Slots image

- **`anchor` + `fit_mode` toujours définis** sur les slots image (NOT NULL avec défauts). Permet le cadrage déterministe (ex: `fill-width-anchor-top` pour photos détourées).
- **Canal alpha WebM** : `respect_alpha` est appliqué côté runtime Remotion (client ou worker Chrome) uniquement, jamais côté serveur. Le serveur ne lit pas le binaire vidéo.

### Workflow designer (CLI `template:import`)

- **Le designer livre une SPEC.md** au format `docs/templates/SPEC-TEMPLATE.md`. Sans frontmatter YAML parsable, le CLI refuse l'import.
- **Le CLI passe par le repository** (`templateStudioRepository`), jamais `import('../config/database')`. Sondes `ensureSlugAvailable` + `ensureFontsExist` en lecture pure.
- **Pas d'upsert silencieux** : v1 refuse un slug existant pour éviter les écrasements accidentels.
- **WebM en URLs absolues** : pas de fichier local pendant l'import v1. Upload FTP = v2 (designer push manuellement les assets).

### Fonts

- **Aucune police hardcodée dans `FONT_FAMILIES`** côté dashboard. Toutes passent par la table `template_fonts` + endpoint `GET /api/remotion-templates/fonts`.
- **Validation Joi côté serveur** : refuse une référence à une police absente de `template_fonts`.

### Async render (ADR-054 + ADR-055)

- Le rendering Remotion est **asynchrone** : controller HTTP retourne 202 avec un `jobId`, le worker `remotion-render-worker.service` traite la queue.
- Au boot du worker, `failStaleRunningJobs(10)` libère les jobs claimed par un process mort (sinon stuck ad vitam).
- Le controller `remotion-templates.controller.ts` ne doit **JAMAIS** importer `@remotion/renderer` (sinon retombe en 502 Railway timeout — anti-pattern documenté).

### Admin UX v2 (ADR-095 — 9 contraintes smoke-testées)

- **Undo/Redo Ctrl+Z/Y** : `historyRecord` Output émis en fin de drag, alimentant les stacks `undoStack`/`redoStack` du panel parent.
- **Click-to-select slot** : `selectedSlot` + `selectSlot()` + `onCanvasBackgroundClick()` actifs.
- **Drag-to-position avec snap** : `applySnap()` + constante `SNAP_THRESHOLD = 0.015` (1.5% du canvas).
- **Resize text** : prop `startFontSize` dans `DragState` + fallback `d.startFontSize ?? tf.fontSize`.
- **Mode édition/preview switch** : `asp__mode` + `setMode` + `recomputePlayerState` + `proxyUrl()` (anti-CORB ADR-087).
- **Édition du libellé slot** : input éditable `<input class="afe__label" data-testid="admin-field-label-<slotKey>">` (vs `<strong>` non éditable).
- **Layers panel** : tri descendant par zIndex + boutons ↑/↓ pour swap.
- **Guard `*ngIf="hasMask(l)"`** : évite d'afficher `0/0/0/0` cryptique pour layers sans recadrage.
- **Sections FR francisées** : "Police / Taille (px) / Couleur / Alignement / Calque parent / Zone sûre & cadrage" pour utilisateurs non-tech.

### Quotas club self-service (ADR-075 V3 Phase D)

- **3 templates max par club** (Phase D PR #531) — quota soft, à reconsidérer si les clubs demandent plus.
- **10 renders/24h max** par club — anti-abus serveur Remotion.

## Comportements observables

| Règle                            | Comment on vérifie                                                                     |
| -------------------------------- | -------------------------------------------------------------------------------------- |
| Pas de .tsx par template         | `find templates-remotion/src -name "*.tsx" \| wc -l` reste à 1 (juste TemplateRuntime) |
| CLI refuse SPEC sans frontmatter | `npm run template:import bad-spec.md` → exit non-zero avec message clair               |
| Slot image avec anchor/fit_mode  | `SELECT * FROM template_image_slots WHERE anchor IS NULL` retourne 0 rows              |
| Async render OK                  | Controller retourne 202 + jobId, worker traite en background, statut visible via GET   |
| Undo/Redo Admin Studio           | Ctrl+Z après drag → position revient à l'état précédent (sans flash, sans reload)      |
| Drag snap-to-center              | Slot relâché à <1.5% du centre canvas → s'aligne sur centre exact                      |
| Quota club self-service          | 4e template créé par un club Premium → API retourne 403 quota exceeded                 |

## Cas d'edge connus

- **Template livré sans `SPEC.md`** : CLI refuse l'import, designer doit livrer la spec d'abord. Pas de bypass.
- **Police absente de `template_fonts`** : import refusé par Joi côté serveur. Designer doit uploader la font d'abord (upload via UI admin ou route `POST /api/remotion-templates/fonts`).
- **WebM avec slots texte sans canal alpha** : le masque ne fonctionne pas → l'admin doit fournir un WebM alpha pour ces slots.
- **Render qui crash mid-process** : worker process mort → job stuck `running`. Mitigé par `failStaleRunningJobs(10)` au boot. User peut retry après ~30s d'attente max.
- **Quota club atteint (3 templates)** : UI affiche message "limite atteinte, contactez votre admin Neopro pour upgrade". Pas de blocage hard côté serveur, juste 403 propre.
- **Migration ADR-086 sur instance avec données pré-existantes** : backfill safe (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...`) — défaults préservent le comportement antérieur (BUT Simple, BUT Img Joueur V2 toujours fonctionnels).
- **Bouton "duplicate" template** : crée un nouveau slug `{original_slug}-copy-N`. Pas d'écrasement.

## Contraintes / NE PAS FAIRE

Voir `.claude/rules/templates.md` pour la liste complète (smoke-testée). Règles **métier** spécifiques :

- Ne **jamais** créer un nouveau preset pour l'inverse d'un preset existant (`zoom-out` = `zoom + direction: 'out'`, pas `zoomout`).
- Ne **jamais** créer un .tsx par template (toute capacité manquante → ajouter au moteur générique).
- Ne **jamais** modifier la migration `add-template-studio-v2.sql` déjà en production. Toute évolution = nouvelle migration `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...`.
- Ne **jamais** casser le rendu des templates existants (BUT Simple, BUT Img Joueur V2). Chaque migration doit inclure un backfill safe.
- Ne **jamais** retirer une des 9 contraintes admin UX ADR-095 (chacune correspond à un smoke test enforced + un cas d'usage user concret).

## Ce qui n'est PAS dans le scope

- **L'utilisateur final (club non-Premium)** modifie librement les positions des slots. Non — c'est l'admin qui définit les safe-zones, l'utilisateur subit. Sauf en mode self-service Premium ADR-075 V3 où il peut customiser dans les limites du template.
- **Templates animés en pure CSS** (sans Remotion). Non — toute composition vidéo passe par Remotion + le moteur générique.
- **AI-generated templates** (Stable Diffusion, etc.). Pas dans le scope V2/V3. Pourrait être un évolution LATER.
- **Templates multi-scènes longues durées** (>5 min). Pas l'usage — les templates sont des spots de 5-30s.
- **Édition collaborative en temps réel** (style Figma multi-user) sur l'admin Studio. Pas l'usage — single-user édition suffit.

## Évolutions possibles (backlog léger)

- [ ] CLI `template:import` v2 : support upload WebM via FTP (au lieu d'URLs absolues)
- [ ] Quota club configurable par tier (3 pour Premium standard, 10 pour Premium+, etc.)
- [ ] Templates IA-assistés : générer 1 template à partir d'un brief texte (LATER possible)
- [ ] Marketplace templates : clubs vendent leurs templates customs (LATER possible — ouvre un modèle plateforme)
- [ ] Édition collaborative multi-user sur Admin Studio (low-prio, pas demandé)
- [ ] Templates animés sur action de jeu (lacune benchmark Bodet VIDEOSPORT — LATER #9)
- [ ] Sync social media intégré dans templates (lacune benchmark — LATER #11)
