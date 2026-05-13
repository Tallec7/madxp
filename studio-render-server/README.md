# studio-render-server

> Service spécialiste de rendu Remotion pour Templates Studio V1.
> Spec : [STUDIO_V1.md §3](../../studio-template/templates-remotion/spec/STUDIO_V1.md) (workspace d'authoring d'origine).

Reçoit des requêtes HTTP `POST /api/render` de la centrale Neopro (`central-server/src/services/studio-render-worker.service.ts`), bundle Remotion lazy au 1er render, exécute `renderMedia` (video) ou `renderStill` (image), retourne l'URL du MP4/PNG produit.

## Relation avec `studio-template/templates-remotion/`

Ce dossier est une **copie code-only** du workspace d'authoring `/Users/gletallec/Documents/NEOPRO/studio-template/templates-remotion/`. Les deux coexistent volontairement :

| Dossier                                              | Rôle                                                                                                                                                                   |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `studio-template/templates-remotion/` (sibling repo) | **Workspace d'authoring** sandbox — édition des `.tsx`, batch render NLF historique, exploration. Garde tous les assets sources (5+ GB de `.mov`, `.webm`, masks PNG). |
| `neopro/studio-render-server/` (ici)                 | **Service déployable** pour V1 — code uniquement, assets symlinkés en dev, fetched depuis FTP en prod (TODO archi).                                                    |

Les modifications "production V1" se font ici. Les expérimentations / batch sandbox restent dans `studio-template/`. Quand un nouveau template V1 est prêt, on synchronise les fichiers concernés (`src/templates/<slug>/`).

## Setup local

```bash
# 1. Installer les deps (assez lourd — Remotion + Chromium)
cd studio-render-server
npm install

# 2. Symlinker les assets depuis le workspace d'authoring
bash scripts/link-assets.sh
# Ou avec un autre chemin :
SOURCE_DIR=/autre/path bash scripts/link-assets.sh

# 3. Démarrer le render server (port 5175)
npm run studio:server

# 4. Démarrer la centrale avec l'env pointant vers le render server
#    (dans un autre terminal)
cd ../central-server
STUDIO_RENDER_SERVER_URL=http://127.0.0.1:5175 npm run dev
```

## Scripts

| Script                        | Effet                                              |
| ----------------------------- | -------------------------------------------------- |
| `npm run studio:server`       | Lance le render server HTTP sur `:5175`            |
| `npm run studio`              | Lance Remotion Studio (dev tool natif) sur `:3000` |
| `npm run render:v1`           | Render CLI legacy (sandbox)                        |
| `bash scripts/link-assets.sh` | Symlink `public/` depuis le workspace d'authoring  |

## API

```
GET  /api/health
  → { ok: true }

POST /api/render
  Body : { compositionId, kind: 'video' | 'still', props }
  Réponse : { url, cached, durationMs }
  - 'video' : produit un MP4 via renderMedia
  - 'still' : produit un PNG via renderStill (1 frame)
  - `url` est relatif (`/renders/<filename>`) — le caller préfixe avec le base URL
  - Cache par hash(kind + compositionId + props) : re-render même config = instant

GET  /renders/<filename>
  → MP4/PNG produit (servi par express.static)
```

## TODO archi prod

Le déploiement Railway de ce service n'est pas tranché. Trois options :

1. **Container Railway dédié** (`Dockerfile` + `node studio-poc/server.mjs` + assets fetched depuis FTP au boot)
2. **Process colocalisé** avec central-server via `child_process` (mémoire partagée mais surcharge)
3. **Lambda render à la demande** (cold start vs cache de bundle)

À documenter dans un ADR léger avant de pousser un premier déploiement.

## Risque #1 du spec — no legacy import

Le smoke test `smoke-templates-studio` côté `central-server/` enforce que la centrale **n'importe pas** `@remotion/renderer` / `@remotion/bundler` (le rendu vit ici, pas là-bas). Si tu modifies l'architecture, veille à respecter cet invariant — sinon on retombe dans l'anti-pattern 502 Railway documenté pour le legacy ADR-054.
