# MadXP — Vérité du code, partie 2 (couche commerciale & flotte)

> **Statut** : v0.1 — audit code-verified de 5 domaines transverses (analytics, abonnements/feature-flags, RBAC, OTA/supervision, stockage/livraison).
> **Légende** : ✅ confirmé code · 🔴 correction CDC · 🟢 actif réutilisable · ⚠️ limite/gap.
> Suite de [MADXP-code-verified-findings.md](MADXP-code-verified-findings.md).

---

## 0. Synthèse — ce que ça change pour la séance

1. 🟢 **Le mécanisme de monétisation existe déjà** (paliers + `feature_overrides` + export billing). La régie/audience/multi-écran retail = des **features gatées**, pas à réinventer. → enrichit CDC §9.
2. ✅ **Mon design analytics « 2 métriques, 1 rapport » est validé par le code** : `video_plays` mesure des **diffusions**, pas des humains. Le retail = **table d'audience séparée** + `audience_type`. → SPEC-RETAIL-AUDIENCE débloquée côté _structure_ (pas côté chiffres).
3. 🔴 **Correction CDC §6** : « operator limité à ses sites assignés ✅ » est **FAUX**. Le code ne scope PAS les operators — ils voient **tous** les sites (pas de table d'assignation).
4. ⚠️ **Chantiers retail réels** chiffrés : hiérarchie enseigne→magasin→zone (~3-5j RBAC), supervision SaaS/retail (absente), CDN pour volume retail (absent).
5. 🔴 **Drift rebrand** : les métriques sont désormais préfixées **`madxp_`** (pas `neopro_`). Mes specs sport citaient `neopro_*` — à lire comme `madxp_*`.

---

## 1. Analytics & reporting — ✅ design « 2 métriques » validé

**Réalité code** :

- Tables : `video_plays` (rétention **15j**), `club_sessions`, agrégats `club_daily_stats` + `site_sponsor_daily_stats` (CRON **J-1** via fonctions PG `calculate_all_daily_stats`). Reports : `generated_reports` (PDF club/advertiser/site_sponsor) + sponsor portal magic-link.
- Chemin : Pi/SaaS buffer offline **50k events FIFO** → `POST /api/analytics/video-plays` (batch 100) → dedup **`(site_id, played_at, video_filename)` UNIQUE** → agrégation J-1.
- **La mesure = diffusions** (`COUNT(video_plays)`), **pas des humains**. `audience_estimate` (fourni par le Pi) et dwell implicite (`duration_played/video_duration`). `analytics.repository.ts:559-593`, `aggregation.task.ts:23-86`.

**Pour le retail (recommandation explorateur, cohérente avec mon CDC §I.4-3)** :

- Table séparée `retail_audience_signals` (capteurs/beacon : `estimated_viewers`, `dwell`, `zone`) + agrégat `retail_impressions` (viewers distincts).
- Endpoint distinct `POST /api/analytics/audience-signals` (même rate-limit/auth).
- Colonne `audience_type ('sport'|'retail')` dans les agrégats ; **VIEWs unifiées** pour un rapport sponsor cross-vertical. CRON **paramétré** par `aggregate_type` (pas 3 fonctions hardcodées).
- 🔴 **Ne PAS** polluer `video_plays.category` avec des valeurs retail (sport-only : completion_rate, trigger_type).

⚠️ **Anti-pattern observabilité** : `checkAggregationStaleness()` lit `MAX(calculated_at)` (proxy fragile) au lieu de `recurring_schedules.last_run_at`. Connu (faux positif quand la table est légitimement vide). À corriger dans le noyau commun.

## 2. Abonnements & feature-flags — 🟢 mécanisme de packaging déjà là

**Réalité code** :

- `sites.subscription_plan` (legacy `trial/standard/premium` + additif `play/club/pro`), `subscription_start/end`, `suspended`, **`feature_overrides` JSONB** (par-site, super_admin). `extend-subscription-plan-tiers.sql:54-63`.
- Gating : `require-site-tier.ts:17-127` — **override d'abord, palier ensuite**. Catalogue frontend `feature-gate.service.ts:38-75` (ex : `weighted_rotation`→PRO, `secondary_display`→PREMIUM, `sponsor_portal`→PRO, `white_label`→PREMIUM).
- Exposé au Pi (`feature-flags.controller.ts:17-45`) et au SaaS (`saas.controller.ts:388-402`).
- **Granularité = par SITE** (pas tenant, pas vertical). **Billing = hors-app** : `billing.service.ts:32-124` exporte l'usage mensuel ; **pas de Stripe**, changements de palier manuels.

**Convergence** 🟢 : la régie média, l'audience retail, le multi-écran deviennent des **entrées du catalogue `FEATURE_TIERS`** + paliers retail éventuels. Mécanisme réutilisable tel quel. **À généraliser** : granularité par-vertical si une offre diffère sport↔retail ; valider `feature_overrides` côté dashboard (UI super_admin).
→ **Impact CDC §9** : la « monétisation » n'est pas un greenfield — le moteur d'entitlement existe. La régie ajoute le **versant vente d'inventaire**, pas le versant packaging.

## 3. Multi-tenant & RBAC — 🔴 correction + chantier retail

**Réalité code** :

- Rôles : `auth.ts:69-79` ROLE_HIERARCHY (cosmétique). **super_admin bypass total** (`auth.ts:108`), **club bypass sur son propre site** (`auth.ts:113-117`).
- Scoping : `users.advertiser_id | agency_id | site_id` (**FK singleton**). Pivots `agency_sites`, `advertiser_sites` (many-to-many). Middlewares `requireSponsorAccess/AgencyAccess/ClubScope`.
- 🔴 **`operator` NON scopé** : aucune table d'assignation operator↔sites ; **les operators voient tous les sites**. (Mon CDC §6 disait l'inverse.)
- `club_permissions` (table définie) **jamais utilisée** — guard club hardcodé (`category='NEOPRO'` + `uploaded_for_site_id`). Dette.
- **Pas de hiérarchie** : pas de `parent_site_id`, pas d'org imbriquée.

**Convergence retail (enseigne→magasin→zone + rôle régie)** ⚠️ chantier réel :

- `users.site_id` singleton **bloque** 1 user→N magasins → table `user_site_assignments`.
- Ajouter `sites.parent_site_id` (self-FK) + filtrage récursif `WHERE site_id IN (descendants)`.
- Nouveau rôle `regie`/`media_manager` + `requireRegieAccess()`.
- Effort estimé ~3-5j + migration sur users existants. Le pattern pivot (`agency_sites`) est le bon patron à étendre.

## 4. OTA, canary & supervision flotte — 🟢 framework / ⚠️ asymétrie SaaS

**Réalité code** :

- OTA logiciel (`update-deployment.service.ts:45-195`) **distinct** du canary **vidéo** (`canary-deployment.service.ts`, rollout 10→25→50→75→100%, auto-rollback <95%). Deux chemins parallèles.
- Alerting dédup ADR-111 confirmé (`alert.repository.ts:67-102`, upsert `(site_id, alert_type, status='active')`). Métriques **`madxp_*`** (`metrics.service.ts`), endpoint `/metrics`.
- ⚠️ **Supervision SaaS minimale** : pas de heartbeat, **pas de détection « site SaaS offline »** (seulement check profil vide). Le Pi a heartbeat 30s + offline detection.
- 🟢 Strategy registry (ADR-069) extensible : nouveau canal retail = 1 classe + 1 ligne.

**Convergence** : framework alerting/metrics/strategies réutilisable (~70%). Couplages Pi durs : heartbeat freshness, `commandQueue` socket, OTA/canary non unifiés. **Pour le retail** : il faudra une **supervision substrat-agnostique** (un player magasin « down » doit alerter — aujourd'hui le SaaS ne le fait pas) et probablement une **orchestration OTA/canary unifiée**.

## 5. Stockage & livraison média — 🟢 propre / ⚠️ volume retail

**Réalité code** :

- `storage.service.ts` → `ftp-storage.ts`. Chemins shardés ADR-048 `videos/{prefix}/{uuid}.ext`. Proxy signé JWT ADR-068 (`video-token.service.ts`, `VIDEO_STREAM_PROXY_ENABLED`). Dédup `DISTINCT ON (video_id)` (`deployment.repository.ts:389-403`). **Zéro couplage sport**.
- `generateUniqueFilename()` suffixe `_N` (drift connu cloud↔Pi, issue #920).
- Pi : télécharge FTP → disque local, joue local. SaaS : URLs résolues servies (fuzzy match Unicode ADR-083).

**Convergence retail (volume)** ⚠️ :

- **Pas de CDN** ; FTP Hostinger **single account ~10 conn** → goulot à fort volume/multi-région. Hook CDN trivial dans `getVideoUrl` (`storage.service.ts:147-150`) : `CDN_ENABLED` + origin Hostinger.
- Passer à un **nommage UUID** (retire le collision-check linéaire), paralléliser `deployViaRegistry()`, indexer la résolution fuzzy. Effort ~2-3 sprints pour un retail à fort volume d'assets.

---

## 6. Récap — nouveaux actifs & chantiers pour le noyau

| Élément                                                | Verdict                                           | Réf                                               |
| ------------------------------------------------------ | ------------------------------------------------- | ------------------------------------------------- |
| Paliers + `feature_overrides` + billing export         | 🟢 moteur d'entitlement réutilisable              | `require-site-tier.ts`, `feature-gate.service.ts` |
| Pipeline analytics + reporting PDF + magic-link        | 🟢 réutilisable ; audience retail = table séparée | `analytics.repository.ts`, `aggregation.task.ts`  |
| Alerting dédup + metrics `madxp_*` + strategy registry | 🟢 framework flotte                               | `alert.repository.ts`, `metrics.service.ts`       |
| Stockage FTP shardé + proxy signé                      | 🟢 propre, zéro couplage sport                    | `storage.service.ts`                              |
| RBAC operator non scopé                                | 🔴 drift à corriger CDC §6                        | `auth.ts`                                         |
| Hiérarchie tenant (enseigne→magasin→zone) + rôle régie | ⚠️ chantier ~3-5j                                 | `users` singleton, pas de `parent_site_id`        |
| Supervision SaaS/retail offline                        | ⚠️ absente, à concevoir                           | `alerting-checks.service.ts`                      |
| CDN / volume retail                                    | ⚠️ absent, hook trivial                           | `getVideoUrl`                                     |

**Fil conducteur (cohérent avec partie 1)** : le **backend MadXP est très réutilisable** pour le retail (entitlement, analytics, stockage, strategies, alerting). Les vrais chantiers communs sont **transverses, pas sport-spécifiques** : (a) push-back substrat→cloud (partie 1), (b) hiérarchie tenant multi-niveaux, (c) supervision substrat-agnostique, (d) audience humaine + CDN pour le volume retail.
