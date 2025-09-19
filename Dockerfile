# syntax=docker/dockerfile:1

# You can override NODE_VERSION at build time: --build-arg NODE_VERSION=22
ARG NODE_VERSION=22

# Base image (kept minimal)
FROM node:${NODE_VERSION}-bookworm-slim AS base
WORKDIR /app
ENV NODE_ENV=production

# Install only production deps (for final image). This ensures native modules are compiled against Debian (not Alpine)
FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app
# Tools often needed by native modules like faiss-node
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 build-essential pkg-config git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Build stage - install full deps and compile the NestJS app
FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 build-essential pkg-config git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig*.json nest-cli.json ./
COPY src/ src/
RUN npm run build

# Runtime image
FROM node:${NODE_VERSION}-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
# Optional: run as non-root
# RUN useradd -m -u 10001 nodeuser && chown -R nodeuser:nodeuser /app
# USER nodeuser

# Copy production dependencies and compiled app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
## Ensure runtime has data assets expected by code (e.g., reading from /app/src/common/data/json)
COPY src/common/data/json ./src/common/data/json

# Set a default port (override with -e PORT=3000)
ENV PORT=3000
EXPOSE 3000

# Load env at runtime via docker run --env-file .env (recommended) or compose
CMD ["node", "dist/main.js"]
