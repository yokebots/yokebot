# YokeBot

Agent orchestration with team chat, task management, and approval system — the operating system for your AI-powered business.

## What is YokeBot?

YokeBot is an open-source AI agent workforce platform. Deploy a team of AI agents, give them jobs, tools, and channels — then manage them from a visual dashboard like real employees.

**Key features:**
- Visual dashboard for non-developers
- Built-in team chat + task management (Mission Control)
- WebMCP-native hybrid browser engine
- Container isolation (Docker per agent)
- Skills-as-configuration (SKILL.md format)
- Model-agnostic (Ollama, DeepInfra, Together, any OpenAI-compatible endpoint)
- Proactive agents that think, suggest, and initiate
- Approval queue for high-risk agent actions

## Quick Start

```bash
git clone https://github.com/yokebots/yokebot.git
cd yokebot
pnpm install
pnpm dev
```

## Self-Host vs Cloud

| | Self-Host (Free) | YokeBot Cloud |
|---|---|---|
| **Cost** | Free forever | From $12/mo |
| **Models** | Bring your own (Ollama, etc.) | Included (flat rate) |
| **Docker** | You manage | We manage |
| **Setup** | Developer-friendly | One-click |

**Self-host:** Run YokeBot on your own hardware with your own models. MIT-level freedom for personal and business use.

**Cloud:** [yokebot.com](https://yokebot.com) — we handle everything. Pick a plan, deploy agents, done.

## License

- Core platform: [AGPLv3](LICENSE)
- `/ee` directory: [YokeBot Enterprise License](ee/LICENSE)
- SDKs and client libraries: MIT

## Links

- Website: [yokebot.com](https://yokebot.com)
- GitHub: [github.com/yokebots/yokebot](https://github.com/yokebots/yokebot)
