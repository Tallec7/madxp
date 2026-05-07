# Templates Remotion V2 — Invariants

Source de vérité : ADR-075, ADR-077, ADR-084, ADR-086, ADR-095.
Le Template Studio v2 est **data-driven** : tout template se décrit par des rows DB + assets, jamais par du code.

## NE JAMAIS FAIRE (smoke test enforced)

### Moteur / runtime

- **Créer un `.tsx` par template.** Tout passe par `templates-remotion/src/runtime/TemplateRuntime.tsx`. Si une capacité manque, l'ajouter au moteur générique — jamais à un template spécifique.
- **Laisser un `template_text_fields.layer_id` NULL.** La colonne est NOT NULL depuis ADR-086. Un texte appartient toujours à un layer (source de vérité pour la durée et l'alpha).
- **Utiliser `template_text_fields.duration_ms` comme durée effective.** La durée est héritée du layer parent (`template_layers.duration_ms`). Le runtime ignore la colonne autonome.
- **Créer un nouveau preset pour l'inverse d'un preset existant.** `zoom-out` = `zoom` + `direction: 'out'`. `fade-out` = `fade` + `direction: 'out'`. Pareil pour `slide-*` et `blur-in`.
- **Ajouter un slot image sans `anchor` + `fit_mode` explicites.** Les deux colonnes sont NOT NULL avec défauts ; surcharger à l'insertion quand nécessaire (`fill-width-anchor-top` pour photos détourées).
- **Lire un canal alpha WebM côté serveur.** Le `respect_alpha` est appliqué côté runtime Remotion uniquement (client ou worker Chrome).

### Workflow designer

- **Accepter un template livré sans `SPEC.md`.** Le gabarit `docs/templates/SPEC-TEMPLATE.md` est le contrat de livraison. Sans frontmatter YAML parsable, le script `template:import` refuse.
- **Uploader des assets WebM sans canal alpha** quand le layer contient des slots texte avec `respect_alpha: true`. Le masque ne fonctionnerait pas.
- **Livrer des time-codes absolus par slot.** Les slots héritent du layer parent. Un slot n'a pas de `appearAt` autonome (la colonne existe pour backward-compat, ignorée par la runtime v2).

### Fonts

> **État réel (vérifié 2026-05-05)** : la table `template_fonts` N'EXISTE PAS en DB. Les polices sont hardcodées dans `FONT_FAMILIES` à `admin-field-editor.component.ts:63`. La migration vers table DB est planifiée en ADR-110 Phase v3.2.

- **Ajouter une police dans `FONT_FAMILIES` sans tester le rendu Remotion.** Seules les polices disponibles dans `templates-remotion/public/fonts/` fonctionnent au render. Ajouter la police côté dashboard ET côté worker Remotion en même temps.
- **Supprimer une police de `FONT_FAMILIES` sans vérifier les templates existants** (`SELECT DISTINCT font_family FROM template_text_fields`). Une suppression casse silencieusement le rendu.
- ~~Hardcoder dans `FONT_FAMILIES` / passer par `template_fonts`~~ : la table n'existe pas encore — règle suspendue jusqu'à implémentation ADR-110 v3.2.

### API / upload

- **Exposer une route d'upload WebM sans guard `super_admin` + Joi.** La route `POST /api/remotion-templates/upload` est réservée (templates = asset partagé de la flotte).
- **Importer depuis les controllers `../config/database` directement.** Repository pattern obligatoire (`templateStudioRepository`).

### Runtime — URLs cassées (incident 2026-05-07, smoke test enforced)

- **Retirer la deny-list `BROKEN_URL_PATTERNS` ou la regex `up\.railway\.app/remotion-preview/public` de `template-runtime.tsx` (dashboard) ni de `TemplateRuntime.tsx` (worker render).** Cette deny-list rejette les URLs legacy de tests Remotion (assets `BUT_simple_*.webm`, `JOUEUR_but_*.webm`, `BUT_img_joueur_*.webm`) qui pointaient vers Railway preview au lieu du FTP Hostinger. 23 rows DB (template_layers + template_variants) ont fait planter le tab Chrome via cascade 404 → OffthreadVideo retry → unresponsive. 7 templates ont été archivés (status='archived') le 2026-05-07. Le guard reste en place pour bloquer un réimport legacy.
- **Retirer le `console.warn('[TemplateRuntime] rejected broken asset URL', ...)`** : c'est la seule observabilité côté navigateur quand un futur réimport tape le pattern. Sans le warn, le bug retombe en silence.

### Admin UX (ADR-095 — smoke test enforced)

- **Retirer `historyRecord` de `admin-canvas-overlay.component.ts`** (Output émis en fin de drag, alimente les stacks undo/redo du panel parent — sans lui les raccourcis Ctrl+Z sont muets).
- **Retirer `@HostListener('document:keydown')` ou les stacks `undoStack`/`redoStack` de `admin-studio-panel.component.ts`** (casse le contrat undo/redo ADR-095).
- **Faire un `reload` / emit `changed` depuis `applyHistoryPatch`** : l'undo réapplique le patch local + API ciblée, un reload complet ramènerait le flash (cf. commentaire anti-flash de `onPatchTextField`).
- **Retirer le tri descendant par zIndex dans `admin-layers-panel.sorted()`** (casse l'ordre visuel du panel et la sémantique des boutons ↑/↓).
- **Retirer `applySnap()` ou la constante `SNAP_THRESHOLD = 0.015`** de `admin-canvas-overlay.component.ts` (rend l'aimantation inerte — régression ADR-095 step 4).
- **Retirer `selectedSlot` / `selectSlot()` / `onCanvasBackgroundClick()`** (casse le click-to-select, régression step 3).
- **Retirer la prop `startFontSize` de `DragState` ou le fallback `d.startFontSize ?? tf.fontSize`** (la resize text devient non-annulable — régression step 2 + step 7).
- **Retirer le toggle mode édition/preview (`asp__mode` / `setMode` / `recomputePlayerState`)** ou omettre `proxyUrl()` dans `recomputePlayerState` (CORB ; cf. ADR-087).
- **Retourner à un `<strong>` non éditable pour le libellé dans `admin-field-editor.component.ts`** (input `.afe__label` avec `data-testid="admin-field-label-<slotKey>"` — sans quoi l'admin ne peut pas renommer un slot depuis le panel).
- **Supprimer le guard `*ngIf="hasMask(l)"` ou la méthode `hasMask()`** dans `admin-layers-panel.component.ts` (sans lui, le panel réaffiche `0/0/0/0` cryptique pour les layers sans recadrage — feedback UX post-PR #586).
- **Retirer les sections FR "Police / Taille (px) / Couleur / Alignement / Calque parent / Zone sûre & cadrage"** du field editor (ADR-095 polish : les libellés techniques `fontFamily`/`fontSize`/`Safe-zone & fit` ont été francisés pour les utilisateurs non-tech).

### CLI `template:import` (ADR-095 — smoke test enforced)

- **Supprimer ou renommer le script `central-server/src/scripts/import-template-spec.ts`** ni la ligne `"template:import"` de `central-server/package.json` (contrat CLI documenté dans `DESIGNER_WORKFLOW.md`).
- **Importer `../config/database` ou utiliser `fetch()` dans le script CLI** : passer exclusivement par `templateStudioRepository` (pattern repository). Seules les sondes `ensureSlugAvailable` / `ensureFontsExist` peuvent utiliser `query()` en lecture pure.
- **Retirer `ensureSlugAvailable()` ou `ensureFontsExist()`** : sans ces garde-fous le CLI crée des doublons silencieux ou laisse passer des références de fonts inconnues.
- **Ajouter un upsert implicite (`ON CONFLICT DO UPDATE`)** tant que v2 n'est pas écrit : v1 refuse volontairement un slug existant pour éviter les écrasements accidentels.
- **Lire les WebM en local dans le script** : les `file:` des layers doivent rester des URLs absolues en v1 (upload FTP = v2).

### Wizard v3 — boucle infinie effect (incident 2026-05-07 — smoke test enforced)

- **Réintroduire `previewState` dans le type `WizardState`** (`central-dashboard/.../studio-v3/wizard-state.types.ts`). Stocker le snapshot Player dans le même signal que les inputs lus par le recompute effect crée une boucle : `buildRuntimePlayerState` réalloue toujours un nouvel objet, donc le guard `next !== s.previewState` est toujours vrai → `state.update` → effect re-trigger → freeze tab Chrome (cause : sélection 1er fond animé dans le wizard `+ Ajouter un fond animé`).
- **Faire un `state.update(... previewState ...)` dans `studio-v3-wizard.component.ts`**. Le snapshot Player vit dans son propre signal `previewStateSignal: WritableSignal<RuntimePlayerState | null>` ; l'effect lit `state()` et écrit ailleurs, ce qui casse le feedback.
- Référence : smoke `smoke-template-studio-v3-preview.test.ts` cas F + F2.

### Sécu uploads / proxy (audit 2026-05-07 phase C — smoke test enforced)

- **Retirer `requestTimeout(300_000)` (ou `requestTimeout(UPLOAD_TIMEOUT_MS)`) sur les routes `POST /:id/assets`, `POST /:id/user-uploads`, `POST /library/upload`** dans `central-server/src/routes/remotion-templates.routes.ts` — sans ce timeout, multer accepte des uploads 200 Mo qui peuvent hanger indéfiniment et exhauster les slots HTTP Railway (audit P1 #8).
- **Retirer `verifyUrl(` ou `recordTemplateProxySignatureValidation` de `proxyTemplateAsset`** dans `central-server/src/controllers/remotion-templates.controller.ts` — sans le check HMAC + supervision Prometheus, la migration ADR-113-bis ne peut pas être suivie (audit P1 #7).
- **Retirer le fail-fast `TEMPLATE_PROXY_HMAC_SECRET` du service** `central-server/src/services/template-proxy-signing.service.ts` — sans ce throw au boot, un déploiement sans la variable d'env servirait des URLs proxy non vérifiées silencieusement.
- **Retirer `timingSafeEqual`** de `template-proxy-signing.service.ts` — la comparaison HMAC doit rester constant-time (anti timing-attack).
- **Supprimer `npm run rotate:ftp-creds`** dans `central-server/package.json` ou le script `central-server/src/scripts/rotate-ftp-creds.ts` — contrat outillage documenté dans ADR-113.
- **Retirer le Counter `neopro_template_proxy_signature_validation_total`** de `central-server/src/services/metrics.service.ts` — sans cette métrique, la migration HMAC est invisible et la PR cleanup (drop fallback `missing`) ne peut pas être planifiée.
- Référence : [ADR-113](../../docs/adr/ADR-113-ftp-creds-rotation-procedure.md), audit `docs/audits/templates-remotion-audit-2026-05-07.md`.

### Backward-compat

- **Modifier la migration `add-template-studio-v2.sql` déjà en production.** Toute évolution passe par une nouvelle migration `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...` (voir `add-template-studio-v2-layer-parent-safe-zone.sql` pour le pattern ADR-086).
- **Casser le rendu des templates existants** (BUT Simple, BUT Img Joueur V2). Chaque migration doit inclure un backfill safe et les défauts doivent préserver le comportement antérieur.

## Invariants positifs (à respecter)

- Le **layer est le conteneur de vérité** : durée, alpha, scope des slots enfants.
- L'**admin définit les safe-zones** une fois, le user les subit (ne peut pas déplacer).
- Les **animations sont paramétriques** : `preset` + `direction` + options (scaleFrom, scaleTo, durationMs).
- Tout nouveau template = **rows DB + assets FTP**. Rien d'autre.

## Référence

- [ADR-086](../../docs/adr/ADR-086-template-studio-n-layers-safe-zones-reversible-animations.md)
- [ADR-095](../../docs/adr/ADR-095-template-studio-admin-ux-v2.md)
- [Workflow designer](../../docs/templates/DESIGNER_WORKFLOW.md)
- [Gabarit SPEC](../../docs/templates/SPEC-TEMPLATE.md)
