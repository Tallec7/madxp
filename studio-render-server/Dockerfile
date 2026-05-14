# studio-render-server Dockerfile (cf ADR-118 Accepté).
#
# Architecture : Container Railway dédié, distinct de central-server (Node)
# et python-rembg-worker (Python). Chargé du rendu Remotion réel via
# `bundle()` + `renderMedia()` côté Node + Chromium headless.
#
# Le central-server délègue en HTTP (cf studio-render-worker.service.ts +
# STUDIO_RENDER_SERVER_URL env var).
#
# Assets binaires (5+ GB de .mov/masks/fonts) NE sont PAS dans l'image —
# fetched depuis FTP au boot via `scripts/fetch-assets.sh` (ADR-118 :
# l'inverse explose à 5+ GB de Docker layer = 10+ min de déploiement).
#
# Pattern Chromium aligné sur central-server/Dockerfile (legacy ADR-054).

# ============================================
# Stage 1: Build deps (npm ci avec dev deps pour build TS si besoin)
# ============================================
FROM node:20-slim AS deps

WORKDIR /app

# Skip Puppeteer Chromium download — on installe le système Chromium plus bas.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

COPY studio-render-server/package*.json ./
RUN npm ci

# ============================================
# Stage 2: Runtime (deps prunées + Chromium + lftp + assets fetch script)
# ============================================
FROM node:20-slim AS runner

WORKDIR /app

# Runtime deps :
#  - Chromium + libs requises (mêmes que central-server/Dockerfile)
#  - fonts standard (fonts-liberation, emoji)
#  - lftp pour mirror les assets FTP au boot
#  - tini pour gérer SIGTERM proprement (Railway redeploy)
RUN apt-get update && apt-get install -y --no-install-recommends \
        chromium \
        fonts-liberation fonts-noto-color-emoji \
        libatk-bridge2.0-0 libatk1.0-0 libcups2 libdbus-1-3 libdrm2 libgbm1 \
        libgtk-3-0 libnspr4 libnss3 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
        libxshmfence1 libxss1 libasound2 \
        lftp \
        tini \
    && rm -rf /var/lib/apt/lists/*

# Tell Remotion to use system Chromium.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    BROWSER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production

# Copy node_modules pruned + sources.
COPY --from=deps /app/node_modules ./node_modules
COPY studio-render-server/ ./

# `public/` est dans .gitignore — créer le dossier vide ici, le script de
# boot le remplira via FTP mirror. Le code Remotion lit `staticFile()` dedans.
RUN mkdir -p public

# Railway injecte `PORT` au runtime (default 5175 pour dev local).
EXPOSE 5175

# tini reap les zombies + propage SIGTERM proprement (Chromium peut leak des
# sous-process sinon — incident classique des conteneurs Node + Chromium).
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["bash", "scripts/start.sh"]
