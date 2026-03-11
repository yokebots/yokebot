# Contributing to YokeBot

Thanks for your interest in contributing to YokeBot! This guide will help you get set up and submit your first pull request.

## Prerequisites

- [Node.js](https://nodejs.org/) v20+
- [pnpm](https://pnpm.io/) v9+
- [Docker](https://www.docker.com/) (for running Postgres locally)
- A [Supabase](https://supabase.com/) project (free tier works)

## Development Setup

```bash
# Clone the repo
git clone https://github.com/yokebots/yokebot.git
cd yokebot

# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env
# Edit .env with your Supabase credentials, database URL, and LLM API keys
```

## Running Locally

Start the engine and dashboard in separate terminals:

```bash
# Terminal 1 — Engine (API server)
pnpm --filter @yokebot/engine dev

# Terminal 2 — Dashboard (React app)
pnpm --filter @yokebot/dashboard dev
```

The dashboard runs at `http://localhost:3000` and the engine at `http://localhost:3001`.

## Project Structure

```
yokebot/
├── packages/
│   ├── engine/          # Express 5 API server + agent runtime
│   │   └── src/
│   │       ├── routes/  # API endpoints
│   │       ├── agents/  # Agent execution logic
│   │       └── db/      # Database queries + migrations
│   └── dashboard/       # React 19 + Vite frontend
│       └── src/
│           ├── components/
│           ├── pages/
│           └── lib/
├── skills/              # First-party agent skills (SKILL.md + handlers)
├── ee/                  # Enterprise features (separate license)
├── supabase/            # Supabase migrations + config
└── docker-compose.yml   # Self-hosted deployment
```

## Making Changes

1. **Create a branch** from `main`:
   ```bash
   git checkout -b feat/your-feature
   # or: fix/your-bugfix
   ```

2. **Make your changes** — keep commits focused and atomic.

3. **Test your changes** — make sure the engine builds cleanly:
   ```bash
   pnpm --filter @yokebot/engine build
   ```

4. **Submit a pull request** against `main`.

## Pull Request Guidelines

- **Branch naming:** `feat/description`, `fix/description`, or `docs/description`
- **Keep PRs focused** — one feature or fix per PR
- **Write a clear description** explaining what changed and why
- **Include screenshots** for UI changes
- **Don't break existing functionality** — test before submitting

## What to Contribute

Here are some great ways to get started:

- **Bug fixes** — Check [open issues](https://github.com/yokebots/yokebot/issues?q=is%3Aissue+is%3Aopen+label%3Abug)
- **New skills** — Add agent capabilities in `skills/`
- **Documentation** — Improve docs, fix typos, add examples
- **UI improvements** — Better components, accessibility, responsive design
- **Tests** — Expand test coverage

## Code of Conduct

Be respectful, constructive, and inclusive. We're building something cool together.

## Questions?

- Open a [GitHub Discussion](https://github.com/yokebots/yokebot/discussions)
- Join our [Discord](https://discord.gg/kqfFr87KqV)
