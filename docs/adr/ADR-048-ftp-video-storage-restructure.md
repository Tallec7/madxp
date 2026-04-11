# ADR-048: Restructuration stockage FTP vidéos + thumbnails + table pivot site_videos

**Date** : 2026-04-11
**Statut** : Accepté
**Format** : Léger

---

## Contexte

Avec 50+ sites et une croissance vers 5000+ vidéos, le stockage FTP à plat (`/neopro-video/*.mp4`) ne scale pas. Les thumbnails n'existent pas en mode SaaS (pas de Pi = pas de ffmpeg local). Une même vidéo uploadée pour plusieurs sites est dupliquée physiquement. Il faut restructurer le stockage, ajouter la génération centralisée de thumbnails, et permettre le partage multi-sites sans duplication.

## Décision

1. **Nouvelle structure FTP shardée** pour les nouveaux uploads : `videos/{2-chars-uuid}/{uuid}.mp4` + `videos/{2-chars-uuid}/{uuid}.thumb.jpg`. Les fichiers existants restent en place (dual-path). Un script batch de migration sera préparé pour exécution ultérieure.

2. **Table pivot `site_videos`** : remplace la relation 1:1 `uploaded_for_site_id` par une relation N:N. Une vidéo physique unique peut être liée à N sites (Pi ou SaaS).

3. **Génération de thumbnails côté central-server** à l'upload via ffmpeg (déjà installé dans le Dockerfile Railway). Le `thumbnail_url` (colonne existante en DB) est rempli avec l'URL FTP publique du `.thumb.jpg`.

## Alternatives rejetées

- **Thumbnails côté navigateur** (`<video preload="metadata">` + canvas capture) : rejeté car qualité inconsistante, pas de cache CDN, et ne fonctionne pas pour les formats non supportés par le navigateur
- **Migration one-shot des fichiers existants** : rejeté car risque prod (Pi en cours de déploiement) et gain faible à 50 sites
- **Dossier `/thumbnails/` séparé sur FTP** : rejeté car double la complexité de cleanup (supprimer vidéo = 2 chemins à gérer dans 2 dossiers)

## Conséquences

- (+) Thumbnails disponibles pour SaaS et Pi, une seule source
- (+) Vidéos partageables entre sites sans duplication fichier
- (+) FTP scalable à 5000+ vidéos (max ~250 fichiers/dossier avec sharding UUID)
- (-) Dual-path temporaire : `getVideoUrl()` doit gérer ancien format (plat) et nouveau (shardé)
- (-) Migration batch à planifier plus tard pour unifier

## Fichiers impactés

- `central-server/src/config/ftp-storage.ts` — helpers pour nouveau path shardé
- `central-server/src/services/storage.service.ts` — `uploadThumbnail()`, nouveau path pattern
- `central-server/src/services/thumbnail.service.ts` — génération à l'upload (existe déjà, à brancher)
- `central-server/src/controllers/content.controller.ts` — génère thumbnail après upload, utilise nouveau path
- `central-server/src/repositories/video.repository.ts` — queries avec `site_videos` join
- `central-server/src/scripts/migrations/add-site-videos-pivot.sql` — nouvelle table + migration données
- `central-server/src/scripts/migrations/migrate-ftp-storage-batch.sql` — script batch (non exécuté auto)
- `central-server/src/controllers/saas.controller.ts` — adapter résolution URL pour nouveau path
- `raspberry/admin/public/modules/videos/loader.js` — charger thumbnail depuis URL FTP (plus de chemin local)
