# ADR-117: Couplage automatique déploiement vidéos ↔ sauvegarde config profil

**Date** : 2026-05-11
**Statut** : Accepté
**Format** : Léger

---

## Contexte

Quand un utilisateur ajoute une vidéo cloud à un profil Pi et clique « Sauvegarder config » (`PUT .../configuration`) ou « Déployer » (`POST .../deploy`), la config arrive sur le Pi avec le chemin référencé — mais si la vidéo n'a jamais été déployée sur ce site, le fichier physique n'existe pas → 404 silencieux côté kiosk. Aucune commande `deploy_video` n'était envoyée depuis ces deux endpoints (issue #959 Phase C).

## Décision

À chaque appel à `updateProfileConfiguration` ou `deployProfile`, le serveur extrait les chemins vidéo de la nouvelle config via `extractVideoPaths()`, calcule les chemins nouvellement ajoutés (diff avec l'ancienne config), et pour chaque nouveau chemin sans `content_deployments` actif sur ce site (`pending`/`in_progress`/`completed`), déclenche automatiquement un déploiement via `deploymentService.triggerMissingVideoDeployments()`. Le count de déploiements déclenchés est retourné dans la réponse (`pendingDeployments`) pour feedback UI. Limité à 10 vidéos par appel pour éviter la saturation FTP. Silencieux pour les sites SaaS (guard `site_type !== 'pi'`) et les paths synthétiques (`web_page`/`livestream`).

## Alternatives rejetées

- **Déclencher uniquement côté Pi à la réception de la config** : rejeté car le Pi n'a pas accès au FTP — il attend une commande `deploy_video` du cloud.
- **Bloquer le bouton Sauvegarder jusqu'à confirmation des déploiements** : rejeté car les déploiements peuvent prendre 30-120s, UX dégradée.

## Conséquences

- Les vidéos nouvellement référencées dans un profil Pi sont automatiquement déployées sans action supplémentaire de l'opérateur.
- Risque de saturation FTP si >10 vidéos ajoutées d'un coup — le throttle à 10 limite l'impact (log warn si dépassé).

## Fichiers impactés

- `central-server/src/repositories/deployment.repository.ts` — +`hasActiveDeploymentByPath()`
- `central-server/src/services/deployment.service.ts` — +`triggerMissingVideoDeployments()`
- `central-server/src/controllers/config-profiles.controller.ts` — `updateProfileConfiguration` + `deployProfile`
- `central-dashboard/src/app/core/services/sites.service.ts` — types de retour
- `central-dashboard/src/app/features/sites/components/site-content-tab/deployment-status/deployment-status.component.ts` — spinner + indicateur
