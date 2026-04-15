# ADR-052: Remotion comme moteur de templates vidéo

**Date** : 2026-04-14  
**Mis à jour** : 2026-04-15  
**Statut** : Accepté  
**Format** : Complet

---

## Contexte

Le système de templates vidéo existant reposait sur deux approches parallèles (Puppeteer+FFmpeg côté serveur, Canvas+MediaRecorder côté client) avec duplication de la logique template. Pour passer à l'échelle (nombreux templates, accès clubs, preview interactive), on a besoin d'un moteur unifié et maintenable.

## Décision

Adoption de **Remotion v4** comme moteur de templates vidéo Neopro.

- Les templates sont écrits en **React/TSX** dans `templates-remotion/src/`
- Le **render final** est déclenché côté serveur (Railway) via l'API Remotion — output MP4 H.264 uploadé sur FTP puis injecté dans la bibliothèque vidéo du site
- La **preview live** dans le dashboard Angular passe par une iframe React (`@remotion/player`) servie par Express à `/remotion-preview/`
- Les **assets vidéo** (WebM de fond) sont stockés sur FTP Hostinger et servis via un proxy same-origin (voir section Assets FTP)

## Architecture complète

```
Dashboard Angular (Hostinger)
  │
  ├── iframe src="https://railway.app/remotion-preview/?composition=ButSimple&props=..."
  │     └── @remotion/player (React, Vite build dans templates-remotion/preview/)
  │           └── staticFile("BUT_simple_A.webm") → GET /BUT_simple_A.webm
  │                 └── Express static → templates-remotion/public/BUT_simple_A.webm
  │
  ├── postMessage({ type: 'remotion-props-update', props }) → mise à jour live
  │
  └── POST /api/remotion-templates/:id/render
        └── renderMedia() (headless Chromium, concurrency:1)
              └── output MP4 → FTP → bibliothèque vidéo site
```

## Fichiers clés

| Fichier                                                                      | Rôle                                                             |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `templates-remotion/src/ButSimple.tsx`                                       | Composition Remotion principale                                  |
| `templates-remotion/src/index.ts`                                            | Entry point render headless (enregistre toutes les compositions) |
| `templates-remotion/preview/src/app.tsx`                                     | App React preview (`@remotion/player`)                           |
| `templates-remotion/preview/vite.config.ts`                                  | Build Vite, `base: '/remotion-preview/'`                         |
| `templates-remotion/public/`                                                 | Assets statiques (WebM, fonts, images par défaut)                |
| `central-server/src/controllers/remotion-templates.controller.ts`            | API render + upload asset + proxy FTP                            |
| `central-server/src/routes/remotion-templates.routes.ts`                     | Routes `/api/remotion-templates/*`                               |
| `central-server/src/repositories/remotion-templates.repository.ts`           | Accès DB `neopro_templates`                                      |
| `central-server/src/scripts/migrations/add-neopro-templates.sql`             | Création table + seed ButSimple                                  |
| `central-dashboard/src/app/features/content/remotion-templates.component.ts` | UI dashboard (liste, formulaire, preview, render)                |
| `central-server/Dockerfile`                                                  | Stage `preview-builder` pour builder le Vite preview             |

## Décisions techniques importantes

### 1. `staticFile()` ignore `publicPath`

Dans `@remotion/player`, `staticFile("foo.webm")` retourne toujours `/foo.webm` (chemin absolu depuis la racine), quelle que soit la prop `publicPath` passée au Player. Pour cette raison, Express sert `templates-remotion/public/` à la **racine `/`** avec `index: false` :

```typescript
app.use(express.static(path.join(REMOTION_DIR, 'public'), { index: false }));
```

Cela signifie que `GET /BUT_simple_A.webm` est servi correctement. En render headless, `staticFile()` résout les chemins via `REMOTION_DIR` (env var Railway).

### 2. Assets FTP et proxy Range

Les assets vidéo (WebM) peuvent être uploadés depuis le dashboard vers FTP Hostinger (`remotion-assets/`). Quand ils sont utilisés en preview, ils passent par un **proxy same-origin** à `/api/remotion-templates/asset-proxy?url=<encoded_url>` car :

- **CORS** : `kalonpartners.bzh` ne renvoie pas de headers `Access-Control-Allow-Origin`
- **CSP** : `media-src` doit être same-origin ou listé explicitement
- **Seekabilité** : Remotion player envoie des `Range: bytes=X-Y` pour accéder à des frames précises. Le proxy transmet ces Range headers à l'upstream et relaie le `206 Partial Content`. Sans ça, la vidéo est non-seekable → boucle infinie de RAF.

En render headless (Railway), les URLs FTP sont utilisées directement — pas de proxy nécessaire.

### 3. Paramètres render (VFR / stuttering)

```typescript
await renderMedia({
  concurrency: 1, // Critique : évite la compétition CPU entre instances Chromium
  pixelFormat: 'yuv420p', // Requis pour décodage H.264 sur Pi
  crf: 18, // Qualité élevée
  codec: 'h264',
  timeoutInMilliseconds: 90000,
});
```

`concurrency: 1` est critique sur Railway (pas de GPU, CPU partagé). Plusieurs instances Chromium en parallèle causent du VFR (Variable Frame Rate) qui produit des sauts visibles sur Pi.

### 4. Masque alpha (useCAlphaMask)

`ButSimple` utilise un masque alpha frame-par-frame : le canal alpha de `BUT_simple_C.webm` est appliqué via `webkitMaskImage` sur le div texte. Implémentation :

- `delayRender()` bloque le screenshot Remotion jusqu'à ce que la frame vidéo soit décodée (`readyState >= 2`)
- Le canvas encode en **WebP 0.85** (pas PNG) — ~3x plus rapide, préserve l'alpha
- `continueRender()` libère le screenshot → masque parfait frame par frame

## Props schema (neopro_templates)

Chaque template expose ses props dans `props_schema` (JSONB). Types supportés :

| Type     | UI                       | Usage                                   |
| -------- | ------------------------ | --------------------------------------- |
| `text`   | Input texte              | Prénom, nom, club                       |
| `number` | Slider + input numérique | Taille logo                             |
| `image`  | Upload image → dataURL   | Logo club (preview) ou URL FTP (render) |
| `asset`  | Upload vidéo → FTP       | WebM de fond — admin_only: true         |

Les props `admin_only: true` sont masquées aux utilisateurs non-admin dans le dashboard.

## Comment ajouter un nouveau template

Voir `docs/guides/REMOTION_ADD_TEMPLATE.md` pour le guide pas à pas.

## Alternatives rejetées

- **Canvas+MediaRecorder (client-side)** : qualité variable selon machine client, output WebM non natif pour Pi
- **Puppeteer+FFmpeg maison** : fragile, pas de preview interactive
- **Remotion Lambda (AWS)** : coût AWS + config — à réévaluer si volume dépasse capacité Railway

## Conséquences

- Remotion + Chromium (~500 MB) dans le Dockerfile Railway
- Render bloquant (1 à la fois) — acceptable pour un usage rare de clubs
- Nouvel îlot React isolé dans un projet Angular — aucune dépendance croisée
- Assets WebM uploadables sans redeploy via le dashboard admin
