# ADR-052: Remotion comme moteur de templates vidéo

**Date** : 2026-04-14  
**Mis à jour** : 2026-04-16  
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
| `templates-remotion/public/masks/`                                           | Séquences PNG alpha pré-extraites (luminance masks)              |
| `templates-remotion/scripts/extract-masks.sh`                                | Script FFmpeg d'extraction des masques alpha                     |
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

### 3. Paramètres render (optimisés pour Railway headless)

```typescript
await renderMedia({
  concurrency: 2, // 2 workers — compromis parallélisme / mémoire Railway
  pixelFormat: 'yuv420p', // Requis pour décodage H.264 hardware sur Pi
  crf: 18, // Qualité élevée, bitrate stable
  codec: 'h264',
  imageFormat: 'jpeg', // ~10x plus rapide que PNG (scène déjà composée, opaque)
  jpegQuality: 85, // Imperceptible après re-encode H.264 CRF 18
  chromiumOptions: { gl: 'swangle' }, // Software WebGL pour containers sans GPU
  browserExecutable: process.env.BROWSER_EXECUTABLE_PATH, // System Chromium (évite 86MB download)
  timeoutInMilliseconds: 90000,
});
```

**Bundle caching** : le bundle webpack est créé une fois au démarrage (`prewarmRemotionBundle()`) et réutilisé pour tous les renders du même déploiement (~235ms cache hit vs 30-60s).

### 4. Masque alpha — séquences PNG pré-extraites (luminance)

Les WebM C et E contiennent un canal alpha VP9 (`alpha_mode: 1` dans le container WebM) qui sert de masque pour le texte/score/joueur. Deux approches ont été évaluées :

**v1 (abandonnée) — runtime `delayRender` + canvas** :

- `delayRender()` bloquait chaque screenshot Remotion
- `<Video ref>` décodait le WebM via swangle (browser, lent en headless)
- `canvas.toDataURL('webp')` encodait le masque à chaque frame (~10-15ms/frame)
- `continueRender()` débloquait le screenshot
- **Problème** : 420 cycles delayRender pour ButImgJoueur (210 frames × 2 masques), overhead majeur

**v2 (actuelle) — PNG grayscale pré-extraits** :

- `scripts/extract-masks.sh` extrait les frames alpha en PNG grayscale 480×270 via FFmpeg
- 600 images total (2.4 MB), committées dans `public/masks/`
- Les composants chargent le PNG correspondant au frame index via `staticFile()`
- CSS `mask-mode: luminance` (blanc = visible, noir = masqué)
- C et E sont maintenant des `<OffthreadVideo>` (FFmpeg natif, pas de browser decode)
- **Résultat** : zéro `delayRender`, toutes les couches en FFmpeg natif, ~2-4x plus rapide

```bash
# Régénérer les masques après modification d'un WebM alpha
cd templates-remotion && bash scripts/extract-masks.sh
```

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
- Modifier un WebM alpha (C/E) nécessite de re-run `scripts/extract-masks.sh` et commiter les PNG générés
- Toutes les couches vidéo utilisent `OffthreadVideo` (FFmpeg natif) — pas de décodage browser/swangle pour les vidéos
