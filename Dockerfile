# Multi-stage Dockerfile for NestJS (production)

# 1) Base image
FROM node:20-bookworm-slim AS base
WORKDIR /app

# 2) Install dependencies (with build tools for native modules)
FROM base AS deps
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci

# 3) Build the app
FROM deps AS build
COPY . .
RUN npm run build

# 4) Prune dev dependencies for production runtime
FROM deps AS prod-deps
RUN npm prune --omit=dev

# 5) Production image
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy only needed files
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package*.json ./
# Copy dataset so runtime can access '/app/src/common/data/json/dataset_umkm.json'
COPY src/common/data/json/dataset_umkm.json ./src/common/data/json/dataset_umkm.json

# Expose the app port (matches PORT from .env.example)
EXPOSE 3000

# Default command
CMD ["node", "dist/main.js"]
