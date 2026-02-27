# YokeBot

Agent orchestration with team chat, task management, and approval system — the operating system for your AI-powered business.

## What is YokeBot?

YokeBot is an open-source AI agent workforce platform. Deploy a team of AI agents, give them jobs, tools, and channels — then manage them from a visual dashboard like real employees.

**Key features:**
- Visual dashboard for non-developers
- Built-in team chat + task management (Mission Control)
- Universal credit system for all usage (LLM, media, skills)
- Star-rated model catalog (12+ models)
- Skills marketplace with SKILL.md format
- Container isolation (Docker per agent)
- Model-agnostic — bring your own keys or use YokeBot credits
- Proactive agents that think, suggest, and initiate
- Approval queue for high-risk agent actions
- Billing & subscription system with Stripe integration

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
| **Cost** | Free forever | From $29/mo |
| **Models** | Bring your own keys | Universal credits (pay per use) |
| **Docker** | You manage | We manage |
| **Setup** | Developer-friendly | One-click |

**Self-host:** Run YokeBot on your own hardware with your own API keys. Full privacy, full control.

**Cloud:** [yokebot.com](https://yokebot.com) — we handle everything. Pick a plan, deploy agents, done.

## Skills

YokeBot uses a `SKILL.md` format for defining agent capabilities. Skills are plain Markdown files that describe tools, parameters, and handlers. Bundled skills include web search, Slack notifications, code interpreter, and Google Sheets integration.

## License

- Core platform: [AGPLv3](LICENSE)
- `/ee` directory: [YokeBot Enterprise License](ee/LICENSE)
- SDKs and client libraries: MIT

## Links

- Website: [yokebot.com](https://yokebot.com)
- GitHub: [github.com/yokebots/yokebot](https://github.com/yokebots/yokebot)
