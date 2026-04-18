# ADR-068: Signed URLs vidéo SaaS via proxy streaming Node

**Date** : 2026-04-18
**Statut** : Accepté
**Format** : Léger

---

## Contexte

Les vidéos SaaS sont aujourd'hui servies par des URLs FTP publiques non authentifiées (`https://kalonpartners.bzh/neopro-video/{uuid}.mp4`) résolues par `getFtpPublicUrl()` dans `saas.controller.ts`. Un UUID storage_path deviné donne accès au fichier, et aucune révocation n'est possible. Phase 4 du plan `video-deploy-unification` veut fermer cette exposition sans migrer les 1000+ vidéos FTP existantes vers un autre stockage.

## Décision

Ajouter un **proxy streaming Node** sur le central-server : endpoint `GET /api/videos/:id/stream?token=<jwt>` qui valide un JWT (payload `videoId`, `siteId`, `exp` 2h) puis relaie le flux FTP en pipe (zéro buffer mémoire, Range headers supportés). Les URLs envoyées au client SaaS dans `getSaasConfig` sont réécrites depuis le CDN FTP direct vers `https://api.neopro.../api/videos/:id/stream?token=...`. Le token est émis par un nouvel endpoint `POST /api/saas/:siteId/videos/:videoId/token` protégé par la clé API du site.

## Alternatives rejetées

- **Migration FTP → S3/R2 + signed URLs natives** : rejeté car migration 1000+ assets + re-test e2e (~1 semaine), alors que le proxy résout le problème de sécurité en 2-3 jours sans toucher au stockage.
- **Path obfuscation (UUID long + CDN)** : rejeté car pas de révocation, pas d'expiration, security through obscurity.
- **Auth Basic FTP public-read désactivé** : rejeté car casserait le mode Pi (les Raspberry Pi téléchargent via URLs FTP publiques pour `deploy_video`).

## Conséquences

- ✅ URLs vidéo SaaS expirent après 2h ; token compromis = fenêtre limitée
- ✅ Traçabilité serveur : on peut logger qui lit quoi (audit GDPR)
- ⚠️ Latence : un hop supplémentaire via Railway (mitigation : Cache-Control + HTTP Range)
- ⚠️ Bande passante Railway augmente (mitigation : Cloudflare devant le proxy en phase 2, hors scope MVP)
- ⚠️ Mode Pi **inchangé** : les Pi continuent d'utiliser les URLs FTP directes (c'est leur réseau local qui DL, pas exposé)

## Fichiers impactés

- `central-server/src/routes/video-stream.routes.ts` — nouveau, endpoint proxy
- `central-server/src/controllers/video-stream.controller.ts` — nouveau, JWT verify + FTP pipe
- `central-server/src/services/video-token.service.ts` — nouveau, sign/verify JWT
- `central-server/src/controllers/saas.controller.ts` — `resolveVideoUrl()` réécrit vers l'endpoint proxy en SaaS
- `central-server/src/config/ftp-storage.ts` — `getFtpPublicUrl` reste pour le mode Pi
- `central-server/src/__tests__/smoke/smoke-saas.test.ts` — smoke : token expiré = 401, token valide = stream OK
