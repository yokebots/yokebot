FROM node:20-slim AS base

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Install build tools for native deps (better-sqlite3)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy workspace root files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy engine package
COPY packages/engine/package.json packages/engine/

# Install dependencies
RUN pnpm install --frozen-lockfile --filter @yokebot/engine...

# Copy engine source (ARG busts Docker cache on redeploy)
ARG CACHEBUST=1
COPY packages/engine/ packages/engine/

# Copy enterprise module
COPY ee/ ee/

# Copy skills directory
COPY skills/ skills/

# Build
RUN pnpm --filter @yokebot/engine build

# Production stage
FROM node:20-slim

RUN corepack enable && corepack prepare pnpm@latest --activate
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=base /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=base /app/packages/engine/package.json packages/engine/
RUN pnpm install --frozen-lockfile --filter @yokebot/engine... --prod
COPY --from=base /app/packages/engine/dist packages/engine/dist/
COPY --from=base /app/ee ee/

# ee/ modules need access to stripe — symlink to engine's node_modules
RUN ln -s /app/packages/engine/node_modules /app/ee/node_modules
COPY --from=base /app/skills skills/

ENV NODE_ENV=production
ENV YOKEBOT_PORT=3001
ENV YOKEBOT_SKILLS_DIR=/app/skills
ENV YOKEBOT_DATA_DIR=/app/data

# Create data directory for workspace files
RUN mkdir -p /app/data/workspace

EXPOSE 3001

WORKDIR /app/packages/engine
CMD ["node", "dist/index.js"]
