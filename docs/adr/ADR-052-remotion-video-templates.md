# ADR-052: Remotion comme moteur de templates vidéo

**Date** : 2026-04-14
**Statut** : Accepté
**Format** : Léger

---

## Contexte

Le système de templates vidéo existant repose sur deux approches parallèles (Puppeteer+FFmpeg côté serveur, Canvas+MediaRecorder côté client) avec duplication de la logique template. Pour passer à l'échelle (nombreux templates, accès clubs), on a besoin d'un moteur unifié, maintenable, avec preview interactive et render MP4 de qualité constante.

## Décision

Adoption de **Remotion** comme moteur de templates vidéo Neopro. Les templates sont écrits en React/TSX dans `templates-remotion/` (îlot React isolé). Le render est déclenché côté serveur (Railway) via `npx remotion render` — output MP4 H.264 uploadé sur FTP puis injecté dans la bibliothèque vidéo du site. La preview dans le dashboard Angular passe par une iframe postMessage vers le studio Remotion (pattern déjà en place pour `but-simple`).

Deux niveaux d'accès : **Atelier** (admin, création/publication de templates) et **Club** (utilisation des templates publiés, feature-gated `video_templates` tier `pro`).

## Alternatives rejetées

- **Canvas+MediaRecorder (client-side)** : rejeté car qualité variable selon machine client, output WebM (pas MP4 natif pour Pi), duplication de logique avec le serveur
- **Puppeteer+FFmpeg maison** : rejeté car fragile, pas de preview interactive, templates écrits en HTML string non maintenables
- **Remotion Lambda (AWS)** : rejeté pour l'instant (coût AWS + config supplémentaire) — à réévaluer si le volume de renders dépasse la capacité Railway

## Conséquences

- Remotion + Chromium (~500 MB) à ajouter au Dockerfile Railway de `central-server`
- `templates-remotion/` doit être copié dans l'image Docker (modifier `central-server/Dockerfile`)
- Render bloquant sur Railway (1 render à la fois sur le tier actuel) — acceptable pour un usage rare
- Nouvel îlot React dans un projet Angular — isolé dans `templates-remotion/`, aucune dépendance croisée

## Fichiers impactés

- `templates-remotion/` — nouveau dossier POC, devient le moteur officiel
- `central-server/src/controllers/remotion-templates.controller.ts` — nouveau
- `central-server/src/routes/remotion-templates.routes.ts` — nouveau
- `central-server/src/scripts/migrations/add-neopro-templates.sql` — nouveau
- `central-server/src/server.ts` — enregistrement de la nouvelle route
- `central-dashboard/src/app/core/services/feature-gate.service.ts` — ajout `video_templates`
- `central-dashboard/src/app/features/content/remotion-templates.component.ts` — nouveau
- `central-server/Dockerfile` — à modifier pour inclure `templates-remotion/` et Chromium
