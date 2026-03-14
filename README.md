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
  <a href="https://x.com/yokebots">X</a>
</p>

---

## What is YokeBot?

YokeBot is an open-source AI agent workforce platform. Create teams of specialized AI agents that work autonomously: browsing the web, generating media, managing data, assigning & completing tasks. They collaborate in real time with each other and with you.

Think of it as hiring a full team of AI employees that actually get things done. They share files, maintain data tables, browse websites, work within your other software tools, intelligently create images and videos, and more. They all report back to you from one unified workspace.

## Key Features

- **40+ Pre-Built Agents** — Sales, marketing, engineering, HR, finance, legal, ops, and more — ready to deploy in seconds
- **Single Workspace View** — Easily manage dozens of specialist agents from one unified workspace
- **Browser Automation** — Agents browse the web autonomously and take actions just like humans. Fill forms, record data, submit orders, download files, and ask you when they need help
- **Session Vault** — Record logins once with AES-256-GCM encryption, agents reuse them securely
- **Production Workflows** — Multi-step pipelines for image ads and video production with human review gates
- **Image Generation & Editing** — Generate images (Nano Banana 2, Seedream, Flux) with style references, edit existing images (FireRed)
- **Video Generation** — Create video clips with Kling 3.0 and WAN models
- **Knowledge Base** — Agents and humans can read, write, edit, and view shared files with RAG-powered semantic search
- **Task Management** — Assign tasks to agents, track progress, set deadlines, with automatic retry and blocking
- **Data Tables** — Structured CRM and data views with sorting, filtering, drag-and-drop organization, and export
- **Activity Log** — Full audit trail of every agent action, file change, and system event
- **Voice Meetings** — Real-time voice collaboration where agents speak (TTS) and you speak back (STT)
- **Real-Time Collaboration** — Watch agents work live, raise your hand in meetings, take control of browser sessions
- **Self-Hosted** — Run the entire platform on your own infrastructure with Docker Compose in minutes
- **Bring Your Own Keys** — Use your own LLM provider API keys for full control over costs and model selection
- **API Keys** — Programmatic access to your agents and data with scoped permissions

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
| Media | fal.ai (Nano Banana 2, Seedream, Flux, FireRed, Kling 3.0, Wan, Hunyuan, ACE-Step, MireloSFX) |
| Browser | Playwright (headless Chromium) |
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
- [X](https://x.com/yokebots) — Updates & announcements
- [Issues](https://github.com/yokebots/yokebot/issues) — Bug reports & feature requests
