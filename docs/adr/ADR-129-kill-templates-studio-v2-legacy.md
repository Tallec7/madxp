# ADR-129 : Suppression du système Templates Studio V2 data-driven legacy

**Date** : 2026-05-16
**Statut** : Accepté
**Décideurs** : Daisy
**Remplace** : —
**Remplacé par** : —

**Déprécie en bloc** : ADR-052, ADR-054, ADR-055, ADR-075, ADR-077, ADR-084, ADR-086, ADR-095, ADR-108, ADR-109, ADR-110, ADR-118

---

## Contexte

Le projet Neopro maintenait depuis avril 2026 **deux systèmes Templates Studio en parallèle** :

1. **V2 data-driven (legacy)** — ADR-075 / 077 / 084 / 086 / 095 / 110
   - Tables DB : `neopro_templates`, `template_variants`, `template_layers`,
     `template_text_fields`, `template_image_slots`, `template_options`,
     `template_packshot_refs`, `template_versions`, `neopro_template_versions`,
     `template_backgrounds`, `template_backgrounds_grants`, `remotion_render_jobs`
   - Runtime générique unique : `templates-remotion/src/runtime/TemplateRuntime.tsx`
   - Routes : `/api/remotion-templates/*`, `/api/club/remotion-templates/*`,
     `/api/templates/backgrounds/*`
   - Dashboard : `central-dashboard/src/app/features/content/remotion-templates/`
     (studio-v2 + studio-v3 wizard + asset manager + joueur-tools)
   - Pipeline : SPEC.md YAML → CLI `template:import` → rows DB → render via
     worker async (`remotion-render-worker.service.ts`)

2. **V1 code-driven (nouveau)** — ADR-123 / 124 / 125 / 127 / 128
   - 1 `.tsx` + 1 `manifest.json` par template dans `central-server/templates-studio/`
   - Worker in-process : `studio-render-worker.service.ts`
   - Asset library DB : `studio_assets`, `studio_template_asset_bindings`,
     `studio_player_site_grants`, `template_definitions`
   - Routes : `/api/templates-studio/*` (pluriel)
   - Dashboard : `central-dashboard/src/app/features/templates-studio/` (pluriel)

**Note nommage** : "V1" et "V2" sont inversés historiquement. V2 (legacy) est
arrivé en premier, V1 (code-driven) plus tard mais désigné comme refonte
"v1 propre". À retenir : V2 = data-driven = legacy ; V1 = code-driven = futur.

### Constat 2026-05-16 (audit pré-kill)

- **Aucun usage actif** de V2 en production :
  - `neopro_templates` : 11 rows dont 9 archived + 2 zombies (draft/published flags incohérents)
  - `remotion_render_jobs` : 1 seule entrée historique du 2026-05-07 (failed)
  - Plus aucun appel HTTP sur `/api/remotion-templates/*` détecté en monitoring
  - Aucun client Pi/SaaS ne consomme les routes V2
- **V1 a rattrapé toutes les capacités V2** :
  - Asset library globale (ADR-125)
  - Polices custom (ADR-127)
  - Séquences PNG frames pour masques alpha (ADR-128)
  - Distribution multi-sites avec grants (ADR-123)
  - 3 templates actifs en prod (`but_generique`, `entree_joueur`, `faits_de_jeu`)

### Coûts du maintien parallèle

- Surface de code : ~3 000 fichiers, ~20 000 lignes (incl. `templates-remotion/`
  package Remotion + dashboard V2 + backend V2 + smoke tests V2)
- Confusion mentale permanente (V1/V2 inversés, naming `template-studio` vs
  `templates-studio` au singulier/pluriel, ADRs croisées)
- Surface de bugs (incident 2026-05-07 URLs cassées Railway → 2 cycles correctifs
  successifs, cf. `.claude/rules/templates.md` § "Runtime — URLs cassées")
- Coût Railway (build Docker multi-stage Vite preview app + Remotion deps)
- Dette technique sur le snapshot `full-schema.sql` (4000 lignes pg_dump)

## Décision

**Drop intégral du système V2 en 4 PRs séquentielles** :

1. **PR 1 — Backend** ([apps#1029](https://github.com/Tallec7/neopro/pull/1029), mergée)
   Suppression des routes/controllers/repositories/services/types/scripts V2 dans
   `central-server/`, drop des 4 mounts API, retrait du middleware multer V2
   (`uploadTemplate`/`uploadTemplateAsset`/`uploadUserTemplateImage`/`uploadPngBuffer`),
   retrait des 10 schémas Joi V2, retrait des 4 compteurs Prometheus V2
   (`templateAssetProxyUpstream`, `templateProxySignatureValidation`,
   `templateStudioOperations`, `templateDeleted`), retrait du `checkStuckRenderJobs`
   d'`alerting-checks.service.ts`. 89 fichiers, -17 763 lignes.

2. **PR 2 — Dashboard frontend** ([apps#1030](https://github.com/Tallec7/neopro/pull/1030))
   Drop du folder `central-dashboard/src/app/features/content/remotion-templates/`
   (63 fichiers), retrait des 6 routes V2 d'`app.routes.ts`, retrait du lien
   sidebar dans `layout.component.ts`. 65 fichiers, -15 167 lignes.

3. **PR 3 — Package + DB** ([apps#1031](https://github.com/Tallec7/neopro/pull/1031))
   Drop du package `templates-remotion/` (runtime + preview Vite + assets WebM +
   PNG masks), retrait des 3 stages Dockerfile V2 (`remotion-deps`, `preview-builder`,
   COPY runtime), retrait du watchPattern dans `railway.staging.json`, **migration
   SQL `drop-template-studio-v2-tables.sql`** qui DROP CASCADE les 12 tables V2 +
   2 trigger functions orphelines. 625 fichiers.

4. **PR 4 — Docs + ADRs + rules** (cette PR)
   Cet ADR-129 récapitulatif, archive des 12 ADRs V2 dans `docs/adr/_archive/`,
   suppression des SPECs V2 (`templates-studio.spec.md`, `template-studio-v3.spec.md`),
   suppression des docs designer V2 (`SPEC-TEMPLATE.md`, `DESIGNER_WORKFLOW.md`,
   `JOUEUR-*.md`, `HOWTO-CONFIGURE-OPTIONS.md`), suppression des propositions
   V2 (`PROP-004`, `PROP-014`), archive de `.claude/rules/templates.md`, mise à
   jour du routing dans `CLAUDE.md` et `docs/specs/README.md`.

## Alternatives considérées

### 1. Garder les deux systèmes en parallèle

**Avantages** : zéro risque, pas de migration de données (V2 a quand même
quelques rows zombies non critiques).
**Inconvénients** : double dette, double surface bugs, confusion designers
("quel système j'utilise pour mon prochain template ?").
**Verdict** : Rejeté — coût de maintien > 0 et croît à chaque PR sur le domaine.

### 2. Migrer les 11 templates V2 vers V1 avant de drop

**Avantages** : pas de perte de données (théorique).
**Inconvénients** : 9 sur 11 sont archived (jamais utilisés), les 2 autres
sont des zombies (draft + published flag incohérents, jamais render réussi).
Effort de portage 100% gâché. Aucun designer ne réclame ces templates.
**Verdict** : Rejeté — audit montre que les rows sont du bruit historique.

### 3. Soft-delete via rename `_deprecated_*` au lieu de DROP TABLE

**Avantages** : rollback possible sans backup.
**Inconvénients** : laisse de la pollution dans le schéma, complique le
snapshot `full-schema.sql`, force à reverifier la nullité du flux V2 dans 6 mois.
Backup Railway quotidien suffit comme filet.
**Verdict** : Rejeté — DROP CASCADE + IF EXISTS atomique dans une transaction,
Railway garde les snapshots quotidiens si rollback critique.

### 4. Drop direct sans ADR récapitulatif (choisi) ✅

**Avantages** : pas de doc spéculative, ADR documenté après coup avec le vrai
résultat des PRs, traçabilité explicite des décisions parentes dépréciées.
**Inconvénients** : aucun.
**Verdict** : Accepté — ADR-129 sert de point d'entrée unique pour comprendre
"pourquoi V2 a disparu en mai 2026".

## Conséquences

### Positives

1. **-3 000 fichiers et ~38 000 lignes** sur l'ensemble du repo (backend +
   frontend + package + docs).
2. **Build Docker plus rapide** : retrait des stages `remotion-deps` et
   `preview-builder` (~60-90s économisées par déploiement Railway).
3. **Pas de cohabitation conceptuelle** : une seule réponse à "comment créer
   un template" → ouvrir un `.tsx` dans `central-server/templates-studio/`.
4. **Schéma DB plus lisible** : -12 tables, -2 functions, -27 indexes/contraintes.
5. **Surface attaque réduite** : 4 mounts API + 17 routes drop (incl. proxy
   FTP `/asset-proxy` qui était une cible de signature HMAC ADR-113-bis).

### Négatives

1. **Designers ne peuvent plus créer un template via SPEC.md YAML** (workflow
   ADR-075/077) → seul le pattern code-driven V1 est disponible. C'est par
   construction la **direction stratégique** (cf. ADR-124), pas une régression.
2. **Snapshot `full-schema.sql` stale** sur les DDL V2 jusqu'à régénération
   `pg_dump -s` (à faire après merge de PR 3). Bootstrap dev fonctionne quand
   même : crée les tables puis la migration les drop, net = clean.

### Risques

| Risque                                                                     | Mitigation                                                                                                                                                                                    |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Un consommateur externe non identifié appelait `/api/remotion-templates/*` | Audit monitoring 7 derniers jours : 0 hit. Sentinel : si 4xx remontent côté ops, restaurer via revert PR.                                                                                     |
| Templates V2 archivés contenaient des assets vidéo utiles                  | 23 assets référencés via `template_layers.video_url` étaient déjà cassés (URLs Railway preview supprimées, cf. incident 2026-05-07). Les 11 archivés ne pointent que sur des assets disparus. |
| Bootstrap dev/staging crée puis drop V2 (waste 2s)                         | Acceptable. À nettoyer dans une PR follow-up `regenerate full-schema.sql`.                                                                                                                    |

## Plan d'implémentation

**Phase 1** (PR 1, mergée 2026-05-16) — Backend kill

- Drop routes/controllers/repositories/services/types/scripts V2 dans `central-server/`
- Update `repositories/index.ts` (barrel), `content.routes.ts`, `content.controller.ts`
- Update `middleware/upload.ts` + `middleware/validation.ts`
- Update `metrics.service.ts` (drop 4 counters)
- Update `alerting.service.ts` + `alerting-checks.service.ts` (drop `checkStuckRenderJobs`)
- Drop 17 smoke tests V2 + 6 unit tests + 1 E2E
- Clean `package.json` (drop 5 npm scripts)

**Phase 2** (PR 2) — Dashboard frontend kill

- Drop folder `content/remotion-templates/` (63 fichiers)
- Update `app.routes.ts` (6 routes)
- Update `layout.component.ts` (1 nav link)

**Phase 3** (PR 3) — Package + DB

- Drop folder `templates-remotion/`
- Update `Dockerfile` (3 stages, ENV, COPY)
- Update `railway.staging.json` (watchPattern)
- Migration SQL DROP CASCADE 12 tables + 2 functions

**Phase 4** (PR 4, cette PR) — Docs cleanup

- Cet ADR-129
- Archive 12 ADRs V2 dans `docs/adr/_archive/` + update `docs/adr/README.md`
- Drop SPECs V2, docs designer V2, propositions V2
- Archive `.claude/rules/templates.md`
- Update `CLAUDE.md`, `docs/specs/README.md`

**Critères de validation** :

- ✅ Smoke tests V1 : 68 suites / 2239 tests passants après chaque PR
- ✅ Build Docker production OK (toutes les stages V1 préservées)
- ✅ Build Angular production OK
- ✅ TypeScript check `tsc --noEmit` : 0 errors
- ✅ Migration appliquée idempotente via `schema_migrations`
- Monitoring 24h après merge PR 1 : 0 hit 404 sur `/api/remotion-templates/*`

## Références

- PRs : [apps#1029](https://github.com/Tallec7/neopro/pull/1029),
  [apps#1030](https://github.com/Tallec7/neopro/pull/1030),
  [apps#1031](https://github.com/Tallec7/neopro/pull/1031)
- ADRs V1 conservés : [ADR-123](ADR-123-templates-studio-v1-sharing-distribution.md),
  [ADR-124](ADR-124-templates-studio-consolidation-in-central.md),
  [ADR-125](ADR-125-templates-studio-asset-library.md),
  [ADR-127](ADR-127-templates-studio-custom-fonts.md),
  [ADR-128](ADR-128-templates-studio-asset-directory.md)
- ADRs V2 archivés (dans `_archive/`) : 052, 054, 055, 075, 077, 084, 086, 095,
  108, 109, 110, 118
- ADR-113 (FTP creds rotation) : **conservé** car procédure partagée avec V1
  (FTP Hostinger commun) malgré références V2 (HMAC proxy URL) maintenant moot
- Recette V1 : `docs/runbooks/STUDIO-RECIPE.md`
- Guide portage : `docs/templates/STUDIO-PORTING-GUIDE.md`
