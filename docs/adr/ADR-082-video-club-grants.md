# ADR-082: Video Club Grants — Accès multi-clubs aux vidéos admin

**Date** : 2026-04-21
**Statut** : Accepté
**Format** : Léger

---

## Contexte

`uploaded_for_site_id` est une FK unique sur `videos` : une vidéo uploadée par l'admin ne peut être assignée qu'à un seul club. Plusieurs clubs peuvent avoir besoin de placer la même vidéo dans leurs boucles ou catégories, sans que chacun ne doive re-uploader le fichier.

## Décision

Ajout d'une table pivot `video_club_grants (video_id, site_id, PRIMARY KEY)`. Un super_admin peut octroyer à un ou plusieurs clubs le droit de placer une vidéo admin dans leur configuration (boucles, catégories). `uploaded_for_site_id` reste le propriétaire primaire unique (seul ce site peut supprimer la vidéo). Les grants déverrouillent uniquement le dropdown "Ajouter à" dans la bibliothèque vidéo du club concerné.

## Alternatives rejetées

- **Modifier `uploaded_for_site_id` en array** : casse la FK et l'ensemble des guards existants.
- **Dupliquer la vidéo par club** : gaspillage FTP + drift entre copies.
- **Grant = droit de suppression** : risque qu'un club supprime une ressource partagée — écarté.

## Conséquences

- Plusieurs clubs peuvent utiliser la même vidéo admin sans re-upload.
- Le super_admin gère les grants depuis le `VideoDetailPanel` (section "Clubs autorisés").
- La suppression reste strictement gardée par `uploaded_for_site_id` (inchangé).
- Supervision : `neopro_video_club_grants_total{operation,status}`.

## Fichiers impactés

- `central-server/src/scripts/migrations/add-video-club-grants.sql` — nouvelle table
- `central-server/src/repositories/video-club-grant.repository.ts` — CRUD grants
- `central-server/src/controllers/video-club-grants.controller.ts` — 4 handlers
- `central-server/src/routes/content.routes.ts` — 4 routes (super_admin mutations)
- `central-server/src/middleware/validation.ts` — schéma `addVideoClubGrant`
- `central-server/src/services/metrics.service.ts` — compteur Prometheus
- `central-dashboard/…/video-library/` — `isLockedForConfig()` + section grants UI
