# ADR-118: Architecture de déploiement du studio-render-server

**Date** : 2026-05-13
**Statut** : Proposé
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

**À trancher**. ADR ouvert volontairement : la décision attend (a) le premier client qui a besoin de renders réels en prod, ou (b) la fin de S5 (3 templates portés) — selon ce qui vient en premier. En attendant : fallback STUB du worker garde la state machine fonctionnelle, le dev local utilise `studio-render-server/` directement.

## Alternatives rejetées

- **Renderer in-process dans le central** : rejeté car contredit l'invariant `services.md` (le legacy ADR-054 a explicitement séparé renderer du controller pour éviter les 502 Railway timeout). Garder cette discipline pour V1.
- **Lambda à la demande (cold start chaque render)** : rejeté pour V1 — le bundle Remotion warmup prend 30-60s, faire ça à chaque render serait inacceptable. Garderait du sens pour des bursts (>100 renders/h) qu'on n'a pas en V1.

## Alternatives à départager

- **Container Railway dédié** (favori a priori) : un nouveau service Railway spinné depuis `studio-render-server/`. Dockerfile multi-stage avec node + Chromium. Assets binaires soit fetched au boot depuis FTP, soit copiés via Docker COPY (gonflerait l'image à 5+ GB — non). Variable `STUDIO_RENDER_SERVER_URL` dans le central pointe vers ce service.
- **Process colocalisé via `child_process.spawn`** dans le container central : un seul service Railway, plus simple à déployer, mais le central + Chromium dans le même container = mémoire partagée + un crash Chromium peut tuer le central. À éviter.

## Conséquences

- **Si Container dédié choisi** : 2 services Railway → ~+15 €/mois infra + workflow déploiement à organiser (qui pousse `studio-render-server/`, comment versionner les bundles Remotion). Mais isolation propre, scaling indépendant possible.
- **Si Process colocalisé choisi** : pas de coût infra additionnel, mais 1 crash Chromium = central down. Pas acceptable pour la centrale qui doit rester up.
- **Si rien tranché à temps** : le worker reste en mode STUB en prod, les MP4 produits sont des placeholders pointant vers des URLs FTP qui n'existent pas. Acceptable tant qu'il n'y a pas d'utilisateur, mais à monitorer.

## Fichiers impactés

- `studio-render-server/README.md` — section "TODO archi prod" pointe ici
- `central-server/src/services/studio-render-worker.service.ts` — la décision affecte la doc, pas le code (le fallback STUB est déjà en place)
- Variables d'env Railway : `STUDIO_RENDER_SERVER_URL` (à set après le déploiement)
