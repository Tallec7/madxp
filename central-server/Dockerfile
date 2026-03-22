# ============================================
# Stage 1: Dependencies
# ============================================
FROM node:20-slim AS deps

WORKDIR /app

# Install dependencies for native modules (canvas/node-gyp)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev libpixman-1-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Copy package files (relative to dockerContext)
COPY package*.json ./

# Install all dependencies (including dev for build)
RUN HUSKY=0 npm ci

# ============================================
# Stage 2: Builder
# ============================================
FROM node:20-slim AS builder

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build TypeScript
RUN npm run build

# ============================================
# Stage 3: Production Dependencies
# ============================================
FROM node:20-slim AS prod-deps

WORKDIR /app

# Install dependencies for native modules (canvas needs native compilation)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev libpixman-1-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

# Install only production dependencies
RUN HUSKY=0 npm ci --omit=dev && npm cache clean --force

# ============================================
# Stage 4: Production Runtime
# ============================================
FROM node:20-slim AS runner

WORKDIR /app

# Install runtime dependencies (ffmpeg + canvas native libs)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg libcairo2 libpango-1.0-0 libpangocairo-1.0-0 libjpeg62-turbo libgif7 librsvg2-2 libpixman-1-0 \
    && rm -rf /var/lib/apt/lists/*

# Set environment
ENV NODE_ENV=production \
    PORT=3001

# Copy production dependencies
COPY --from=prod-deps /app/node_modules ./node_modules

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3001/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start the application
CMD ["node", "--max-old-space-size=256", "--expose-gc", "dist/server.js"]
