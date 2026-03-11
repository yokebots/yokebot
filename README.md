<p align="center">
  <img src="assets/logo.png" alt="YokeBot Logo" width="200" />
</p>

<p align="center">
  <img src="assets/banner.jpeg" alt="YokeBot — AI Agent Workforce" width="100%" />
</p>

<h1 align="center">YokeBot</h1>

<p align="center">
  <strong>Deploy a team of AI agents that work together to run your business.</strong>
</p>

<p align="center">
  <a href="https://github.com/yokebots/yokebot/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-AGPLv3-blue.svg" alt="License" /></a>
  <a href="https://github.com/yokebots/yokebot/stargazers"><img src="https://img.shields.io/github/stars/yokebots/yokebot?style=social" alt="Stars" /></a>
  <a href="https://discord.gg/kqfFr87KqV"><img src="https://img.shields.io/badge/Discord-Join-5865F2?logo=discord&logoColor=white" alt="Discord" /></a>
  <a href="https://yokebot.com"><img src="https://img.shields.io/badge/Cloud-yokebot.com-blueviolet" alt="Cloud" /></a>
</p>

<p align="center">
  <a href="https://yokebot.com">Website</a> &middot;
  <a href="https://yokebot.com/docs">Docs</a> &middot;
  <a href="https://discord.gg/kqfFr87KqV">Discord</a> &middot;
  <a href="https://twitter.com/yokebots">Twitter</a>
</p>

---

## What is YokeBot?

YokeBot is an open-source AI agent workforce platform. Create teams of specialized AI agents that collaborate autonomously — handling tasks, meetings, research, writing, analysis, and more — while you stay in control.

Think of it as hiring a team of AI employees that actually work together, share context through a knowledge base, and report back to you.

## Key Features

- **40+ Pre-Built Agents** — Sales, marketing, engineering, HR, finance, legal, ops, and more — ready to deploy in seconds
- **Voice Meetings** — Real-time voice collaboration where agents speak (TTS) and you speak back (STT)
- **Knowledge Base** — Upload documents and agents use them as context via semantic search
- **Task Management** — Assign tasks to agents, track progress, set deadlines
- **Workflows** — Chain agents together into automated multi-step pipelines
- **Data Tables** — Structured data views with sorting, filtering, and export
- **API Keys** — Programmatic access to your agents and data
- **Real-Time Collaboration** — Raise your hand to cut the speaking queue during live meetings
- **Self-Hosted** — Run the entire platform on your own infrastructure
- **Bring Your Own Keys** — Use your own LLM API keys or let us handle it

## Quick Start (Cloud)

The fastest way to get started:

1. **Sign up** at [yokebot.com](https://yokebot.com)
2. **Create a team** and pick from 40+ pre-built agents
3. **Start a meeting** or assign your first task

You get free starter credits to try everything out — no credit card required.

## Quick Start (Self-Hosted)

Run YokeBot on your own infrastructure with Docker:

```bash
# Clone the repo
git clone https://github.com/yokebots/yokebot.git
cd yokebot

# Configure environment
cp .env.example .env
# Edit .env with your API keys and database password

# Start everything
docker compose up -d
```

This starts the engine, dashboard, and a Postgres database with pgvector. Open `http://localhost:3000` to access the dashboard.

See the [Self-Hosted Setup Guide](https://yokebot.com/docs/getting-started/self-hosted) for detailed configuration and environment variables.

## Architecture

```
yokebot/
├── packages/
│   ├── engine/        # Agent runtime — Express 5, TypeScript
│   └── dashboard/     # Web UI — React 19, Vite, Tailwind CSS v4
├── skills/            # First-party agent skills
├── ee/                # Enterprise features
├── supabase/          # Database migrations
└── docker-compose.yml # Self-hosted deployment
```

**Tech stack:**

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4 |
| Backend | Express 5, TypeScript, Node.js |
| Database | PostgreSQL 17 + pgvector |
| Auth | Supabase (Google + GitHub OAuth) |
| Monorepo | pnpm workspaces |

## API

YokeBot exposes a REST API for programmatic access. Generate an API key from your team settings, then:

```bash
curl https://api.yokebot.com/v1/agents \
  -H "Authorization: Bearer yk_your_api_key"
```

See the full [API Reference](https://yokebot.com/docs/api/overview) for all endpoints.

## Documentation

Full documentation is available at **[yokebot.com/docs](https://yokebot.com/docs)**:

- [Getting Started](https://yokebot.com/docs/getting-started)
- [Create Your First Agent](https://yokebot.com/docs/getting-started/first-agent)
- [Self-Hosted Setup](https://yokebot.com/docs/getting-started/self-hosted)
- [Environment Variables](https://yokebot.com/docs/self-hosting/env-vars)
- [API Reference](https://yokebot.com/docs/api/overview)

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for:

- Development environment setup
- Project structure overview
- How to submit pull requests

## License

- **Core** (`packages/engine`, `packages/dashboard`, `skills/`) — [AGPLv3](LICENSE)
- **Enterprise** (`ee/`) — [YokeBot Enterprise License](ee/LICENSE)
- **SDKs & client libraries** — MIT

## Community

- [GitHub Discussions](https://github.com/yokebots/yokebot/discussions) — Questions & ideas
- [Discord](https://discord.gg/kqfFr87KqV) — Chat with the team
- [Twitter](https://twitter.com/yokebots) — Updates & announcements
- [Issues](https://github.com/yokebots/yokebot/issues) — Bug reports & feature requests
