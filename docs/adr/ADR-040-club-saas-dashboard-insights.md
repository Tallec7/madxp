# ADR-040: Portail club SaaS — insights et tendances sur le dashboard

**Date** : 2026-04-08
**Statut** : Accepté
**Format** : Léger

---

## Contexte

Le dashboard club SaaS (`club-dashboard.component.ts`) affichait 4 cartes KPI brutes (clients connectés, vidéos du jour, sessions, semaine) sans contexte ni tendance. Les clubs n'avaient aucun moyen de savoir :

- Si leur activité progresse ou régresse vs hier / semaine précédente.
- Quelles vidéos fonctionnent le mieux.
- Quel profil est actif et combien de vidéos/sponsors il contient.
- Quels sponsors sont réellement diffusés.
- Quoi faire quand aucune activité n'est enregistrée (page vide = impression de bug).

## Décision

Étendre l'API `getSiteDashboardData` avec un bloc `saasMetrics` enrichi et refondre la section SaaS du dashboard club :

1. **Fixes UX de base** :
   - Inversion de hiérarchie sur les cartes "Sessions" (vidéos primaires) et "Cette semaine" (taux de complétion primaire).
   - Empty state hint quand aucune activité (`connectedClients === 0 && todayVideosPlayed === 0`).
   - Quick action CTA `routerLink="/club/loop"`.

2. **Tendances (#1)** : comparaison vs hier / semaine précédente avec seuils (±3% numériques, ±2pts pour completion). Badges `↑ / → / ↓` sur les 3 cartes principales.

3. **Sparkline 7 jours (#2)** : SVG inline (polyline + area gradient) — pas de dépendance Chart.js. Série contiguë garantie via PG `generate_series` côté repo.

4. **Top 3 vidéos de la semaine (#3)** : requête sur `video_plays` groupée par filename, limit 3.

5. **Profil actif (#4)** : lecture du `configProfileRepository.findDefaultForSite()`, extraction JSONB `loopVideos.length` et `sponsors.length`.

6. **Sponsors actifs (#5)** : `siteSponsorRepository.findBySiteId()` filtré sur `video_count > 0`, limit 5, avec logos.

Toutes les queries additionnelles sont parallélisées via `Promise.all` pour garder la latence stable.

## Alternatives rejetées

- **Chart.js pour la sparkline** : rejeté — SVG inline est plus léger, pas de nouvelle dépendance, suffit pour une sparkline mono-série.
- **Matérialisation des tendances en DB** : rejeté — la comparaison hier/semaine dernière est calculée à la volée par `Promise.all`, coût négligeable vs complexité d'une table agrégée supplémentaire (`site_sponsor_daily_stats` existe déjà pour les sponsors).
- **Persistance DB des top vidéos** : rejeté — `video_plays` a une rétention 15j, largement suffisant pour une fenêtre 7j.

## Extension Pi (v3.137+)

Le bloc `saasMetrics` a été étendu à **tous les types de site** (Pi, SaaS, demo) :

- **Engagement Pi** : mêmes métriques (vidéos jouées, temps écran, tendances, sparkline, top vidéos, sponsors) — identiques au SaaS.
- **Dernière OTA** : `lastOtaDeployment` (version, statut, date) via `softwareUpdateRepository.findLastForSite()` — résout le target direct `site` OU indirect via `group` dans `site_groups`.
- **Alertes actives** : `activeAlertsCount` via `alertRepository.countActiveForSite()` — card conditionnelle (masquée si 0).
- **OTA badges** : inline sous la carte version — `completed` (vert), `failed`/`rolled_back` (rouge), `in_progress` (orange).
- **Empty state Pi** : condition différenciée (`todayVideosPlayed === 0 && weekVideosPlayed === 0`, pas de `connectedClients`).

`connectedClients` reste SaaS-only (0 pour les sites Pi).

## Conséquences

**Positives**

- Les clubs (SaaS et Pi) comprennent l'évolution de leur activité sans quitter le dashboard.
- L'empty state hint guide les nouveaux clubs vers leur première action (gérer la boucle).
- Aucun nouveau bundle JS (SVG inline), impact build ≈ +3 kB sur `club-dashboard-component`.
- Les clubs Pi voient le statut OTA et les alertes actives, réduisant les tickets support.

**Négatives**

- `getSiteDashboardData` passe de ~5 à ~14 queries parallèles — acceptable car toutes indexées sur `site_id`.
- Duplication légère de la logique de trend côté client (3 getters) — assumée, factorisée via `computeTrend()` privé.

## Références

- ADR-037 : SaaS mode architecture
- ADR-038 : Portail club SaaS — temps réel, preview, observabilité
- Fichiers : `central-server/src/repositories/analytics.repository.ts`, `central-server/src/repositories/alert.repository.ts`, `central-server/src/repositories/software-update.repository.ts`, `central-server/src/controllers/site-fleet.controller.ts`, `central-dashboard/src/app/features/club-portal/club-dashboard.component.ts`, `central-dashboard/src/assets/i18n/{fr,en,es}.json`
