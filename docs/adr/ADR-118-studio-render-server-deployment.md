# ADR-118: Architecture de déploiement du studio-render-server

**Date** : 2026-05-13 (proposé) / 2026-05-14 (accepté)
**Statut** : Accepté
**Format** : Léger

---

## Contexte

Le walking skeleton Templates Studio V1 (PRs #981→#984) a livré le central-server orchestrateur (queue PG + endpoints + worker stub) qui **délègue le rendu Remotion en HTTP** à un service spécialiste : `studio-render-server/` (PR #983, monorepo lite). Ce service vit en dev sur `:5175` et expose `POST /api/render`.

Pour aller en prod il faut décider **comment ce service est déployé**. Trois options envisagées dans le README de `studio-render-server/`. Aucune n'a été tranchée — le worker du central tombe en fallback STUB tant que `STUDIO_RENDER_SERVER_URL` n'est pas configurée.

Contraintes :

- Le rendu Remotion nécessite Chromium headless (~775 Mo de deps + 5 GB d'assets binaires actuellement dans `studio-template/templates-remotion/public/`)
- Volume V1 = 1-10 renders/jour interne (pas de pression scale)
- L'invariant `services.md` interdit `@remotion/renderer` dans le central → le rendu DOIT vivre ailleurs

## Décision

**Container Railway dédié**. Un nouveau service Railway pointant sur `studio-render-server/` (cf monorepo lite PR #983). Dockerfile multi-stage Node + Chromium. Assets binaires (5+ GB de .mov/masks/fonts) **fetched au boot depuis FTP** (pas Docker COPY — sinon image gonfle à 5+ GB et le déploiement Railway prend 10+ min). Variable `STUDIO_RENDER_SERVER_URL` dans le central pointe vers ce service (`https://<service>.up.railway.app`).

Coût marginal estimé : ~$5-15/mois Hobby suffit pour le volume V1 (1-10 renders/jour interne). Scale futur = bump replicas Railway, le worker Node `studio-render-worker.service.ts` SKIP LOCKED gère le multi-claim.

À implémenter post-merge :

1. Créer le service Railway pointant sur `studio-render-server/Dockerfile` (à écrire — TODO ci-dessous)
2. Set env vars : `FTP_HOST`/`FTP_USER`/`FTP_PASS` (pour le boot script qui fetch les assets), `PUBLIC_BASE_URL` (pour staticFile resolution)
3. Set `STUDIO_RENDER_SERVER_URL` côté central pointant vers le nouveau service
4. Smoke E2E manuel : POST /render-requests → MP4 réel produit (vs URL placeholder STUB)

## Alternatives rejetées

- **Renderer in-process dans le central** : rejeté car contredit l'invariant `services.md` (le legacy ADR-054 a explicitement séparé renderer du controller pour éviter les 502 Railway timeout). Garder cette discipline pour V1.
- **Lambda à la demande (cold start chaque render)** : rejeté pour V1 — le bundle Remotion warmup prend 30-60s, faire ça à chaque render serait inacceptable. Garderait du sens pour des bursts (>100 renders/h) qu'on n'a pas en V1.
- **Process colocalisé via `child_process.spawn`** dans le container central : 1 service Railway → plus simple, mais le central + Chromium dans le même container = mémoire partagée + un crash Chromium peut tuer le central. Inacceptable pour la centrale qui doit rester up.

## Conséquences

- **+$5-15/mois Railway** pour le service dédié. Acceptable au regard de la valeur (sans ce service, V1 = STUB inutilisable en prod).
- **Workflow déploiement à organiser** : qui pousse `studio-render-server/` ? Réponse : le repo `neopro` lui-même via Railway auto-deploy sur main. Quand on touche `studio-render-server/**`, Railway redeploy automatiquement (filter par dossier).
- **Versioning des manifests Remotion** : déjà dans le repo neopro (PR #985 dévendor). Les manifests sont resync au boot via `seed-templates-studio-manifests.ts`.
- **Fetch assets au boot** : ajoute ~30s de cold start au démarrage du service, mais évite l'image Docker à 5+ GB. Acceptable car le service reste up entre les renders (pas de cold start par render).
- **Isolation propre** : un crash Chromium fait tomber uniquement le service render, pas le central. La queue PG reste lisible, les rows en cours passent en `failed` après timeout (Railway restart auto).

## Fichiers impactés

- `studio-render-server/README.md` — section "TODO archi prod" déjà alignée sur cette décision
- `studio-render-server/Dockerfile` — **TODO à écrire post-merge** (Node 20 + Chromium + boot script qui fetch FTP assets)
- `central-server/src/services/studio-render-worker.service.ts` — pas de changement code (le fallback STUB sert pour dev sans le service Railway, et reste actif en prod si l'env var n'est pas set — graceful degradation)
- Variables d'env Railway nouveau service : `FTP_HOST`, `FTP_USER`, `FTP_PASS`, `PUBLIC_BASE_URL`
- Variable d'env Railway central-server : `STUDIO_RENDER_SERVER_URL=https://<service>.up.railway.app`
