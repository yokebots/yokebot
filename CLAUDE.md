# YOKEBOT — PUBLIC OPEN SOURCE REPOSITORY

## CRITICAL: This repo is PUBLIC. Everything here is visible to the world.

### NEVER add to this repo:
- `.env` files or API keys/secrets
- Strategy docs or business plans
- Mockups or design files
- Revenue/pricing spreadsheets
- Competitive analysis documents
- Any file from the parent `YokeBot Build/` directory (strategy docs, mockups, etc.)

### Private/proprietary items stay in:
- Local machine: `/Users/jwwolf/Documents/YokeBot/YokeBot Build/STRATEGY DOCS/`
- Local machine: `/Users/jwwolf/Documents/YokeBot/YokeBot Build/MOCKUPS/`
- The `.env` file (gitignored, never committed)

### Repository structure:
- `packages/engine/` — Core agent runtime (AGPLv3)
- `packages/dashboard/` — React dashboard UI (AGPLv3)
- `skills/` — Bundled first-party skills (AGPLv3)
- `ee/` — Enterprise/proprietary features (YokeBot Enterprise License)
- SDKs and client libraries — MIT license

### License:
- Core code: AGPLv3 (see LICENSE)
- `/ee` directory: YokeBot Enterprise License (see ee/LICENSE)
- Future SDKs: MIT

### Tech stack:
- React 19 + TypeScript + Vite + Tailwind CSS v4
- pnpm workspaces (monorepo)
- Supabase for auth (Google + GitHub OAuth)
- Vercel for dashboard hosting
- Docker for agent container isolation

### GitHub org: yokebots
### Domain: yokebot.com
### Supabase project: rljrhmhminepleixezau
