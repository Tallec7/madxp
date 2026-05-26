# Audit — `site_sponsor_id` orphelins (2026-05-07)

> **Contexte** : investigation déclenchée par le bruit Slack `aggregation_stale critical` permanent + warnings Pi NLF "Skipping video sync for non-existent site_sponsor". Diagnostic révèle 2 bugs distincts (alerte cloud-side + dette de référence cross-fleet) et une **FK manquante** côté DB qui permet la récidive.

## TL;DR métier

- Quand un sponsor est supprimé côté cloud, ses références dans la config et les analytics restent **silencieusement orphelines**. Aucun garde-fou n'empêche cette dérive.
- Sur le terrain : NLF a perdu les analytics sponsor de 2 vidéos (Intro MadXP + Laugier) sur 5 jours = ~2 300 plays. Pas de vrai dommage utilisateur final, mais alertes Slack en boucle et reports sponsor sous-comptés.
- Sans correction structurante, n'importe quelle suppression de sponsor sur n'importe quel club rejouera le même film.

## Symptômes observés (logs Railway 2026-05-07 17:39 → 17:42)

1. `Aggregation CRON stale — data loss risk` (severity critical) sur `site_sponsor_daily_stats` — déclenchée toutes les 30s.
2. `Skipping video sync for non-existent site_sponsor` × 7 IDs distincts à chaque sync NLF.
3. `Orphan systemd service detected on Pi: neopro-hotspot-watchdog` — 4100+ restarts (point traité séparément).

## Diagnostic

### Bug #1 — Faux positif `aggregation_stale`

`alerting-checks.service.ts::checkAggregationStaleness()` comparait `MAX(calculated_at)` des tables `club_daily_stats` / `site_sponsor_daily_stats`. Or ces tables ne s'updatent que les jours d'activité. Conséquence : un club inactif >36h déclenche une alerte critique alors que le CRON tourne nickel et écrit 0 row légitimement.

→ **Corrigé** dans cette session, commit `d0754257`.

### Bug #2 — `site_sponsor_id` orphelins propagés cross-fleet

**Reconstitué** sans `audit_logs` (suppressions hors API ou pré-audit) :

1. NLF avait initialement des `site_sponsors` avec IDs `5b8ee4c8...` et `38c83771...`. Probable seed/copie depuis Demo SaaS — les mêmes IDs apparaissent sur les 3 sites NLF + Demo SaaS + GABIN dans `video_plays`.
2. Le **2026-02-22**, les sponsors NLF ont été re-créés "proprement" (ELSAN, COFAP, LIDL, J LAUGIER, APPART CITY...).
3. Les anciens sponsors ont été supprimés → CASCADE a tué `site_sponsor_videos` et `site_sponsor_daily_stats`.
4. **Mais** ni `config_profiles.configuration` ni `video_plays.site_sponsor_id` n'ont été migrés vers les nouveaux IDs.

**Cause racine côté DB** :

```
                                Table "public.video_plays"
       Column        |  ...
 site_sponsor_id     | uuid    ← AUCUNE FK
 sponsor_id          | uuid    ← FK ON DELETE SET NULL vers advertisers
 video_id            | uuid    ← FK ON DELETE SET NULL vers videos
```

Les 4 autres colonnes sponsor/campaign/session/video ont des FK avec `ON DELETE` policy. `site_sponsor_id` n'en a aucune. Toute suppression d'un `site_sponsors` laisse les `video_plays` en référence pendante.

### Bug #3 — Réconciliation Pi-side figée

`local_config_mirror.localSponsors[].centralId` est le mapping `localId Pi ↔ site_sponsor_id cloud`, calculé une fois par le sync-agent (timestamps observés : mars 2026). Quand le `centralId` cloud disparaît, le mapping Pi reste figé jusqu'à intervention manuelle. Le mirror est repushé à chaque `sync_local_state`, donc le bruit côté cloud est permanent.

## État de la flotte (snapshot 2026-05-07)

| Métrique                                                                     | Valeur                                    |
| ---------------------------------------------------------------------------- | ----------------------------------------- |
| Sites avec `site_sponsor_id` orphelins dans `config_profiles.timeCategories` | 2 (NLF, Demo SaaS)                        |
| Refs orphelines totales dans `config_profiles`                               | 12 (6 par site × 2 IDs × 3 phases)        |
| Plays orphelins dans `video_plays` (avant cleanup)                           | 2 306                                     |
| Plays orphelins dans `video_plays` (après cleanup)                           | 0 ✅                                      |
| Sites avec `localSponsors[]` dans mirror                                     | 2 (NLF: 14 entries, Bottière: 13 entries) |
| Watchdog systemd orphelin                                                    | NLF, 4100+ restarts                       |

## Actions accomplies

| #   | Action                                                                                                                                             | Statut               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| B   | `checkAggregationStaleness` ne lit plus `MAX(calculated_at)`. Source de vérité = `recurring_schedules.last_run_at`. Smoke regression guard ajouté. | ✅ commit `d0754257` |
| D1  | UPDATE 2 306 `video_plays` NLF — `site_sponsor_id = NULL` pour les 2 IDs morts (`5b8ee4c8`, `38c83771`). `category` conservée.                     | ✅ appliqué prod     |

## Plan d'attaque structurant

### Phase 1 — Cloud (1 PR, ~1 jour)

**Objectif** : empêcher toute nouvelle propagation d'orphelins + cleanup des sites existants.

- [ ] **FK + cascade** sur `video_plays.site_sponsor_id` → `ON DELETE SET NULL`
  - Migration `add-fk-video-plays-site-sponsor.sql`
  - Vérifier également `site_sponsor_daily_video_stats` et autres tables référençantes (déjà CASCADE, à confirmer)
- [ ] **Validation API** : tout patch sur `config_profiles.configuration` qui contient des `site_sponsor_id` doit valider leur existence en DB (Joi custom validator + service guard)
- [ ] **Migration de cleanup** automatique : scanner tous les `config_profiles.configuration.timeCategories[].loopVideos[].site_sponsor_id` non-existants → `null` + `analytics_category: 'other'`. Log la liste.
- [ ] **Cleanup ciblé NLF + Demo SaaS** : remap "Intro MadXP" et "Laugier" via la même migration ou via dashboard avant.
- [ ] **Smoke test** garde-fou enforced : interdire un `site_sponsor_id` orphelin dans n'importe quelle config_profile au boot.
- [ ] **ADR léger** : "FK strategy on `site_sponsors` references — `ON DELETE SET NULL` everywhere + API validation contract".

### Phase 2 — Pi (1 OTA)

**Objectif** : que la flotte se nettoie d'elle-même au prochain déploiement.

- [ ] **Sync-agent** : au boot et à chaque `sync_local_state`, vérifier que `localSponsors[].centralId` existe encore en cloud (via API ou champ enrichi dans `update_config`). Nullifier les zombies → trigger re-réconciliation.
- [ ] **Service Pi-side** `sponsor-reconciliation.service.js` (nouveau ou extension de `update-config.js`) avec smoke test enforced.
- [ ] **Métrique sync-agent** : `neopro_pi_orphan_local_sponsors_total` exposée via heartbeat → remontée Prometheus cloud.
- [ ] **Cleanup unitaire** au déploiement OTA : purge `localSponsors[].centralId` orphelins du mirror local Pi.
- [ ] **Documentation** : `.claude/rules/raspberry.md` ajout invariant "Réconciliation localSponsors[].centralId — never freeze".

### Phase 3 — Observabilité (cloud, peut être bundled avec Phase 1)

**Objectif** : ne plus avoir de drift silencieux.

- [ ] **Métrique Prometheus** `neopro_orphan_site_sponsor_refs_total{site_id, location}` (location = `config_profile`/`mirror`/`video_plays`)
- [ ] **Alerte** déclenchée si > 0 sur 24h (severity `warning`, pas `critical` — c'est de la dette, pas une panne)
- [ ] **Panel Grafana** dans le dashboard "NeoPro Blind Spots" → "Orphan site_sponsor references"
- [ ] **CRON quotidien** (ou check intégré aux alertes périodiques) qui re-scan automatiquement la flotte

### Hors-scope (point séparé, traçé en parallèle)

- **Watchdog hotspot orphelin sur Pi NLF** (4100 restarts) — cleanup manuel via remote_shell/SSH + audit pourquoi `install.sh:771-777` ne s'est pas exécuté lors du dernier déploiement. Pas dans ce plan car cause indépendante (legacy systemd ADR-072).

## Risques résiduels si plan non exécuté

- **Court terme** : au prochain match NLF, les 2 vidéos "Intro MadXP" + "Laugier" généreront 200-2 000 nouveaux plays orphelins (selon volume du match). Le UPDATE D1 sera à refaire.
- **Moyen terme** : toute suppression d'un sponsor sur un club existant peut reproduire le bug sans alerte. Le bruit Slack `Skipping video sync` masque les vrais signaux.
- **Long terme** : la dette analytics par sponsor devient invisible. Reports clients faussés.

## Métriques de succès du plan

- **Phase 1 mergée** : `SELECT COUNT(*) FROM video_plays vp WHERE vp.site_sponsor_id IS NOT NULL AND NOT EXISTS (...)` retourne 0 en permanence (FK enforced).
- **Phase 2 OTA déployée** : `SELECT COUNT(*) FROM sites WHERE local_config_mirror::text ~ 'centralId.*site_sponsor_orphan'` retourne 0 sous 24h.
- **Phase 3 monitoring** : panel Grafana "Orphan site_sponsor refs" reste à 0 pendant >7 jours.

## Références

- Commit B : `d0754257` (fix `checkAggregationStaleness`)
- Smoke test : `central-server/src/__tests__/smoke/smoke-deploy-ota.test.ts:950`
- Service patché : `central-server/src/services/alerting-checks.service.ts:437`
- Tables impactées : `video_plays`, `site_sponsors`, `config_profiles`, `sites.local_config_mirror`
