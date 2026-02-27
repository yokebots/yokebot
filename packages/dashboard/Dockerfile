FROM node:20-slim AS build

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace root files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy dashboard package
COPY packages/dashboard/package.json packages/dashboard/

# Install dependencies
RUN pnpm install --frozen-lockfile --filter @yokebot/dashboard...

# Copy dashboard source
COPY packages/dashboard/ packages/dashboard/

# Build args for Vite env vars (baked in at build time)
ARG VITE_ENGINE_URL=http://localhost:3001
ARG VITE_SUPABASE_URL=
ARG VITE_SUPABASE_ANON_KEY=

ENV VITE_ENGINE_URL=$VITE_ENGINE_URL
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

# Build
RUN pnpm --filter @yokebot/dashboard build

# Serve with nginx
FROM nginx:alpine

# Copy built files
COPY --from=build /app/packages/dashboard/dist /usr/share/nginx/html

# SPA fallback — all routes serve index.html
RUN printf 'server {\n  listen 80;\n  root /usr/share/nginx/html;\n  index index.html;\n  location / {\n    try_files $uri $uri/ /index.html;\n  }\n}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
