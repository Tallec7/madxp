---
paths:
  - 'central-server/src/repositories/site-sponsor*'
  - 'central-server/src/repositories/analytics*'
  - 'central-server/src/repositories/advertiser*'
  - 'central-server/src/services/analytics*'
  - 'central-server/src/controllers/sponsor-portal*'
  - 'central-dashboard/src/app/features/sponsors/**'
  - 'raspberry/src/app/services/analytics*'
  - 'raspberry/src/app/services/sponsor*'
  - 'raspberry/src/app/components/tv/tv.component*'
---

# Sponsors & Analytics

## Weighted Playlist (Bresenham)

- NE PAS supprimer `generateWeightedPlaylist()` de `startSeamlessLoop()` dans tv.component.ts (sans weighted playlist, la rotation pondérée est silencieusement désactivée)
- NE PAS supprimer le champ `weight` de `LoopVideo`, `LoopVideoConfig` ou `SponsorVideo` (le weight est le seul mécanisme de pondération de la rotation sponsor Or/Argent/Bronze)
- NE PAS reconstruire les objets sponsor dans `enrichConfigWithAnalyticsMetadata()` ou `enrichConfigWithDisplayVariants()` au lieu de muter les champs (reconstruire l'objet = perdre `weight` et tout autre champ futur — toujours SET des champs spécifiques sur l'objet existant)
- NE PAS revenir à l'algorithme greedy (pick highest remaining) dans `generateWeightedPlaylist()` (le greedy front-load le sponsor dominant → ×4 et ×10 produisent tous les deux "1 sur 2". L'algo Bresenham distribue uniformément)
- NE PAS supprimer la prévisualisation playlist (`getPlaylistPreview`, `playlist-preview-track`) du loop-manager
- NE PAS supprimer `fixWrapAround()` de `generateWeightedPlaylist()` (sans wrap-around fix, double passage à la jonction de boucle)
- NE PAS supprimer le champ `pinned` de `LoopVideo`, `LoopVideoConfig` ou `SponsorVideo` (permet de fixer une vidéo à sa position — ex: intro Neopro toujours en 1ère position)
- NE PAS supprimer le support `pinnedSlots`/`mobileVideos` de `generateWeightedPlaylist()`

## Réconciliation sponsors

- NE PAS réconcilier des loopVideos sans marqueurs sponsor dans `_reconcileOrphanedLoopVideos()` (seules les entrées avec `site_sponsor_id` ou `analytics_category === 'sponsor'` sont de vrais sponsors — `owner === 'club'` seul n'est PAS un marqueur sponsor)
- NE PAS utiliser un match exact seul dans `getAutoDetectedSponsor()` / `getCategorySponsor()` (les vidéos de boucle ont des préfixes numériques `07_A_L_AFFUT.mp4` mais `site_sponsor_videos` stocke le nom catégorie `A_L_AFFUT.mp4` → toujours fallback strip `^\d+_`)
- NE PAS comparer `site_sponsor_videos.video_filename` par exact match seul sans normaliser en bare filename (utiliser `LIKE '%/' || $1` en fallback SQL, et `split('/').pop()` côté dashboard)

## Sponsor Portal

- NE PAS supprimer les endpoints `/benchmark` ou `/export-csv` du sponsor-portal (essentiels pour le PoC Proof of Play)
- NE PAS retirer `interruption_reason` de l'INSERT `video_plays` dans analytics.repository.ts
- NE PAS afficher le canvas Chart.js du portail sponsor sans conteneur `.chart-container` à hauteur fixe (`maintainAspectRatio: false` sans hauteur parent = graphe qui s'étire indéfiniment)
- NE PAS utiliser `video_duration: durationPlayed` dans analytics.service.ts (utiliser `setCurrentVideoDuration()` qui capture `player.duration` depuis tv.component.ts)
- NE PAS utiliser des champs fantômes (`video_title`, `video_duration`, `total_impressions`, `total_screen_time`, `priority`, `associated_at`) dans le template vidéos de `sponsor-videos-tab.component.ts` (l'API retourne `filename`, `original_name`, `duration`, `added_at`, `file_size` — l'interface est dans `advertiser-detail.models.ts`)
- NE PAS masquer le message d'erreur serveur dans `deployCampaignAction()` avec un message générique (le serveur retourne 3 erreurs identifiables : `no videos`, `no target sites`, `not found` — les afficher en français)

## Stats agrégées

- NE PAS remettre `getStatsSummary`, `getDailyTrends` ou `getBenchmark` sur `video_plays` dans `site-sponsor.repository.ts` (migrées vers `site_sponsor_daily_stats` pré-agrégée — `video_plays` a une rétention de 15 jours)
- NE PAS supprimer `calculate_site_sponsor_daily_stats()` de `full-schema.sql` ou son appel dans `cron-scheduler.service.ts` (sans cette fonction, les stats sponsors du jour sont perdues après le cleanup `video_plays` 15 jours — `checkAggregationStaleness()` alerte si >36h sans agrégation)
