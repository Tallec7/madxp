# Analytics Feature - Status: ACTIVE

## Architecture

Les pages analytics sont organisées en deux niveaux :

- **Fleet** : Vue d'ensemble business de tous les sites (admin/operator)
- **Club** : Analytics détaillées d'un site spécifique avec données sponsors

### Philosophie : Business-First

Les pages analytics priorisent les métriques business (engagement, impressions sponsors, tendances)
devant les métriques techniques (CPU, RAM, température). La santé système reste accessible
mais en section secondaire (accordéon replié par défaut).

## Composants

| Fichier                             | Route                   | Description                                           | Roles                        |
| ----------------------------------- | ----------------------- | ----------------------------------------------------- | ---------------------------- |
| `analytics.component.ts`            | `/analytics`            | Vue fleet business-first (KPIs, engagement, sponsors) | super_admin, admin, operator |
| `analytics-traction.component.ts`   | `/analytics/traction`   | KPIs traction & croissance (pitch deck)               | super_admin, admin           |
| `analytics-comparison.component.ts` | `/analytics/comparison` | Comparaison multi-sites (Chart.js)                    | super_admin, admin           |
| `realtime-dashboard.component.ts`   | `/analytics/realtime`   | Tableau de bord temps reel (polling 10s)              | super_admin, admin           |
| `club-analytics.component.ts`       | `/sites/:id/analytics`  | Analytics club (engagement, sponsors, sante)          | super_admin, admin, operator |
| `analytics-nav.component.ts`        | -                       | Navigation par onglets entre sous-pages               | -                            |

## Fleet Overview (`/analytics`)

Page principale, orientée pilotage business.

### KPIs (4 cards)

- **Videos diffusees** : total lectures + plays aujourd'hui (source : `/analytics/traction`)
- **Temps d'ecran** : heures cumulées + taux completion (source : `/analytics/traction`)
- **Impressions sponsors** : total + nombre d'annonceurs actifs (source : `/analytics/traction`)
- **Flotte en ligne** : % online + ratio sites (source : `/sites/connection-status`)

### Sections

- **Chart.js engagement mensuel** : lectures + sites actifs (dual axis, données `/analytics/traction`)
- **Top clubs actifs** : classement par plays aujourd'hui (source : `/analytics/overview`)
- **Clubs a relancer** : 0 play ou offline, tries par urgence (source : `/analytics/overview`)
- **Resume sponsors** : annonceurs actifs, videos diffusées, clubs touchés, completion
- **Sante flotte** : accordéon replié, pills online/warning/offline + barres CPU/RAM/Temp

### APIs consommées

- `GET /sites/connection-status` (cache 30s)
- `GET /sites/fleet-metrics` (cache 30s)
- `GET /api/analytics/overview` (admin/operator)
- `GET /api/analytics/traction` (admin)

## Club Analytics (`/sites/:id/analytics`)

Page unique scrollable (pas de tabs), orientée engagement + sponsors.

### KPIs (4 cards)

- **Videos diffusees** : total + tendance vs période précédente (%)
- **Temps d'ecran** : durée formatée + videos uniques
- **Sponsors actifs** : nombre + total impressions (source : `/sites/:id/sponsors/benchmark`)
- **Disponibilite 24h** : % + statut online/offline

### Sections

- **Chart.js engagement quotidien** : bar chart des lectures/jour
- **Top contenus** : classement videos + répartition par catégorie (barres colorées)
- **Sponsors ce club** : benchmark par sponsor (impressions, completion rate, CPI)
- **Sante systeme** : accordéon replié (CPU/RAM/Temp/Disk + alertes récentes)

### APIs consommées

- `GET /api/sites/:id` (détails site)
- `GET /api/analytics/clubs/:siteId/health`
- `GET /api/analytics/clubs/:siteId/usage?days=N`
- `GET /api/analytics/clubs/:siteId/content?days=N`
- `GET /api/analytics/clubs/:siteId/availability?days=N`
- `GET /api/analytics/clubs/:siteId/alerts?days=N`
- `GET /api/sites/:siteId/sponsors/benchmark?from=X&to=Y`

### Calcul de tendance

La tendance (%) est calculée côté frontend :

1. Appel `getClubUsage(siteId, days)` → plays période courante
2. Appel `getClubUsage(siteId, days * 2)` → plays période étendue
3. `previousPlays = extendedPlays - currentPlays`
4. `trend = ((currentPlays - previousPlays) / previousPlays) * 100`

## Limites connues

- **Temps de diffusion** = somme (durée vidéo × lectures), pas le temps écran réel
- **Taux de completion** = bug connu, affiche souvent 100%
- **Disponibilite** = mesure connexion cloud, pas usage TV physique
- **Audience** = champ `audience_estimate` en DB mais pas encore affiché (prévu E-18/E-19)
- **event_type / period** = champs en DB (`video_plays`) mais pas encore exploités dans les charts

## Dépendances

- `chart.js ^4.5.1` : graphiques engagement (line + bar)
- `@angular/common`, `@angular/router` : navigation
- `@ngx-translate/core` : i18n (labels)

## Tests de non-régression

Les smoke tests (`npm run test:smoke`) vérifient :

- Import Chart.js dans les composants analytics (pas de régression vers CSS charts)
- Présence des données sponsors dans club-analytics (wiring benchmark API)
- Pas de retour aux tabs dans club-analytics (page unique scrollable)
- KPIs business en priorité sur les métriques techniques dans fleet overview
