# ADR-054: Async Remotion Render Jobs

**Date** : 2026-04-16
**Statut** : Accepté
**Format** : Léger

---

## Contexte

Le render Remotion d'un template dure ~2 minutes (bundle webpack + selectComposition + renderMedia + upload FTP). Le controller `renderTemplate` était synchrone : la requête HTTP bloquait pendant toute la durée du render, la barre de progression frontend était factice (progression en 3 paliers `5% → 15% → 100%` sans corrélation avec le render réel), et tout incident réseau côté Railway (timeout LB à 100s, redémarrage du dyno) laissait l'utilisateur avec une erreur opaque sans savoir si la vidéo avait été générée.

## Décision

Découpler la requête HTTP du render :

1. `POST /api/remotion-templates/:id/render` insère une ligne dans `remotion_render_jobs` (status `pending`, progress `0`) et retourne `202 { job_id }` immédiatement.
2. Un worker in-process (`remotion-render-worker.service.ts`) poll la table toutes les 5s, claim le prochain job avec `UPDATE ... WHERE id = (SELECT id FROM remotion_render_jobs WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *`, exécute le render, et écrit la progression frame-par-frame via le callback `onProgress` de Remotion (mappé sur 15-95% dans `remotion_render_jobs.progress`).
3. Le frontend poll `GET /api/remotion-templates/render-jobs/:jobId` toutes les 2s, alimente la barre de progression avec la valeur réelle, et affiche la phase (`bundling` / `selecting` / `rendering` / `uploading`) pour donner un signal qualitatif.
4. Un trigger `failStaleRunningJobs` marque `failed` les jobs `running` depuis > 10 min au boot (recovery après crash/redéploiement).
5. Un cleanup quotidien supprime les jobs `completed`/`failed` de plus de 7 jours.

## Alternatives rejetées

- **Server-Sent Events (SSE)** : rejeté car le flux est unidirectionnel mais maintenir une connexion pendant 2 min multiplie les points de panne (LB Railway, proxies, reconnexions) et complexifie la recovery après redéploiement. Le polling HTTP 2s est stateless et auto-récupérant.
- **Job queue externe (BullMQ/Redis)** : rejeté car une seule replica Railway, un seul job parallèle (le render Remotion est CPU-bound, lancer N renders simultanément = thrashing), et PostgreSQL offre déjà `FOR UPDATE SKIP LOCKED` pour la concurrence. Ajouter Redis = service infra en plus, sans bénéfice à notre échelle.
- **Jobs in-memory (Map<jobId, …>)** : rejeté car la perte au redémarrage empêche toute recovery, et rend le debugging impossible (on ne voit pas l'historique des renders échoués).

## Conséquences

- **Positif** : l'UI reflète la progression réelle ; les renders long ne bloquent plus la requête HTTP (plus de timeouts LB) ; l'historique persistant (table DB) permet l'audit et la recovery après redémarrage.
- **Négatif** : latence perçue de 2-5s entre fin du render et disparition de la barre (polling tick) — acceptable face à un render de 2 min.
- **Risque multi-replica futur** : si Railway scale à N replicas, chacun démarrera son propre worker. Le claim SKIP LOCKED garantit qu'un seul traitera un job donné, mais plusieurs jobs peuvent tourner en parallèle sur des replicas différents — à l'échelle actuelle (rarement 2 renders simultanés par utilisateur), c'est un trait souhaitable.

## Fichiers impactés

- `central-server/src/scripts/migrations/add-remotion-render-jobs.sql` — table `remotion_render_jobs` + indexes + trigger `updated_at`
- `central-server/src/repositories/remotion-render-job.repository.ts` — CRUD + `claimNextPending` (SKIP LOCKED) + `failStaleRunningJobs` + `cleanupOlderThan`
- `central-server/src/services/remotion-render-worker.service.ts` — poll loop + bundle cache + runRemotionRender + cleanup
- `central-server/src/controllers/remotion-templates.controller.ts` — `renderTemplate` passe de synchrone à enqueue + nouvel endpoint `getRenderJob`
- `central-server/src/routes/remotion-templates.routes.ts` — route `GET /render-jobs/:jobId`
- `central-server/src/server.ts` — `startRenderWorker()` au boot + `stopRenderWorker()` sur SIGTERM
- `central-dashboard/src/app/features/content/remotion-templates/remotion-templates-data.service.ts` — `enqueueRender` + `pollRenderJob`
- `central-dashboard/src/app/features/content/remotion-templates/remotion-templates.component.ts` — polling setTimeout 2s + `applyJobSnapshot` + cleanup `OnDestroy`
