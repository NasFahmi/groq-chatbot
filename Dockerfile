FROM node:20-bookworm-slim

WORKDIR /app

# Install minimal dependencies
RUN apt-get update && apt-get install -y \
  python3 build-essential \
  && rm -rf /var/lib/apt/lists/*

# Copy dan install dependencies
COPY package*.json ./
COPY src/common/data/json ./src/common/data/json
RUN npm ci --omit=dev

# Copy source code
COPY . .
RUN npm run build

EXPOSE 3000
CMD ["node", "dist/main.js"]