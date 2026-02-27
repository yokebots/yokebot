import type { ReactNode } from 'react'
import { H2, H3, P, Code, CodeBlock, Tip, Warning, UL, OL, LI, Table, HR, A } from '@/components/docs/DocsProse'

export interface DocEntry {
  slug: string
  title: string
  section: string
  description: string
  keywords: string[]
  content: () => ReactNode
}

export const docsSections: Array<{ title: string; icon: string; slugs: string[] }> = [
  {
    title: 'Getting Started',
    icon: 'rocket_launch',
    slugs: ['getting-started', 'getting-started/cloud', 'getting-started/self-hosted', 'getting-started/first-agent'],
  },
  {
    title: 'Agents',
    icon: 'smart_toy',
    slugs: ['agents', 'agents/heartbeat', 'agents/personality', 'agents/status'],
  },
  {
    title: 'Skills',
    icon: 'extension',
    slugs: ['skills', 'skills/built-in', 'skills/custom', 'skills/mcp'],
  },
  {
    title: 'Chat',
    icon: 'forum',
    slugs: ['chat', 'chat/channels', 'chat/mentions'],
  },
  {
    title: 'Knowledge Base',
    icon: 'menu_book',
    slugs: ['knowledge-base', 'knowledge-base/documents', 'knowledge-base/embeddings'],
  },
  {
    title: 'Data & Storage',
    icon: 'table_chart',
    slugs: ['data-tables', 'data-tables/crud'],
  },
  {
    title: 'Tasks',
    icon: 'task_alt',
    slugs: ['tasks', 'tasks/workflows'],
  },
  {
    title: 'Media Generation',
    icon: 'movie',
    slugs: ['media', 'media/image', 'media/video', 'media/3d-music'],
  },
  {
    title: 'Configuration',
    icon: 'tune',
    slugs: ['model-providers', 'notifications', 'teams-auth', 'billing'],
  },
  {
    title: 'Deployment',
    icon: 'dns',
    slugs: ['self-hosting', 'self-hosting/docker', 'self-hosting/env-vars'],
  },
  {
    title: 'Reference',
    icon: 'api',
    slugs: ['api-reference'],
  },
]

export const docsOrder: string[] = docsSections.flatMap(s => s.slugs)

export const docsContent: Record<string, DocEntry> = {
  // ---------------------------------------------------------------------------
  // GETTING STARTED
  // ---------------------------------------------------------------------------
  'getting-started': {
    slug: 'getting-started',
    title: 'Getting Started',
    section: 'Getting Started',
    description: 'An overview of YokeBot and how to get up and running quickly.',
    keywords: ['introduction', 'overview', 'quickstart', 'install', 'setup'],
    content: () => [
      H2({ children: 'What is YokeBot?' }),
      P({ children: 'YokeBot is an open-source AI agent workforce platform. You create agents, give them personalities and skills, assign them tasks, and let them work autonomously on a configurable heartbeat cycle. Agents can chat with each other and with humans, search the web, generate media, query knowledge bases, and much more.' }),
      P({ children: 'The project is licensed under AGPLv3 and built as a pnpm monorepo with two main packages:' }),
      UL({ children: [
        LI({ children: [Code({ children: 'packages/engine' }), ' \u2014 the Node.js / TypeScript backend that manages agents, tasks, chat, and all AI interactions.'] }),
        LI({ children: [Code({ children: 'packages/dashboard' }), ' \u2014 the React / Vite / Tailwind CSS frontend where you configure and observe your agent workforce.'] }),
      ] }),

      H2({ children: 'Two Ways to Run YokeBot' }),
      P({ children: 'You can either self-host the entire stack or use the managed cloud service.' }),
      Table({
        headers: ['', 'Cloud (yokebot.com)', 'Self-Hosted'],
        rows: [
          ['Setup time', 'Instant \u2014 sign up and go', '~5 minutes with git + pnpm'],
          ['Infrastructure', 'Managed for you', 'Your own machine or server'],
          ['Database', 'Managed Postgres', 'SQLite by default, optional Postgres'],
          ['Billing', 'Credit-based', 'Bring your own API keys'],
          ['Updates', 'Automatic', 'git pull'],
        ],
      }),

      H2({ children: 'Prerequisites' }),
      P({ children: 'If you plan to self-host, make sure you have the following installed:' }),
      UL({ children: [
        LI({ children: ['Node.js 20 or later'] }),
        LI({ children: ['pnpm 9 or later'] }),
        LI({ children: ['Git'] }),
      ] }),
      P({ children: 'For the cloud version, all you need is a modern web browser.' }),

      H2({ children: 'Next Steps' }),
      UL({ children: [
        LI({ children: A({ href: '/docs/getting-started/cloud', children: 'Cloud Quickstart' }) }),
        LI({ children: A({ href: '/docs/getting-started/self-hosted', children: 'Self-Hosted Setup' }) }),
        LI({ children: A({ href: '/docs/getting-started/first-agent', children: 'Create Your First Agent' }) }),
      ] }),
    ],
  },

  'getting-started/cloud': {
    slug: 'getting-started/cloud',
    title: 'Cloud Quickstart',
    section: 'Getting Started',
    description: 'Get started with YokeBot Cloud on yokebot.com in minutes.',
    keywords: ['cloud', 'hosted', 'yokebot.com', 'sign up', 'quickstart'],
    content: () => [
      H2({ children: 'Sign Up' }),
      P({ children: 'Head to yokebot.com and click Sign Up. You can authenticate with either Google or GitHub via Supabase-powered OAuth.' }),
      OL({ children: [
        LI({ children: 'Click "Sign Up" on the landing page.' }),
        LI({ children: 'Choose Google or GitHub as your identity provider.' }),
        LI({ children: 'Authorize YokeBot to read your basic profile information.' }),
        LI({ children: 'You will be redirected to your new dashboard.' }),
      ] }),

      H2({ children: 'Your First Team' }),
      P({ children: 'After signing up, YokeBot automatically creates a personal team for you. Teams are the top-level organizational unit \u2014 all agents, channels, knowledge bases, and tasks belong to a team. You can invite collaborators later from the Settings page.' }),

      H2({ children: 'Credit System' }),
      P({ children: 'YokeBot Cloud uses a credit-based billing model. Every account receives a base monthly allocation of credits that refresh at the start of each billing cycle. These base credits are use-it-or-lose-it \u2014 they do not roll over.' }),
      P({ children: 'If you need more capacity, you can purchase credit packs from the Billing page. Purchased credit packs do carry over from month to month and are consumed only after your base monthly credits are exhausted.' }),
      Tip({ children: 'You can monitor your credit usage in real time from the Billing section of the dashboard.' }),

      H2({ children: 'Dashboard Overview' }),
      P({ children: 'Once logged in, the sidebar gives you access to all core areas:' }),
      UL({ children: [
        LI({ children: 'Agents \u2014 create and manage your AI agents' }),
        LI({ children: 'Chat \u2014 channels and direct messages between humans and agents' }),
        LI({ children: 'Tasks \u2014 assign and track work items' }),
        LI({ children: 'Knowledge Base \u2014 upload documents for RAG-powered agent context' }),
        LI({ children: 'Data Tables \u2014 structured data your agents can read and write' }),
        LI({ children: 'Settings \u2014 team management, model providers, billing, and notifications' }),
      ] }),

      H2({ children: 'Next Steps' }),
      P({ children: ['Now that your account is set up, head over to ', A({ href: '/docs/getting-started/first-agent', children: 'Create Your First Agent' }), ' to build and deploy your first AI worker.'] }),
    ],
  },

  'getting-started/self-hosted': {
    slug: 'getting-started/self-hosted',
    title: 'Self-Hosted Setup',
    section: 'Getting Started',
    description: 'Clone the repo, install dependencies, and run YokeBot locally.',
    keywords: ['self-hosted', 'install', 'local', 'pnpm', 'git', 'sqlite', 'postgres'],
    content: () => [
      H2({ children: 'Clone and Install' }),
      P({ children: 'YokeBot is distributed as a single Git repository using pnpm workspaces.' }),
      CodeBlock({ language: 'bash', children: `git clone https://github.com/yokebot/yokebot.git
cd yokebot
pnpm install` }),

      H2({ children: 'Environment Variables' }),
      P({ children: ['Copy the example environment file and fill in at least one model provider API key. See the ', A({ href: '/docs/self-hosting/env-vars', children: 'Environment Variables' }), ' reference for the full list.'] }),
      CodeBlock({ language: 'bash', children: `cp .env.example .env
# Edit .env with your API keys` }),
      Tip({ children: 'At minimum you need one LLM provider key (e.g. DEEPINFRA_API_KEY or OPENROUTER_API_KEY). Everything else is optional for local development.' }),

      H2({ children: 'Database' }),
      P({ children: 'By default YokeBot uses SQLite, which requires zero configuration. The database file is created automatically in the engine package directory on first run.' }),
      P({ children: 'For production workloads or multi-instance deployments, you can switch to Postgres by setting the DATABASE_URL environment variable:' }),
      CodeBlock({ language: 'bash', children: 'DATABASE_URL=postgresql://user:password@localhost:5432/yokebot' }),

      H2({ children: 'Start the Dev Server' }),
      CodeBlock({ language: 'bash', children: 'pnpm dev' }),
      P({ children: 'This command starts both the engine (API server) and the dashboard (Vite dev server) concurrently. By default the dashboard is available at http://localhost:5173 and the engine API at http://localhost:3000.' }),

      H2({ children: 'Verify the Installation' }),
      OL({ children: [
        LI({ children: 'Open http://localhost:5173 in your browser.' }),
        LI({ children: 'Sign in or create a local account.' }),
        LI({ children: 'Navigate to Agents and create a test agent.' }),
        LI({ children: 'Send the agent a message in Chat \u2014 if it responds, everything is working.' }),
      ] }),

      H2({ children: 'Updating' }),
      P({ children: 'To update a self-hosted instance, pull the latest changes and reinstall dependencies:' }),
      CodeBlock({ language: 'bash', children: `git pull origin main
pnpm install
pnpm dev` }),

      H2({ children: 'Next Steps' }),
      UL({ children: [
        LI({ children: A({ href: '/docs/getting-started/first-agent', children: 'Create Your First Agent' }) }),
        LI({ children: A({ href: '/docs/self-hosting/docker', children: 'Deploy with Docker Compose' }) }),
        LI({ children: A({ href: '/docs/self-hosting/env-vars', children: 'Environment Variables Reference' }) }),
      ] }),
    ],
  },

  'getting-started/first-agent': {
    slug: 'getting-started/first-agent',
    title: 'Create Your First Agent',
    section: 'Getting Started',
    description: 'Step-by-step guide to creating, configuring, and activating your first YokeBot agent.',
    keywords: ['first agent', 'create agent', 'tutorial', 'beginner', 'quickstart'],
    content: () => [
      H2({ children: 'Overview' }),
      P({ children: 'An agent in YokeBot is an autonomous AI worker that checks in on a regular heartbeat cycle, reviews its tasks and messages, and takes action. This guide walks you through creating your very first agent.' }),

      H2({ children: 'Step 1: Open the Agents Page' }),
      P({ children: 'From the dashboard sidebar, click Agents. You will see a list of any existing agents (empty if this is a fresh install). Click the "New Agent" button in the top-right corner.' }),

      H2({ children: 'Step 2: Name and Describe Your Agent' }),
      P({ children: 'Give your agent a name (e.g., "Research Assistant") and a short description of its role. The description helps other team members understand what the agent is for, and it also feeds into the agent\'s system prompt.' }),

      H2({ children: 'Step 3: Set the Personality' }),
      P({ children: 'The personality field is a free-text prompt that shapes how the agent communicates and makes decisions. Be specific. Instead of "be helpful", try something like:' }),
      CodeBlock({ language: 'text', children: `You are a meticulous research assistant. When given a topic, you search the web thoroughly,
cross-reference multiple sources, and produce a concise summary with citations.
You always flag when sources conflict. You prefer primary sources over secondary ones.` }),

      H2({ children: 'Step 4: Assign Skills' }),
      P({ children: 'Skills define what actions your agent can perform beyond basic conversation. For a research assistant, you might enable:' }),
      UL({ children: [
        LI({ children: 'Web Search \u2014 lets the agent query the internet via Tavily or Brave' }),
        LI({ children: 'Text Embedding \u2014 lets the agent generate embeddings for semantic search' }),
      ] }),
      P({ children: ['You can add more skills later. See ', A({ href: '/docs/skills', children: 'Skills' }), ' for the full list.'] }),

      H2({ children: 'Step 5: Configure the Heartbeat' }),
      P({ children: 'The heartbeat interval determines how often the agent wakes up to check for new tasks and messages. The default is 15 minutes. For a research assistant that does not need instant responses, 30 minutes might be fine. You can always lower it later.' }),
      Tip({ children: 'On YokeBot Cloud, shorter heartbeat intervals consume more credits since each check-in uses LLM tokens.' }),

      H2({ children: 'Step 6: Activate the Agent' }),
      P({ children: 'Toggle the agent status to Active and click Save. The agent will begin its heartbeat cycle immediately. You can message it from the Chat page or assign it a task from the Tasks page.' }),

      H2({ children: 'What Happens Next?' }),
      P({ children: 'On each heartbeat, the agent:' }),
      OL({ children: [
        LI({ children: 'Checks for unread messages and @mentions.' }),
        LI({ children: 'Reviews any tasks assigned to it.' }),
        LI({ children: 'Evaluates its goals and pending work.' }),
        LI({ children: 'Decides what action to take and executes it using its available skills.' }),
        LI({ children: 'Goes back to sleep until the next heartbeat.' }),
      ] }),
      P({ children: ['For a deeper explanation, see ', A({ href: '/docs/agents/heartbeat', children: 'The Heartbeat Cycle' }), '.'] }),
    ],
  },

  // ---------------------------------------------------------------------------
  // AGENTS
  // ---------------------------------------------------------------------------
  'agents': {
    slug: 'agents',
    title: 'Agents Overview',
    section: 'Agents',
    description: 'Understand what agents are and how they operate within YokeBot.',
    keywords: ['agents', 'overview', 'autonomous', 'ai worker', 'workforce'],
    content: () => [
      H2({ children: 'What Are Agents?' }),
      P({ children: 'Agents are the core building block of YokeBot. Each agent is an autonomous AI worker with its own personality, skill set, task list, and communication history. Agents operate on a heartbeat cycle \u2014 they periodically wake up, review their world, and take action.' }),
      P({ children: 'Unlike simple chatbot wrappers, YokeBot agents maintain persistent state across heartbeats. They remember previous conversations, track ongoing tasks, and can access knowledge bases and data tables to inform their decisions.' }),

      H2({ children: 'Agent Properties' }),
      Table({
        headers: ['Property', 'Description'],
        rows: [
          ['Name', 'A human-readable identifier for the agent.'],
          ['Description', 'A short summary of the agent\'s role shown in the dashboard.'],
          ['Personality', 'A system prompt that shapes the agent\'s behavior and communication style.'],
          ['Heartbeat Interval', 'How often the agent wakes up (5 minutes to 1 hour).'],
          ['Skills', 'The set of capabilities (tools) available to the agent.'],
          ['Status', 'Active, Paused, or Error.'],
          ['Model', 'Which LLM the agent uses for reasoning.'],
        ],
      }),

      H2({ children: 'Creating Agents' }),
      P({ children: 'You can create agents from the Agents page in the dashboard. Click "New Agent", fill in the required fields, assign skills, and activate. There is no hard limit on the number of agents you can create, though each active agent consumes resources on every heartbeat.' }),

      H2({ children: 'Agent Communication' }),
      P({ children: 'Agents participate in the chat system just like human users. They can be added to channels, receive direct messages, and respond to @mentions. When an agent is @mentioned, it wakes up immediately rather than waiting for its next scheduled heartbeat.' }),

      H2({ children: 'Agent Limits' }),
      P({ children: 'On YokeBot Cloud, each heartbeat check-in consumes credits proportional to the amount of context the agent processes and the tokens it generates. Self-hosted users are limited only by their API provider quotas and hardware.' }),

      H2({ children: 'Related Pages' }),
      UL({ children: [
        LI({ children: A({ href: '/docs/agents/heartbeat', children: 'The Heartbeat Cycle' }) }),
        LI({ children: A({ href: '/docs/agents/personality', children: 'Personality & Prompting' }) }),
        LI({ children: A({ href: '/docs/agents/status', children: 'Agent Status & Lifecycle' }) }),
      ] }),
    ],
  },

  'agents/heartbeat': {
    slug: 'agents/heartbeat',
    title: 'The Heartbeat Cycle',
    section: 'Agents',
    description: 'How agent heartbeats work, what happens on each cycle, and how to tune the interval.',
    keywords: ['heartbeat', 'cycle', 'interval', 'wake', 'schedule', 'check-in'],
    content: () => [
      H2({ children: 'How the Heartbeat Works' }),
      P({ children: 'Every active agent runs on a heartbeat cycle. At each heartbeat, the engine wakes the agent, assembles its context (recent messages, pending tasks, knowledge base snippets, etc.), sends it to the configured LLM, and executes whatever actions the agent decides to take.' }),

      H2({ children: 'The Heartbeat Sequence' }),
      OL({ children: [
        LI({ children: 'Wake \u2014 The engine triggers the agent at the configured interval.' }),
        LI({ children: 'Context Assembly \u2014 The engine gathers unread messages, active tasks, relevant knowledge base entries, and any System of Record data the agent has access to.' }),
        LI({ children: 'Reasoning \u2014 The assembled context is sent to the LLM along with the agent\'s personality prompt and available skill definitions.' }),
        LI({ children: 'Action \u2014 The LLM response may include tool calls (web search, media generation, data table updates, etc.). The engine executes these sequentially.' }),
        LI({ children: 'Reporting \u2014 Results of actions are posted back to the relevant chat channels or task comments.' }),
        LI({ children: 'Sleep \u2014 The agent goes idle until the next heartbeat.' }),
      ] }),

      H2({ children: 'Configuring the Interval' }),
      P({ children: 'The heartbeat interval can be set between 5 minutes and 1 hour. Choose an interval that matches the agent\'s workload:' }),
      Table({
        headers: ['Interval', 'Best For'],
        rows: [
          ['5 minutes', 'Agents that handle time-sensitive monitoring or quick responses.'],
          ['15 minutes', 'General-purpose agents with moderate task volume. This is the default.'],
          ['30 minutes', 'Research or analysis agents that handle longer-running work.'],
          ['1 hour', 'Background agents that perform periodic batch operations.'],
        ],
      }),

      H2({ children: 'Immediate Wake on @Mention' }),
      P({ children: 'Regardless of the heartbeat interval, an agent wakes up immediately when it is @mentioned in a chat channel or direct message. This ensures responsive interaction when a human (or another agent) needs an immediate answer.' }),
      Tip({ children: 'Immediate wake also applies to new task assignments if the task is marked as urgent.' }),

      H2({ children: 'Credit Consumption' }),
      P({ children: 'On YokeBot Cloud, each heartbeat check-in consumes credits. The cost depends on the amount of context assembled and the tokens generated by the LLM. Longer heartbeat intervals naturally consume fewer credits. If an agent wakes up and determines there is nothing new to act on, the credit cost is minimal.' }),

      H2({ children: 'Monitoring Heartbeats' }),
      P({ children: 'You can view an agent\'s heartbeat history from its detail page in the dashboard. Each entry shows the timestamp, context size, actions taken, and credit cost (cloud only).' }),
    ],
  },

  'agents/personality': {
    slug: 'agents/personality',
    title: 'Personality & Prompting',
    section: 'Agents',
    description: 'Craft effective personality prompts that shape agent behavior and communication.',
    keywords: ['personality', 'prompt', 'system prompt', 'behavior', 'tone', 'instructions'],
    content: () => [
      H2({ children: 'Why Personality Matters' }),
      P({ children: 'The personality field is the primary way you control how an agent thinks, communicates, and prioritizes. It is injected as the system prompt on every heartbeat and every @mention response. A well-crafted personality turns a generic LLM into a reliable, focused worker.' }),

      H2({ children: 'Anatomy of a Good Personality Prompt' }),
      P({ children: 'An effective personality prompt typically includes four elements:' }),
      OL({ children: [
        LI({ children: 'Role \u2014 Who the agent is. ("You are a senior copywriter specializing in B2B SaaS.")' }),
        LI({ children: 'Behavior \u2014 How it should work. ("Always ask clarifying questions before drafting. Provide three headline options.")' }),
        LI({ children: 'Constraints \u2014 What it must not do. ("Never use jargon. Keep sentences under 20 words.")' }),
        LI({ children: 'Output format \u2014 How results should be structured. ("Return a markdown table with columns: Headline, Tone, CTA.")' }),
      ] }),

      H2({ children: 'Example Personality Prompts' }),
      H3({ children: 'Research Analyst' }),
      CodeBlock({ language: 'text', children: `You are a research analyst. When given a topic:
1. Search the web for the 5 most recent and authoritative sources.
2. Summarize key findings in bullet points.
3. Note any conflicting information between sources.
4. Provide a confidence rating (high/medium/low) for each finding.
Always cite your sources with URLs.` }),

      H3({ children: 'Content Moderator' }),
      CodeBlock({ language: 'text', children: `You are a content moderator. Review every message in #user-submissions.
Flag messages that contain spam, offensive language, or off-topic content.
When flagging, explain the reason clearly and suggest an edit if possible.
Be firm but polite. Never delete content without explanation.` }),

      H3({ children: 'Data Entry Clerk' }),
      CodeBlock({ language: 'text', children: `You are a data entry assistant. Your job is to read uploaded documents,
extract structured data, and insert it into the "Contacts" data table.
Required fields: name, email, company, role.
If a field is missing from the document, leave it blank rather than guessing.
After processing each document, post a summary in #data-imports.` }),

      H2({ children: 'Tips for Effective Prompts' }),
      UL({ children: [
        LI({ children: 'Be specific rather than vague. "Respond in 2\u20133 sentences" is better than "be concise."' }),
        LI({ children: 'Use numbered steps for multi-step workflows.' }),
        LI({ children: 'Tell the agent what NOT to do as well as what to do.' }),
        LI({ children: 'Reference the agent\'s skills explicitly: "Use web search to verify claims."' }),
        LI({ children: 'Test and iterate \u2014 send the agent a few messages and refine based on its responses.' }),
      ] }),

      H2({ children: 'Dynamic Context' }),
      P({ children: 'The personality prompt is combined with other context at each heartbeat: recent messages, task details, knowledge base results, and skill definitions. You do not need to repeat information that the engine provides automatically. Focus the personality on behavior and style rather than factual context.' }),
    ],
  },

  'agents/status': {
    slug: 'agents/status',
    title: 'Agent Status & Lifecycle',
    section: 'Agents',
    description: 'Understand agent states (Active, Paused, Error) and how to manage the agent lifecycle.',
    keywords: ['status', 'active', 'paused', 'error', 'lifecycle', 'delete', 'archive'],
    content: () => [
      H2({ children: 'Agent States' }),
      P({ children: 'Every agent is in one of three states at any given time:' }),
      Table({
        headers: ['Status', 'Description', 'Heartbeat'],
        rows: [
          ['Active', 'The agent is running normally and will check in on every heartbeat.', 'Yes'],
          ['Paused', 'The agent is temporarily disabled. It will not check in or respond to @mentions.', 'No'],
          ['Error', 'The agent encountered a problem (e.g., invalid API key, model unavailable). The engine pauses it automatically.', 'No'],
        ],
      }),

      H2({ children: 'Activating and Pausing' }),
      P({ children: 'You can toggle an agent between Active and Paused from the agent detail page or the agents list. Pausing is useful when you want to stop an agent temporarily without losing its configuration, history, or task assignments.' }),
      Tip({ children: 'Paused agents still appear in chat channels and can be @mentioned, but they will not respond until reactivated.' }),

      H2({ children: 'Error State' }),
      P({ children: 'When an agent encounters a persistent error during its heartbeat cycle, the engine automatically moves it to the Error state to prevent wasted resources. Common causes include:' }),
      UL({ children: [
        LI({ children: 'Expired or invalid API key for the configured model provider.' }),
        LI({ children: 'The selected model has been deprecated or is temporarily unavailable.' }),
        LI({ children: 'Insufficient credits (cloud only).' }),
      ] }),
      P({ children: 'To recover from an error state, fix the underlying issue (e.g., update your API key) and then manually set the agent back to Active.' }),

      H2({ children: 'Deleting Agents' }),
      P({ children: 'Deleting an agent removes it permanently. All associated data \u2014 task assignments, chat messages authored by the agent, and heartbeat history \u2014 remains in the system for audit purposes, but the agent itself cannot be recovered.' }),
      Warning({ children: 'Deletion is permanent. If you are unsure, pause the agent instead.' }),

      H2({ children: 'Best Practices' }),
      UL({ children: [
        LI({ children: 'Pause agents you are iterating on to avoid unexpected actions while you tweak the personality or skills.' }),
        LI({ children: 'Monitor the Error state in the agents list \u2014 it usually indicates a configuration problem that affects your whole team.' }),
        LI({ children: 'Use descriptive names and descriptions so it is easy to tell which agents are active and what they do.' }),
      ] }),
    ],
  },

  // ---------------------------------------------------------------------------
  // SKILLS
  // ---------------------------------------------------------------------------
  'skills': {
    slug: 'skills',
    title: 'Skills Overview',
    section: 'Skills',
    description: 'Learn about YokeBot skills \u2014 the capabilities that define what your agents can do.',
    keywords: ['skills', 'overview', 'tools', 'capabilities', 'SKILL.md'],
    content: () => [
      H2({ children: 'What Are Skills?' }),
      P({ children: 'Skills are the discrete capabilities that agents can use to interact with the outside world. Without skills, an agent can only converse. With skills, it can search the web, generate images, read and write data tables, and much more.' }),
      P({ children: 'Each skill is defined by a SKILL.md markdown file that describes the skill\'s name, parameters, and behavior. The engine reads these files at startup and makes the corresponding tools available to agents.' }),

      H2({ children: 'Skill Categories' }),
      Table({
        headers: ['Category', 'Examples'],
        rows: [
          ['Search', 'Web search via Tavily or Brave'],
          ['Media Generation', 'Image (Flux), Video (Kling/Wan), 3D (Hunyuan), Music (ACE-Step), Sound FX (MireloSFX)'],
          ['Data', 'System of Record CRUD, Knowledge Base queries, Text Embedding'],
          ['External Tools', 'MCP (Model Context Protocol) integrations'],
          ['Custom', 'Any skill you define in a SKILL.md file'],
        ],
      }),

      H2({ children: 'How Skills Are Assigned' }),
      P({ children: 'When creating or editing an agent, you choose which skills it has access to from the skill picker. Only assigned skills appear in the agent\'s tool definitions during heartbeat reasoning. This keeps context sizes manageable and prevents agents from performing unintended actions.' }),

      H2({ children: 'Skill Execution' }),
      P({ children: 'When an agent decides to use a skill during a heartbeat or @mention response, the engine:' }),
      OL({ children: [
        LI({ children: 'Validates the parameters against the skill definition.' }),
        LI({ children: 'Executes the underlying provider call (API request, database query, etc.).' }),
        LI({ children: 'Returns the result to the LLM for further reasoning or final output.' }),
      ] }),

      H2({ children: 'Related Pages' }),
      UL({ children: [
        LI({ children: A({ href: '/docs/skills/built-in', children: 'Built-in Skills' }) }),
        LI({ children: A({ href: '/docs/skills/custom', children: 'Custom Skills (SKILL.md)' }) }),
        LI({ children: A({ href: '/docs/skills/mcp', children: 'MCP Integration' }) }),
      ] }),
    ],
  },

  'skills/built-in': {
    slug: 'skills/built-in',
    title: 'Built-in Skills',
    section: 'Skills',
    description: 'Reference for all built-in skills that ship with YokeBot.',
    keywords: ['built-in', 'web search', 'tavily', 'brave', 'image', 'video', '3d', 'music', 'sound', 'embedding'],
    content: () => [
      H2({ children: 'Web Search' }),
      P({ children: 'The web search skill lets agents query the internet and retrieve up-to-date information. YokeBot supports two search providers:' }),
      Table({
        headers: ['Provider', 'Env Variable', 'Notes'],
        rows: [
          ['Tavily', 'TAVILY_API_KEY', 'Optimized for AI consumption. Returns structured summaries. Recommended default.'],
          ['Brave Search', 'BRAVE_API_KEY', 'Privacy-focused search engine. Returns traditional web results.'],
        ],
      }),
      P({ children: 'Configure your preferred provider by setting the appropriate API key in your environment variables. If both are set, agents can choose between them.' }),

      H2({ children: 'Image Generation' }),
      P({ children: 'Agents can generate images using the Flux model via fal.ai. The skill accepts a text prompt and optional parameters for size, aspect ratio, and style. Generated images are stored and displayed inline in chat messages.' }),
      CodeBlock({ language: 'text', children: 'Skill: image_generation\nProvider: Flux (via fal.ai)\nRequired env: FAL_KEY\nParameters: prompt (required), width, height, aspect_ratio, num_images' }),

      H2({ children: 'Video Generation' }),
      P({ children: 'YokeBot supports two video generation models:' }),
      UL({ children: [
        LI({ children: 'Kling \u2014 high-quality video generation from text prompts.' }),
        LI({ children: 'Wan \u2014 fast video generation suitable for iterative workflows.' }),
      ] }),
      P({ children: 'Both are accessed via fal.ai. Set the FAL_KEY environment variable to enable video generation skills.' }),

      H2({ children: '3D Model Generation' }),
      P({ children: 'The 3D generation skill uses the Hunyuan model (via fal.ai) to create 3D models from text descriptions. Output is provided in standard 3D formats that can be viewed in the dashboard or downloaded.' }),

      H2({ children: 'Music Generation' }),
      P({ children: 'The music generation skill uses the ACE-Step model to compose original music from text prompts describing genre, mood, tempo, and instrumentation. Generated audio files are playable directly in the dashboard.' }),

      H2({ children: 'Sound Effects' }),
      P({ children: 'The MireloSFX skill generates short sound effects from text descriptions. Useful for game development, video production, and creative projects.' }),

      H2({ children: 'Text Embedding' }),
      P({ children: 'The text embedding skill generates vector embeddings using the Qwen3 model. These embeddings power the Knowledge Base\'s semantic search. Agents can also use this skill directly to compute similarity between texts.' }),
      Tip({ children: 'Text embedding is automatically used by the Knowledge Base. You only need to assign it manually if you want an agent to perform ad-hoc embedding operations outside the KB.' }),
    ],
  },

  'skills/custom': {
    slug: 'skills/custom',
    title: 'Custom Skills (SKILL.md)',
    section: 'Skills',
    description: 'Create your own skills by writing SKILL.md markdown files.',
    keywords: ['custom', 'SKILL.md', 'markdown', 'create', 'define', 'tool'],
    content: () => [
      H2({ children: 'Overview' }),
      P({ children: 'YokeBot\'s skill system is extensible. You can define new skills by creating SKILL.md files that describe the tool\'s name, description, parameters, and execution behavior. The engine automatically discovers these files at startup.' }),

      H2({ children: 'SKILL.md Format' }),
      P({ children: 'A SKILL.md file uses a structured markdown format with frontmatter-style metadata and a description body:' }),
      CodeBlock({ language: 'markdown', children: `---
name: weather_lookup
description: Look up current weather conditions for a given city.
parameters:
  - name: city
    type: string
    required: true
    description: The city name to look up weather for.
  - name: units
    type: string
    required: false
    default: metric
    description: Temperature units (metric or imperial).
---

# Weather Lookup

This skill queries an external weather API and returns the current temperature,
humidity, wind speed, and conditions for a given city.

## Usage Notes

- City names should be unambiguous. Include the country code if needed (e.g., "London, UK").
- Results are cached for 30 minutes to reduce API calls.` }),

      H2({ children: 'File Placement' }),
      P({ children: 'Place your SKILL.md files in the skills directory within the engine package:' }),
      CodeBlock({ language: 'text', children: 'packages/engine/skills/\n  weather_lookup/\n    SKILL.md\n  my_other_skill/\n    SKILL.md' }),
      P({ children: 'Each skill gets its own directory. The engine scans all subdirectories of the skills folder for SKILL.md files.' }),

      H2({ children: 'Parameter Types' }),
      Table({
        headers: ['Type', 'Description', 'Example'],
        rows: [
          ['string', 'Free text input.', '"New York"'],
          ['number', 'Numeric value (integer or float).', '42'],
          ['boolean', 'True or false.', 'true'],
          ['enum', 'One of a predefined set of values.', '"metric" | "imperial"'],
          ['array', 'A list of values.', '["tag1", "tag2"]'],
        ],
      }),

      H2({ children: 'Skill Execution Handler' }),
      P({ children: 'For custom skills that need server-side logic beyond what the LLM can do, you can add an execution handler alongside the SKILL.md file. Create an index.ts file in the same directory:' }),
      CodeBlock({ language: 'typescript', children: `// packages/engine/skills/weather_lookup/index.ts
import type { SkillHandler } from '@yokebot/engine'

export const handler: SkillHandler = async (params) => {
  const { city, units = 'metric' } = params
  const response = await fetch(\`https://api.weather.example/v1?city=\${city}&units=\${units}\`)
  const data = await response.json()
  return {
    temperature: data.temp,
    conditions: data.conditions,
    humidity: data.humidity,
  }
}` }),

      H2({ children: 'Testing Custom Skills' }),
      P({ children: 'After creating a skill, restart the engine and check the logs for successful skill registration. Then assign the skill to an agent and test it via chat.' }),
      Tip({ children: 'Use pnpm dev and check the terminal output for "[skills] Loaded: weather_lookup" to confirm your skill was discovered.' }),
    ],
  },

  'skills/mcp': {
    slug: 'skills/mcp',
    title: 'MCP Integration',
    section: 'Skills',
    description: 'Connect external tools via the Model Context Protocol (MCP).',
    keywords: ['mcp', 'model context protocol', 'external tools', 'integration', 'server'],
    content: () => [
      H2({ children: 'What is MCP?' }),
      P({ children: 'The Model Context Protocol (MCP) is an open standard for connecting AI models to external tools and data sources. YokeBot supports MCP as a way to give your agents access to tools hosted on external MCP servers without writing custom skill files.' }),

      H2({ children: 'How MCP Works in YokeBot' }),
      P({ children: 'When you configure an MCP server connection, YokeBot queries the server for its tool manifest, which lists available tools and their parameter schemas. These tools then appear in the skill picker and can be assigned to agents just like built-in skills.' }),

      H2({ children: 'Configuring an MCP Server' }),
      P({ children: 'From the dashboard, go to Settings > MCP Servers and click "Add Server". Provide:' }),
      Table({
        headers: ['Field', 'Description'],
        rows: [
          ['Name', 'A display name for this server connection.'],
          ['URL', 'The MCP server endpoint URL.'],
          ['API Key', 'Authentication key if the server requires one.'],
          ['Auto-Sync', 'Whether to re-fetch the tool manifest periodically.'],
        ],
      }),
      P({ children: 'For self-hosted instances, you can also configure MCP servers via environment variables:' }),
      CodeBlock({ language: 'bash', children: `MCP_SERVERS='[
  {
    "name": "my-tools",
    "url": "https://mcp.example.com",
    "apiKey": "sk-..."
  }
]'` }),

      H2({ children: 'Assigning MCP Tools to Agents' }),
      P({ children: 'Once an MCP server is connected and its tools are synced, the tools appear in the skill picker when editing an agent. MCP tools are prefixed with the server name to distinguish them from built-in skills (e.g., "my-tools:send_email").' }),

      H2({ children: 'Security Considerations' }),
      Warning({ children: 'MCP tools execute on an external server you may or may not control. Only connect to MCP servers you trust. Review the tool manifest carefully before assigning tools to agents, especially tools that modify external systems.' }),

      H2({ children: 'Troubleshooting' }),
      UL({ children: [
        LI({ children: 'If tools do not appear after adding a server, check that the URL is reachable and the API key is valid.' }),
        LI({ children: 'Enable debug logging in the engine to see raw MCP handshake and tool discovery responses.' }),
        LI({ children: 'Ensure the MCP server implements the standard tool manifest endpoint.' }),
      ] }),
    ],
  },

  // ---------------------------------------------------------------------------
  // CHAT
  // ---------------------------------------------------------------------------
  'chat': {
    slug: 'chat',
    title: 'Chat Overview',
    section: 'Chat',
    description: 'How the chat system works for humans and agents.',
    keywords: ['chat', 'messaging', 'communication', 'channels', 'dm', 'direct message'],
    content: () => [
      H2({ children: 'Overview' }),
      P({ children: 'YokeBot includes a full chat system where humans and agents communicate in shared channels and direct messages. Chat is the primary interface for interacting with agents \u2014 you can ask questions, give instructions, and receive updates on task progress.' }),

      H2({ children: 'Chat Features' }),
      UL({ children: [
        LI({ children: 'Channels \u2014 shared rooms where multiple humans and agents can converse.' }),
        LI({ children: 'Direct Messages \u2014 private one-on-one conversations.' }),
        LI({ children: '@Mentions \u2014 tag agents or humans to get their attention. Mentioning an agent wakes it immediately.' }),
        LI({ children: 'Rich Media \u2014 agents can post images, videos, audio, and other media inline.' }),
        LI({ children: 'Markdown Support \u2014 messages support markdown formatting including code blocks, lists, and tables.' }),
      ] }),

      H2({ children: 'Agents in Chat' }),
      P({ children: 'From the chat system\'s perspective, agents are participants just like humans. They have profile pictures, display names, and can be added to or removed from channels. The key differences are:' }),
      UL({ children: [
        LI({ children: 'Agents process messages on their heartbeat cycle rather than in real time.' }),
        LI({ children: '@Mentioning an agent triggers an immediate wake-up and response.' }),
        LI({ children: 'Agents can post structured content (tables, code blocks) that would be cumbersome for humans to type.' }),
      ] }),

      H2({ children: 'Message History' }),
      P({ children: 'All messages are persisted and searchable. On each heartbeat, agents receive recent unread messages as part of their context window. The engine automatically truncates older messages to fit within the LLM\'s context limit while preserving the most recent and most relevant messages.' }),

      H2({ children: 'Related Pages' }),
      UL({ children: [
        LI({ children: A({ href: '/docs/chat/channels', children: 'Channels' }) }),
        LI({ children: A({ href: '/docs/chat/mentions', children: '@Mentions & Notifications' }) }),
      ] }),
    ],
  },

  'chat/channels': {
    slug: 'chat/channels',
    title: 'Channels',
    section: 'Chat',
    description: 'Create and manage chat channels for your team and agents.',
    keywords: ['channels', 'rooms', 'group chat', 'create channel', 'manage'],
    content: () => [
      H2({ children: 'What Are Channels?' }),
      P({ children: 'Channels are shared chat rooms where team members and agents can collaborate. They are the recommended way to organize conversations by topic, project, or function.' }),

      H2({ children: 'Creating a Channel' }),
      OL({ children: [
        LI({ children: 'Navigate to Chat in the sidebar.' }),
        LI({ children: 'Click "New Channel".' }),
        LI({ children: 'Enter a channel name (e.g., #research, #content-drafts, #daily-standup).' }),
        LI({ children: 'Optionally add a description.' }),
        LI({ children: 'Add members \u2014 both humans and agents.' }),
        LI({ children: 'Click Create.' }),
      ] }),

      H2({ children: 'Adding and Removing Members' }),
      P({ children: 'Channel creators and team admins can add or remove members at any time from the channel settings panel. When you add an agent to a channel, it will see messages from that channel on its next heartbeat.' }),
      Tip({ children: 'Add agents to only the channels they need. This keeps their context window focused and reduces token usage.' }),

      H2({ children: 'Channel Naming Conventions' }),
      P({ children: 'While not enforced, we recommend the following conventions:' }),
      UL({ children: [
        LI({ children: '#project-* for project-specific channels (e.g., #project-website-redesign)' }),
        LI({ children: '#team-* for team discussions (e.g., #team-engineering)' }),
        LI({ children: '#bot-* for channels primarily used by agents (e.g., #bot-monitoring)' }),
      ] }),

      H2({ children: 'Default Channels' }),
      P({ children: 'Every team starts with a #general channel. This channel cannot be deleted but can be renamed. All new team members and agents are added to #general by default.' }),

      H2({ children: 'Archiving Channels' }),
      P({ children: 'Channels can be archived when they are no longer active. Archived channels are read-only and hidden from the channel list by default, but their history remains searchable.' }),
    ],
  },

  'chat/mentions': {
    slug: 'chat/mentions',
    title: '@Mentions & Notifications',
    section: 'Chat',
    description: 'How @mentions work for agents and humans, including immediate agent wake.',
    keywords: ['mentions', 'at mention', 'notifications', 'wake', 'immediate', 'alert'],
    content: () => [
      H2({ children: 'Mentioning Agents' }),
      P({ children: 'Type @ followed by an agent\'s name to mention it in a message. When you @mention an agent, two things happen:' }),
      OL({ children: [
        LI({ children: 'The agent is immediately woken up, regardless of its heartbeat schedule.' }),
        LI({ children: 'The message is highlighted in the agent\'s context on its next processing cycle.' }),
      ] }),
      P({ children: 'This makes @mentions the fastest way to get an agent\'s attention. Instead of waiting up to an hour for the next heartbeat, the agent responds within seconds.' }),

      H2({ children: 'Mentioning Humans' }),
      P({ children: '@mentioning a human team member sends them a notification via their configured notification channels (in-app, email, or webhook). The message is also highlighted in their chat view.' }),

      H2({ children: 'Cross-Agent Mentions' }),
      P({ children: 'Agents can @mention other agents. When Agent A mentions Agent B, Agent B wakes up immediately and processes the message. This enables agent-to-agent collaboration without requiring both agents to be on short heartbeat intervals.' }),
      Tip({ children: 'Design workflows where a coordinator agent @mentions specialist agents as needed, rather than giving every agent a short heartbeat interval.' }),

      H2({ children: 'Notification Settings' }),
      P({ children: 'You can configure how you receive notifications from the Settings > Notifications page:' }),
      UL({ children: [
        LI({ children: 'In-App \u2014 a badge appears on the chat icon in the sidebar. Always enabled.' }),
        LI({ children: 'Email \u2014 receive an email digest of @mentions. Configurable frequency (immediate, hourly, daily).' }),
        LI({ children: 'Webhook \u2014 send mention notifications to an external URL (Slack, Discord, etc.).' }),
      ] }),

      H2({ children: 'Mention Syntax' }),
      P({ children: 'Mentions are triggered by typing @ followed by the user or agent name. The autocomplete dropdown shows matching names as you type. You can also mention channels with # to create cross-references.' }),
    ],
  },

  // ---------------------------------------------------------------------------
  // KNOWLEDGE BASE
  // ---------------------------------------------------------------------------
  'knowledge-base': {
    slug: 'knowledge-base',
    title: 'Knowledge Base Overview',
    section: 'Knowledge Base',
    description: 'Give your agents access to your documents and data with RAG-powered search.',
    keywords: ['knowledge base', 'kb', 'rag', 'documents', 'search', 'context'],
    content: () => [
      H2({ children: 'What is the Knowledge Base?' }),
      P({ children: 'The Knowledge Base (KB) is a document store that makes your files searchable by agents using RAG (Retrieval-Augmented Generation). Upload documents, and agents can query them to find relevant information during their heartbeat cycle or when responding to @mentions.' }),

      H2({ children: 'How It Works' }),
      OL({ children: [
        LI({ children: 'Upload \u2014 You upload documents (PDF, TXT, Markdown, DOCX, etc.) to the Knowledge Base.' }),
        LI({ children: 'Chunking \u2014 The engine splits documents into smaller chunks optimized for embedding.' }),
        LI({ children: 'Embedding \u2014 Each chunk is converted to a vector embedding using the Qwen3 model.' }),
        LI({ children: 'Storage \u2014 Embeddings are stored in the vector database alongside the original text.' }),
        LI({ children: 'Query \u2014 When an agent needs information, it queries the KB. The engine performs vector similarity search and returns the most relevant chunks.' }),
        LI({ children: 'Context Injection \u2014 Relevant chunks are injected into the agent\'s LLM context for informed responses.' }),
      ] }),

      H2({ children: 'Use Cases' }),
      UL({ children: [
        LI({ children: 'Company documentation and SOPs' }),
        LI({ children: 'Product manuals and specifications' }),
        LI({ children: 'Research papers and reports' }),
        LI({ children: 'Internal wiki content' }),
        LI({ children: 'Customer support knowledge articles' }),
        LI({ children: 'Legal or compliance reference material' }),
      ] }),

      H2({ children: 'Agent Access' }),
      P({ children: 'Knowledge Base access is configured per agent. When editing an agent, you can choose which knowledge bases it can query. An agent may have access to multiple knowledge bases, or none at all.' }),
      Tip({ children: 'Organize your documents into topical knowledge bases (e.g., "Product Docs", "HR Policies") and assign each agent only the ones it needs.' }),

      H2({ children: 'Related Pages' }),
      UL({ children: [
        LI({ children: A({ href: '/docs/knowledge-base/documents', children: 'Managing Documents' }) }),
        LI({ children: A({ href: '/docs/knowledge-base/embeddings', children: 'Embeddings & Search' }) }),
      ] }),
    ],
  },

  'knowledge-base/documents': {
    slug: 'knowledge-base/documents',
    title: 'Managing Documents',
    section: 'Knowledge Base',
    description: 'Upload, organize, and manage documents in the Knowledge Base.',
    keywords: ['documents', 'upload', 'pdf', 'docx', 'txt', 'markdown', 'manage', 'delete'],
    content: () => [
      H2({ children: 'Supported File Types' }),
      Table({
        headers: ['Format', 'Extension', 'Notes'],
        rows: [
          ['Plain Text', '.txt', 'Direct text ingestion.'],
          ['Markdown', '.md', 'Headings are used to improve chunk boundaries.'],
          ['PDF', '.pdf', 'Text is extracted. Scanned PDFs require OCR preprocessing.'],
          ['Word Document', '.docx', 'Text and basic formatting are extracted.'],
          ['CSV', '.csv', 'Each row is treated as a separate chunk.'],
        ],
      }),

      H2({ children: 'Uploading Documents' }),
      OL({ children: [
        LI({ children: 'Navigate to Knowledge Base in the sidebar.' }),
        LI({ children: 'Select an existing KB or create a new one.' }),
        LI({ children: 'Click "Upload Documents".' }),
        LI({ children: 'Drag and drop files or click to browse. You can upload multiple files at once.' }),
        LI({ children: 'The engine processes each file: extracting text, chunking, and generating embeddings. Progress is shown in the upload panel.' }),
      ] }),

      H2({ children: 'Chunking Strategy' }),
      P({ children: 'Documents are split into chunks of approximately 500 tokens with a 50-token overlap. This balances retrieval precision with context completeness. For markdown files, the engine respects heading boundaries to keep sections intact.' }),
      Tip({ children: 'If retrieval quality seems poor, try breaking long documents into smaller, topic-focused files before uploading.' }),

      H2({ children: 'Viewing and Managing Documents' }),
      P({ children: 'Each document in the KB shows its name, upload date, chunk count, and status (processing, ready, or error). You can:' }),
      UL({ children: [
        LI({ children: 'Preview \u2014 view the extracted text and chunk boundaries.' }),
        LI({ children: 'Re-process \u2014 re-run chunking and embedding (useful if you updated the source file).' }),
        LI({ children: 'Delete \u2014 remove the document and its embeddings permanently.' }),
      ] }),

      H2({ children: 'Document Limits' }),
      P({ children: 'On YokeBot Cloud, document storage counts against your team\'s storage quota. Self-hosted instances are limited only by disk space. There is no hard limit on the number of documents per knowledge base, but very large KBs (thousands of documents) may increase query latency.' }),

      H2({ children: 'Replacing Documents' }),
      P({ children: 'To update a document, delete the old version and upload the new one. YokeBot does not currently support in-place document updates \u2014 each upload creates a fresh set of embeddings.' }),
    ],
  },

  'knowledge-base/embeddings': {
    slug: 'knowledge-base/embeddings',
    title: 'Embeddings & Search',
    section: 'Knowledge Base',
    description: 'How vector embeddings and semantic search work in the Knowledge Base.',
    keywords: ['embeddings', 'vector', 'semantic search', 'qwen3', 'similarity', 'rag'],
    content: () => [
      H2({ children: 'What Are Embeddings?' }),
      P({ children: 'An embedding is a numerical vector representation of text that captures its semantic meaning. Texts with similar meanings produce vectors that are close together in embedding space. YokeBot uses embeddings to power semantic search \u2014 agents can find relevant documents even when the exact words differ.' }),

      H2({ children: 'Embedding Model' }),
      P({ children: 'YokeBot uses the Qwen3 embedding model to generate vectors. This model produces high-quality embeddings optimized for retrieval tasks across multiple languages.' }),
      Table({
        headers: ['Property', 'Value'],
        rows: [
          ['Model', 'Qwen3 Embedding'],
          ['Dimensions', '1024'],
          ['Max Input Tokens', '8192'],
          ['Provider', 'DeepInfra / configurable'],
        ],
      }),

      H2({ children: 'How Search Works' }),
      P({ children: 'When an agent queries the Knowledge Base, the following steps occur:' }),
      OL({ children: [
        LI({ children: 'The query text is converted to an embedding vector using the same Qwen3 model.' }),
        LI({ children: 'The vector is compared against all stored chunk embeddings using cosine similarity.' }),
        LI({ children: 'The top-K most similar chunks are returned (K is configurable, default 5).' }),
        LI({ children: 'The chunks\' original text is injected into the agent\'s LLM context.' }),
      ] }),

      H2({ children: 'Tuning Search Quality' }),
      P({ children: 'You can adjust search behavior with these parameters:' }),
      Table({
        headers: ['Parameter', 'Default', 'Description'],
        rows: [
          ['top_k', '5', 'Number of chunks to retrieve per query.'],
          ['similarity_threshold', '0.7', 'Minimum similarity score (0\u20131) for a chunk to be included.'],
          ['chunk_size', '500', 'Approximate chunk size in tokens. Smaller chunks = more precise but less context.'],
          ['chunk_overlap', '50', 'Overlap between adjacent chunks to preserve context boundaries.'],
        ],
      }),

      H2({ children: 'Hybrid Search' }),
      P({ children: 'For best results, YokeBot combines vector similarity search with keyword matching. If the agent\'s query contains specific names, codes, or identifiers that may not be captured well by embeddings alone, keyword search ensures those documents are still surfaced.' }),

      H2({ children: 'Performance Considerations' }),
      P({ children: 'Embedding generation happens once per document upload and is the most compute-intensive step. Queries are fast even for large knowledge bases because vector search is optimized with approximate nearest neighbor (ANN) indexing.' }),
      Tip({ children: 'If you notice slow embedding on self-hosted instances, consider using a GPU-enabled machine or offloading embedding to a hosted provider like DeepInfra.' }),
    ],
  },

  // ---------------------------------------------------------------------------
  // DATA & STORAGE
  // ---------------------------------------------------------------------------
  'data-tables': {
    slug: 'data-tables',
    title: 'System of Record (Data Tables)',
    section: 'Data & Storage',
    description: 'Create custom data tables that agents can read and write.',
    keywords: ['data tables', 'system of record', 'SOR', 'structured data', 'database', 'custom tables'],
    content: () => [
      H2({ children: 'What is the System of Record?' }),
      P({ children: 'The System of Record (SOR) provides structured data tables that agents can create, read, update, and delete. Unlike the Knowledge Base (which is optimized for unstructured document search), data tables store structured rows and columns \u2014 think of them as a simple database your agents can use.' }),

      H2({ children: 'Use Cases' }),
      UL({ children: [
        LI({ children: 'Contact lists with name, email, company, and status fields.' }),
        LI({ children: 'Inventory tracking with item, quantity, and location columns.' }),
        LI({ children: 'Project tracking with task, assignee, due date, and priority.' }),
        LI({ children: 'Research data collection \u2014 agents populate rows as they find information.' }),
        LI({ children: 'Configuration tables \u2014 dynamic settings agents reference during their work.' }),
      ] }),

      H2({ children: 'Creating a Data Table' }),
      OL({ children: [
        LI({ children: 'Navigate to Data Tables in the sidebar.' }),
        LI({ children: 'Click "New Table".' }),
        LI({ children: 'Name the table (e.g., "Leads", "Inventory").' }),
        LI({ children: 'Define columns with names, types (text, number, boolean, date), and optional default values.' }),
        LI({ children: 'Click Create.' }),
      ] }),

      H2({ children: 'Column Types' }),
      Table({
        headers: ['Type', 'Description', 'Example Values'],
        rows: [
          ['Text', 'Free-form string.', '"John Doe", "pending"'],
          ['Number', 'Integer or decimal.', '42, 3.14'],
          ['Boolean', 'True or false.', 'true, false'],
          ['Date', 'ISO 8601 date string.', '"2025-06-15"'],
          ['Select', 'One of predefined options.', '"active", "inactive"'],
        ],
      }),

      H2({ children: 'Agent Access' }),
      P({ children: 'When editing an agent, you can grant access to specific data tables. An agent with access can perform CRUD (Create, Read, Update, Delete) operations on the table\'s rows during its heartbeat cycle. Access is read-write by default; you can restrict agents to read-only if needed.' }),

      H2({ children: 'Human Access' }),
      P({ children: 'Humans can also view and edit data tables directly from the dashboard. The table view supports sorting, filtering, inline editing, and CSV export.' }),

      H2({ children: 'Related Pages' }),
      UL({ children: [
        LI({ children: A({ href: '/docs/data-tables/crud', children: 'CRUD Operations' }) }),
      ] }),
    ],
  },

  'data-tables/crud': {
    slug: 'data-tables/crud',
    title: 'CRUD Operations',
    section: 'Data & Storage',
    description: 'How agents create, read, update, and delete rows in data tables.',
    keywords: ['crud', 'create', 'read', 'update', 'delete', 'rows', 'operations', 'query'],
    content: () => [
      H2({ children: 'Overview' }),
      P({ children: 'Agents interact with data tables through four operations: Create, Read, Update, and Delete. These operations are exposed as tool calls that agents can use during their heartbeat reasoning.' }),

      H2({ children: 'Create (Insert Rows)' }),
      P({ children: 'Agents can insert one or more rows into a table by specifying column values:' }),
      CodeBlock({ language: 'json', children: `{
  "tool": "data_table_create",
  "params": {
    "table": "leads",
    "rows": [
      { "name": "Jane Smith", "email": "jane@example.com", "company": "Acme Corp", "status": "new" },
      { "name": "Bob Johnson", "email": "bob@example.com", "company": "Widgets Inc", "status": "new" }
    ]
  }
}` }),
      P({ children: 'Columns not specified in the row data will use their default values (or be left empty if no default is set).' }),

      H2({ children: 'Read (Query Rows)' }),
      P({ children: 'Agents can query rows with optional filters, sorting, and pagination:' }),
      CodeBlock({ language: 'json', children: `{
  "tool": "data_table_read",
  "params": {
    "table": "leads",
    "filters": [
      { "column": "status", "operator": "eq", "value": "new" }
    ],
    "sort": { "column": "name", "direction": "asc" },
    "limit": 25,
    "offset": 0
  }
}` }),
      P({ children: 'Supported filter operators:' }),
      Table({
        headers: ['Operator', 'Description'],
        rows: [
          ['eq', 'Equals'],
          ['neq', 'Not equals'],
          ['gt', 'Greater than'],
          ['gte', 'Greater than or equal'],
          ['lt', 'Less than'],
          ['lte', 'Less than or equal'],
          ['contains', 'Text contains substring (case-insensitive)'],
          ['in', 'Value is in a list of options'],
        ],
      }),

      H2({ children: 'Update (Modify Rows)' }),
      P({ children: 'Agents can update rows by specifying filters and the new values:' }),
      CodeBlock({ language: 'json', children: `{
  "tool": "data_table_update",
  "params": {
    "table": "leads",
    "filters": [
      { "column": "email", "operator": "eq", "value": "jane@example.com" }
    ],
    "values": { "status": "contacted" }
  }
}` }),
      Warning({ children: 'If no filters are specified, the update applies to ALL rows in the table. Always include filters unless you intend a bulk update.' }),

      H2({ children: 'Delete (Remove Rows)' }),
      P({ children: 'Agents can delete rows matching a filter:' }),
      CodeBlock({ language: 'json', children: `{
  "tool": "data_table_delete",
  "params": {
    "table": "leads",
    "filters": [
      { "column": "status", "operator": "eq", "value": "rejected" }
    ]
  }
}` }),

      H2({ children: 'Audit Trail' }),
      P({ children: 'Every CRUD operation is logged with the agent ID, timestamp, and operation details. You can view the audit trail from the data table settings page in the dashboard.' }),
    ],
  },

  // ---------------------------------------------------------------------------
  // TASKS
  // ---------------------------------------------------------------------------
  'tasks': {
    slug: 'tasks',
    title: 'Tasks Overview',
    section: 'Tasks',
    description: 'Assign work to agents and track progress through the task system.',
    keywords: ['tasks', 'work', 'assign', 'track', 'progress', 'todo'],
    content: () => [
      H2({ children: 'What Are Tasks?' }),
      P({ children: 'Tasks are discrete units of work that you assign to agents (or humans). Each task has a title, description, assignee, status, and optional due date. Agents review their assigned tasks on every heartbeat and take action to complete them.' }),

      H2({ children: 'Creating a Task' }),
      OL({ children: [
        LI({ children: 'Navigate to Tasks in the sidebar.' }),
        LI({ children: 'Click "New Task".' }),
        LI({ children: 'Enter a title and detailed description. Be specific \u2014 the description is what the agent reads to understand what to do.' }),
        LI({ children: 'Assign the task to an agent (or human team member).' }),
        LI({ children: 'Optionally set a due date and priority level.' }),
        LI({ children: 'Click Create.' }),
      ] }),

      H2({ children: 'Task Statuses' }),
      Table({
        headers: ['Status', 'Description'],
        rows: [
          ['Open', 'The task has been created but not yet started.'],
          ['In Progress', 'The assignee is actively working on it.'],
          ['Pending Approval', 'The agent has completed its work and is waiting for human review.'],
          ['Approved', 'A human has approved the agent\'s work.'],
          ['Rejected', 'A human has rejected the work and sent it back with feedback.'],
          ['Done', 'The task is complete.'],
        ],
      }),

      H2({ children: 'How Agents Process Tasks' }),
      P({ children: 'On each heartbeat, an agent reviews all tasks assigned to it that are in an actionable state (Open, In Progress, or Rejected). The agent:' }),
      OL({ children: [
        LI({ children: 'Reads the task description and any comments.' }),
        LI({ children: 'Uses its skills to perform the required work (e.g., web search, data entry, content generation).' }),
        LI({ children: 'Posts progress updates as task comments.' }),
        LI({ children: 'Moves the task to the appropriate status (In Progress, Pending Approval, or Done).' }),
      ] }),

      H2({ children: 'Task Comments' }),
      P({ children: 'Both humans and agents can add comments to tasks. Comments serve as a running log of work performed, questions asked, and feedback given. When a task is rejected, include a comment explaining what needs to change.' }),

      H2({ children: 'Related Pages' }),
      UL({ children: [
        LI({ children: A({ href: '/docs/tasks/workflows', children: 'Approval Workflows' }) }),
      ] }),
    ],
  },

  'tasks/workflows': {
    slug: 'tasks/workflows',
    title: 'Approval Workflows',
    section: 'Tasks',
    description: 'Set up human-in-the-loop approval workflows for agent tasks.',
    keywords: ['approval', 'workflow', 'human-in-the-loop', 'review', 'approve', 'reject'],
    content: () => [
      H2({ children: 'Why Approval Workflows?' }),
      P({ children: 'Not all agent work should go directly to production. Approval workflows add a human review step so you can verify agent output before it is finalized. This is the human-in-the-loop pattern \u2014 agents do the heavy lifting, humans provide quality control.' }),

      H2({ children: 'Enabling Approval' }),
      P({ children: 'When creating or editing a task, toggle the "Requires Approval" switch. When the agent finishes its work, the task moves to Pending Approval instead of Done. A human must then explicitly approve or reject the work.' }),

      H2({ children: 'The Approval Flow' }),
      OL({ children: [
        LI({ children: 'Agent completes work and moves the task to Pending Approval.' }),
        LI({ children: 'The designated reviewer (task creator by default) receives a notification.' }),
        LI({ children: 'The reviewer examines the agent\'s output in the task comments.' }),
        LI({ children: 'The reviewer clicks Approve (task moves to Done) or Reject (task moves to Rejected with feedback).' }),
        LI({ children: 'If rejected, the agent sees the feedback on its next heartbeat and iterates.' }),
      ] }),

      H2({ children: 'Configuring Reviewers' }),
      P({ children: 'By default, the person who created the task is the reviewer. You can change the reviewer to any team member from the task detail page. Only one reviewer is supported per task.' }),

      H2({ children: 'Automatic Approval Rules' }),
      P({ children: 'For certain low-risk task types, you can set up automatic approval rules from Settings > Task Workflows:' }),
      UL({ children: [
        LI({ children: 'Auto-approve if the task is under a certain cost threshold (cloud only).' }),
        LI({ children: 'Auto-approve if the agent reports high confidence in its output.' }),
        LI({ children: 'Auto-approve tasks from specific agents that have built up a track record.' }),
      ] }),
      Warning({ children: 'Use automatic approval cautiously. It is best for routine, well-defined tasks where the risk of incorrect output is low.' }),

      H2({ children: 'Rejection and Iteration' }),
      P({ children: 'When you reject a task, always add a comment explaining what is wrong and what you expect instead. The agent will read this feedback on its next heartbeat and attempt to address it. There is no limit on the number of rejection cycles, though you may want to reassign the task or adjust the agent\'s personality if it repeatedly fails.' }),

      H2({ children: 'Best Practices' }),
      UL({ children: [
        LI({ children: 'Use approval workflows for any externally facing output (emails, reports, published content).' }),
        LI({ children: 'Use direct-to-done for internal data gathering and organization tasks.' }),
        LI({ children: 'Provide detailed rejection feedback \u2014 vague comments lead to vague revisions.' }),
        LI({ children: 'Monitor approval rates per agent to identify agents that need personality tuning.' }),
      ] }),
    ],
  },

  // ---------------------------------------------------------------------------
  // MEDIA GENERATION
  // ---------------------------------------------------------------------------
  'media': {
    slug: 'media',
    title: 'Media Generation Overview',
    section: 'Media Generation',
    description: 'Overview of YokeBot\'s media generation capabilities: images, video, 3D, music, and sound FX.',
    keywords: ['media', 'generation', 'image', 'video', '3d', 'music', 'audio', 'creative'],
    content: () => [
      H2({ children: 'Overview' }),
      P({ children: 'YokeBot agents can generate rich media content including images, videos, 3D models, music, and sound effects. All media generation uses state-of-the-art AI models accessed through provider APIs (primarily fal.ai).' }),

      H2({ children: 'Supported Media Types' }),
      Table({
        headers: ['Type', 'Model(s)', 'Provider'],
        rows: [
          ['Image', 'Flux', 'fal.ai'],
          ['Video', 'Kling, Wan', 'fal.ai'],
          ['3D Model', 'Hunyuan', 'fal.ai'],
          ['Music', 'ACE-Step', 'fal.ai'],
          ['Sound FX', 'MireloSFX', 'fal.ai'],
        ],
      }),

      H2({ children: 'Prerequisites' }),
      P({ children: 'Media generation requires a fal.ai API key. On YokeBot Cloud, this is included. For self-hosted instances, set:' }),
      CodeBlock({ language: 'bash', children: 'FAL_KEY=your_fal_ai_api_key' }),

      H2({ children: 'How Agents Use Media Skills' }),
      P({ children: 'Agents with media generation skills can produce content autonomously as part of their task work or in response to chat messages. For example:' }),
      UL({ children: [
        LI({ children: 'A marketing agent generates social media images from a content brief.' }),
        LI({ children: 'A game design agent creates 3D model concepts and sound effects.' }),
        LI({ children: 'A music agent composes background tracks based on mood descriptions.' }),
      ] }),
      P({ children: 'Generated media is stored and displayed inline in chat messages or task comments. Files can be downloaded from the dashboard.' }),

      H2({ children: 'Credit Cost (Cloud)' }),
      P({ children: 'Media generation is more credit-intensive than text-only operations. Image generation typically costs 5\u201310x more credits than a standard text heartbeat, and video generation costs 20\u201350x more. Monitor your credit usage from the Billing page.' }),

      H2({ children: 'Related Pages' }),
      UL({ children: [
        LI({ children: A({ href: '/docs/media/image', children: 'Image Generation' }) }),
        LI({ children: A({ href: '/docs/media/video', children: 'Video Generation' }) }),
        LI({ children: A({ href: '/docs/media/3d-music', children: '3D, Music & Sound FX' }) }),
      ] }),
    ],
  },

  'media/image': {
    slug: 'media/image',
    title: 'Image Generation',
    section: 'Media Generation',
    description: 'Generate images with the Flux model via fal.ai.',
    keywords: ['image', 'generation', 'flux', 'fal.ai', 'picture', 'art', 'illustration'],
    content: () => [
      H2({ children: 'Overview' }),
      P({ children: 'The image generation skill uses the Flux model (via fal.ai) to create high-quality images from text prompts. Agents can generate images as part of their task work or in response to user requests in chat.' }),

      H2({ children: 'Parameters' }),
      Table({
        headers: ['Parameter', 'Type', 'Required', 'Default', 'Description'],
        rows: [
          ['prompt', 'string', 'Yes', '\u2014', 'The text description of the image to generate.'],
          ['width', 'number', 'No', '1024', 'Image width in pixels.'],
          ['height', 'number', 'No', '1024', 'Image height in pixels.'],
          ['aspect_ratio', 'string', 'No', '1:1', 'Aspect ratio (e.g., "16:9", "4:3", "1:1"). Overrides width/height.'],
          ['num_images', 'number', 'No', '1', 'Number of images to generate (1\u20134).'],
          ['seed', 'number', 'No', 'random', 'Reproducibility seed. Same seed + prompt = same output.'],
        ],
      }),

      H2({ children: 'Prompting Tips' }),
      P({ children: 'The quality of generated images depends heavily on the prompt. Here are some tips:' }),
      UL({ children: [
        LI({ children: 'Be descriptive: "A cozy coffee shop interior with warm lighting, wooden tables, and plants hanging from the ceiling" works better than "coffee shop".' }),
        LI({ children: 'Specify style: "digital illustration", "photorealistic", "watercolor painting", "isometric 3D render".' }),
        LI({ children: 'Include composition details: "close-up", "wide angle", "birds eye view", "centered".' }),
        LI({ children: 'Mention lighting: "golden hour", "studio lighting", "dramatic shadows", "soft diffused light".' }),
      ] }),

      H2({ children: 'Example Usage' }),
      P({ children: 'In a chat message, you might ask an agent:' }),
      CodeBlock({ language: 'text', children: `@design-agent Generate a hero image for our landing page.
It should show a team of diverse professionals collaborating around a futuristic holographic display.
Style: clean, modern, corporate but not boring. Aspect ratio 16:9.` }),

      H2({ children: 'Output' }),
      P({ children: 'Generated images are posted inline in the chat or task comment. Each image includes:' }),
      UL({ children: [
        LI({ children: 'A thumbnail preview.' }),
        LI({ children: 'The prompt used to generate it.' }),
        LI({ children: 'A download link for the full-resolution file.' }),
        LI({ children: 'The seed value (useful for regenerating similar images).' }),
      ] }),

      H2({ children: 'Batch Generation' }),
      P({ children: 'Agents can generate multiple variants by setting num_images to 2\u20134. This is useful when exploring creative directions. The agent can then present all variants and let a human choose the best one via an approval workflow.' }),
    ],
  },

  'media/video': {
    slug: 'media/video',
    title: 'Video Generation',
    section: 'Media Generation',
    description: 'Generate videos with Kling and Wan models via fal.ai.',
    keywords: ['video', 'generation', 'kling', 'wan', 'animation', 'clip'],
    content: () => [
      H2({ children: 'Overview' }),
      P({ children: 'YokeBot supports AI video generation through two models, both accessed via fal.ai:' }),
      Table({
        headers: ['Model', 'Strengths', 'Duration'],
        rows: [
          ['Kling', 'High visual quality, complex scenes, consistent motion.', 'Up to 10 seconds'],
          ['Wan', 'Fast generation, good for iterative exploration and simple animations.', 'Up to 5 seconds'],
        ],
      }),

      H2({ children: 'Parameters' }),
      Table({
        headers: ['Parameter', 'Type', 'Required', 'Description'],
        rows: [
          ['prompt', 'string', 'Yes', 'Text description of the video.'],
          ['model', 'enum', 'No', '"kling" (default) or "wan".'],
          ['duration', 'number', 'No', 'Duration in seconds (within model limits).'],
          ['aspect_ratio', 'string', 'No', '"16:9" (default), "9:16", "1:1".'],
        ],
      }),

      H2({ children: 'Choosing a Model' }),
      P({ children: 'Use Kling when you need the highest quality output \u2014 product demos, marketing content, or visually complex scenes. Use Wan when you need fast turnaround and are iterating on concepts or generating simple animations.' }),

      H2({ children: 'Example Usage' }),
      CodeBlock({ language: 'text', children: `@video-agent Create a 5-second product demo video showing a smartphone
rotating slowly on a white background with soft shadows.
Use the Kling model for best quality. Aspect ratio 16:9.` }),

      H2({ children: 'Generation Time' }),
      P({ children: 'Video generation takes longer than image generation. Expect 30 seconds to 2 minutes for Wan, and 1 to 5 minutes for Kling, depending on duration and complexity. The agent will post the result once generation is complete.' }),
      Tip({ children: 'For workflows that need fast feedback, start with Wan for concept exploration and switch to Kling for the final render.' }),

      H2({ children: 'Output' }),
      P({ children: 'Generated videos are posted inline with a playback control. You can play the video directly in the dashboard or download the MP4 file. Video metadata (model used, prompt, duration, resolution) is included in the message.' }),

      H2({ children: 'Credit Cost' }),
      P({ children: 'Video generation is one of the most credit-intensive operations. A single Kling video generation can cost 20\u201350x more credits than a standard text heartbeat. Plan your credit budget accordingly if agents are generating videos frequently.' }),
    ],
  },

  'media/3d-music': {
    slug: 'media/3d-music',
    title: '3D, Music & Sound FX',
    section: 'Media Generation',
    description: 'Generate 3D models (Hunyuan), music (ACE-Step), and sound effects (MireloSFX).',
    keywords: ['3d', 'model', 'hunyuan', 'music', 'ace-step', 'sound', 'sfx', 'mireleosfx', 'audio'],
    content: () => [
      H2({ children: '3D Model Generation (Hunyuan)' }),
      P({ children: 'The Hunyuan model generates 3D models from text descriptions. Generated models can be previewed in the dashboard\'s built-in 3D viewer and downloaded in standard formats.' }),
      Table({
        headers: ['Parameter', 'Type', 'Required', 'Description'],
        rows: [
          ['prompt', 'string', 'Yes', 'Text description of the 3D model.'],
          ['format', 'enum', 'No', 'Output format: "glb" (default), "obj", "fbx".'],
        ],
      }),
      P({ children: 'Example prompt: "A low-poly medieval castle with a drawbridge, stone walls, and a red flag on the tallest tower."' }),

      HR(),

      H2({ children: 'Music Generation (ACE-Step)' }),
      P({ children: 'The ACE-Step model composes original music tracks from text descriptions. You can specify genre, mood, tempo, instrumentation, and structure.' }),
      Table({
        headers: ['Parameter', 'Type', 'Required', 'Description'],
        rows: [
          ['prompt', 'string', 'Yes', 'Description of the music to generate.'],
          ['duration', 'number', 'No', 'Track length in seconds (default 30, max 180).'],
          ['format', 'enum', 'No', 'Output format: "mp3" (default), "wav".'],
        ],
      }),
      P({ children: 'Example prompt: "An upbeat lo-fi hip hop track with mellow piano chords, a steady drum beat, vinyl crackle, and a jazzy bass line. 90 BPM."' }),
      Tip({ children: 'Be specific about tempo (BPM), instruments, and mood for best results. Vague prompts like "nice music" produce generic output.' }),

      HR(),

      H2({ children: 'Sound Effects (MireloSFX)' }),
      P({ children: 'MireloSFX generates short sound effects from text descriptions. Useful for game development, video editing, app design, and creative projects.' }),
      Table({
        headers: ['Parameter', 'Type', 'Required', 'Description'],
        rows: [
          ['prompt', 'string', 'Yes', 'Description of the sound effect.'],
          ['duration', 'number', 'No', 'Duration in seconds (default 3, max 10).'],
        ],
      }),
      P({ children: 'Example prompts:' }),
      UL({ children: [
        LI({ children: '"A heavy wooden door creaking open slowly in a stone castle"' }),
        LI({ children: '"Sci-fi laser blaster firing three quick shots"' }),
        LI({ children: '"Rain falling on a tin roof with occasional thunder"' }),
      ] }),

      HR(),

      H2({ children: 'Combining Media Skills' }),
      P({ children: 'Agents can use multiple media skills in a single heartbeat. For example, a game asset agent might generate a 3D model, a matching texture image, and associated sound effects all in one task cycle. Assign all the relevant skills to the agent and describe the full scope in the task description.' }),
    ],
  },

  // ---------------------------------------------------------------------------
  // CONFIGURATION
  // ---------------------------------------------------------------------------
  'model-providers': {
    slug: 'model-providers',
    title: 'Model Providers',
    section: 'Configuration',
    description: 'Configure LLM providers for your agents: DeepInfra, OpenRouter, and fal.ai.',
    keywords: ['model', 'provider', 'llm', 'deepinfra', 'openrouter', 'fal.ai', 'api key'],
    content: () => [
      H2({ children: 'Overview' }),
      P({ children: 'YokeBot supports multiple model providers for LLM reasoning and media generation. You can configure one or more providers depending on your needs.' }),

      H2({ children: 'Supported Providers' }),
      Table({
        headers: ['Provider', 'Purpose', 'Env Variable', 'Website'],
        rows: [
          ['DeepInfra', 'LLM reasoning, text embeddings', 'DEEPINFRA_API_KEY', 'deepinfra.com'],
          ['OpenRouter', 'LLM reasoning (wide model selection)', 'OPENROUTER_API_KEY', 'openrouter.ai'],
          ['fal.ai', 'Media generation (image, video, 3D, music, SFX)', 'FAL_KEY', 'fal.ai'],
        ],
      }),

      H2({ children: 'Configuration' }),
      H3({ children: 'Cloud (yokebot.com)' }),
      P({ children: 'On YokeBot Cloud, model providers are pre-configured. You do not need to bring your own API keys \u2014 usage is covered by your credits. However, you can optionally add your own keys from Settings > Model Providers to use specific models not included in the default rotation.' }),

      H3({ children: 'Self-Hosted' }),
      P({ children: 'For self-hosted instances, add your API keys to the .env file:' }),
      CodeBlock({ language: 'bash', children: `# At least one LLM provider is required
DEEPINFRA_API_KEY=your_key_here
OPENROUTER_API_KEY=your_key_here

# Required for media generation
FAL_KEY=your_key_here` }),

      H2({ children: 'Choosing a Provider' }),
      P({ children: 'If you configure multiple LLM providers, you can select which provider each agent uses from the agent settings. Factors to consider:' }),
      UL({ children: [
        LI({ children: 'DeepInfra \u2014 good performance/cost ratio, recommended for most workloads.' }),
        LI({ children: 'OpenRouter \u2014 widest selection of models. Useful if you need a specific model (GPT-4, Claude, Llama, etc.).' }),
      ] }),

      H2({ children: 'Model Selection' }),
      P({ children: 'Each agent can be assigned a specific model. The available models depend on which providers are configured. You can change an agent\'s model at any time from the agent settings page. The change takes effect on the next heartbeat.' }),
      Tip({ children: 'Start with a recommended default model and only switch to specialized models if you have specific performance or cost requirements.' }),

      H2({ children: 'Rate Limits and Quotas' }),
      P({ children: 'Each provider has its own rate limits and quotas. If an agent hits a rate limit, the engine will retry with exponential backoff. Persistent rate limit errors will move the agent to the Error state. Check your provider dashboard for quota information.' }),
    ],
  },

  'notifications': {
    slug: 'notifications',
    title: 'Notifications',
    section: 'Configuration',
    description: 'Configure how you receive notifications from YokeBot.',
    keywords: ['notifications', 'email', 'webhook', 'alerts', 'mentions', 'settings'],
    content: () => [
      H2({ children: 'Notification Channels' }),
      P({ children: 'YokeBot can notify you through multiple channels when events require your attention.' }),
      Table({
        headers: ['Channel', 'Description', 'Configuration'],
        rows: [
          ['In-App', 'Badge notifications in the dashboard sidebar.', 'Always enabled.'],
          ['Email', 'Email notifications to your account email address.', 'Settings > Notifications > Email.'],
          ['Webhook', 'HTTP POST to a custom URL (Slack, Discord, etc.).', 'Settings > Notifications > Webhooks.'],
        ],
      }),

      H2({ children: 'Notification Events' }),
      P({ children: 'You can enable or disable notifications for each event type independently:' }),
      UL({ children: [
        LI({ children: '@Mentions \u2014 when you are mentioned in a chat message.' }),
        LI({ children: 'Task Approval Needed \u2014 when an agent completes a task that requires your review.' }),
        LI({ children: 'Task Completed \u2014 when a task you created is marked Done.' }),
        LI({ children: 'Agent Error \u2014 when one of your agents enters the Error state.' }),
        LI({ children: 'Credit Warning \u2014 when your team\'s credits fall below a configurable threshold (cloud only).' }),
      ] }),

      H2({ children: 'Email Frequency' }),
      P({ children: 'To avoid email overload, you can choose from three email frequency options:' }),
      UL({ children: [
        LI({ children: 'Immediate \u2014 one email per event, as it happens.' }),
        LI({ children: 'Hourly Digest \u2014 a summary of all events from the past hour, sent on the hour.' }),
        LI({ children: 'Daily Digest \u2014 a summary of all events from the past 24 hours, sent at your configured time.' }),
      ] }),

      H2({ children: 'Webhook Configuration' }),
      P({ children: 'Webhooks send an HTTP POST with a JSON payload to your specified URL. This is useful for integrating YokeBot with Slack, Discord, Microsoft Teams, or any system that accepts incoming webhooks.' }),
      CodeBlock({ language: 'json', children: `{
  "event": "task.approval_needed",
  "timestamp": "2025-06-15T10:30:00Z",
  "data": {
    "task_id": "task_abc123",
    "task_title": "Draft Q3 Marketing Report",
    "agent_name": "Marketing Writer",
    "team_id": "team_xyz"
  }
}` }),
      P({ children: 'You can add multiple webhook URLs and configure each one to receive only specific event types.' }),

      H2({ children: 'Testing Notifications' }),
      P({ children: 'From the notification settings page, you can send a test event to any configured channel to verify it is working correctly.' }),
    ],
  },

  'teams-auth': {
    slug: 'teams-auth',
    title: 'Teams & Authentication',
    section: 'Configuration',
    description: 'Manage teams, invite members, and understand YokeBot\'s authentication system.',
    keywords: ['teams', 'auth', 'authentication', 'supabase', 'oauth', 'google', 'github', 'invite', 'members', 'roles'],
    content: () => [
      H2({ children: 'Authentication' }),
      P({ children: 'YokeBot uses Supabase for authentication. On YokeBot Cloud, two OAuth providers are available:' }),
      UL({ children: [
        LI({ children: 'Google \u2014 sign in with your Google account.' }),
        LI({ children: 'GitHub \u2014 sign in with your GitHub account.' }),
      ] }),
      P({ children: 'For self-hosted instances, you configure your own Supabase project and can enable whichever auth providers Supabase supports (email/password, Google, GitHub, Apple, etc.).' }),

      H2({ children: 'Setting Up Supabase (Self-Hosted)' }),
      OL({ children: [
        LI({ children: 'Create a project at supabase.com (or self-host Supabase).' }),
        LI({ children: 'Copy your Supabase URL and anon key.' }),
        LI({ children: 'Set the environment variables:' }),
      ] }),
      CodeBlock({ language: 'bash', children: `SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key` }),
      P({ children: 'The engine uses the service role key for server-side operations. The dashboard uses the anon key for client-side authentication.' }),

      H2({ children: 'Teams' }),
      P({ children: 'Teams are the top-level organizational unit. All agents, channels, knowledge bases, data tables, and tasks belong to a team. Every user has a personal team created automatically on sign-up.' }),

      H2({ children: 'Team Roles' }),
      Table({
        headers: ['Role', 'Permissions'],
        rows: [
          ['Owner', 'Full access. Can delete the team, manage billing, and change roles.'],
          ['Admin', 'Can manage agents, channels, tasks, KB, data tables, and invite members.'],
          ['Member', 'Can use agents, chat, and view tasks. Cannot change team settings.'],
        ],
      }),

      H2({ children: 'Inviting Members' }),
      P({ children: 'Team owners and admins can invite new members from Settings > Team > Members. Enter the invitee\'s email address and select a role. They will receive an invitation email with a link to join.' }),

      H2({ children: 'Switching Teams' }),
      P({ children: 'If you belong to multiple teams, use the team switcher in the top-left corner of the dashboard. Your current team context determines which agents, channels, and data you see.' }),
    ],
  },

  'billing': {
    slug: 'billing',
    title: 'Billing & Credits',
    section: 'Configuration',
    description: 'Understand YokeBot Cloud\'s credit-based billing system.',
    keywords: ['billing', 'credits', 'pricing', 'cost', 'usage', 'packs', 'monthly'],
    content: () => [
      H2({ children: 'Overview' }),
      P({ children: 'YokeBot Cloud uses a credit-based billing system. Credits are consumed when agents perform heartbeats, generate media, query knowledge bases, and use other compute-intensive features.' }),
      Tip({ children: 'Self-hosted instances do not use the credit system. You pay your API providers directly.' }),

      H2({ children: 'Base Monthly Credits' }),
      P({ children: 'Every team receives a base allocation of credits at the start of each billing cycle. These credits are use-it-or-lose-it \u2014 any unused base credits expire when the cycle resets. The base allocation depends on your plan tier.' }),

      H2({ children: 'Credit Packs' }),
      P({ children: 'If you need more credits than your base allocation, purchase credit packs from the Billing page. Key differences from base credits:' }),
      Table({
        headers: ['', 'Base Credits', 'Credit Packs'],
        rows: [
          ['Source', 'Included with plan', 'Purchased separately'],
          ['Rollover', 'No \u2014 expire each cycle', 'Yes \u2014 carry over indefinitely'],
          ['Consumption Order', 'Used first', 'Used after base credits are exhausted'],
          ['Refundable', 'No', 'Unused packs can be refunded within 30 days'],
        ],
      }),

      H2({ children: 'Credit Costs by Operation' }),
      P({ children: 'Different operations consume different amounts of credits. Here are approximate costs:' }),
      Table({
        headers: ['Operation', 'Approximate Cost'],
        rows: [
          ['Agent heartbeat (text only)', '1\u20135 credits'],
          ['Web search', '1\u20132 credits'],
          ['Knowledge base query', '1 credit'],
          ['Image generation', '10\u201325 credits'],
          ['Video generation', '50\u2013150 credits'],
          ['3D model generation', '30\u201380 credits'],
          ['Music generation', '20\u201360 credits'],
          ['Sound effect generation', '5\u201315 credits'],
        ],
      }),
      P({ children: 'Actual costs vary based on input/output token counts, image resolution, video duration, and other parameters.' }),

      H2({ children: 'Monitoring Usage' }),
      P({ children: 'The Billing page shows:' }),
      UL({ children: [
        LI({ children: 'Current credit balance (base + packs).' }),
        LI({ children: 'Usage graph over the current billing cycle.' }),
        LI({ children: 'Breakdown by agent and operation type.' }),
        LI({ children: 'Projected usage for the remainder of the cycle.' }),
      ] }),

      H2({ children: 'Low Credit Warnings' }),
      P({ children: 'You can set a warning threshold in Settings > Notifications. When your total credits (base + packs) fall below this threshold, you will receive a notification via your configured channels. Agents continue to operate until credits reach zero, at which point they pause automatically.' }),
      Warning({ children: 'When credits are exhausted, all active agents are paused. Purchase a credit pack to resume operations immediately.' }),
    ],
  },

  // ---------------------------------------------------------------------------
  // DEPLOYMENT
  // ---------------------------------------------------------------------------
  'self-hosting': {
    slug: 'self-hosting',
    title: 'Self-Hosting Guide',
    section: 'Deployment',
    description: 'Everything you need to deploy and maintain a self-hosted YokeBot instance.',
    keywords: ['self-hosting', 'deploy', 'production', 'server', 'maintenance', 'upgrade'],
    content: () => [
      H2({ children: 'Overview' }),
      P({ children: 'YokeBot can be self-hosted on any machine that runs Node.js 20+. For development, the built-in dev server is sufficient. For production, we recommend Docker Compose or a process manager like PM2.' }),

      H2({ children: 'System Requirements' }),
      Table({
        headers: ['Resource', 'Minimum', 'Recommended'],
        rows: [
          ['CPU', '2 cores', '4+ cores'],
          ['RAM', '2 GB', '4+ GB'],
          ['Disk', '1 GB (plus document storage)', '10+ GB SSD'],
          ['OS', 'Linux, macOS, or Windows (WSL2)', 'Linux (Ubuntu 22.04+)'],
          ['Node.js', '20.x', '22.x LTS'],
          ['pnpm', '9.x', '9.x'],
        ],
      }),

      H2({ children: 'Production Deployment Options' }),
      UL({ children: [
        LI({ children: ['Docker Compose \u2014 recommended for most deployments. See ', A({ href: '/docs/self-hosting/docker', children: 'Docker Compose Guide' }), '.'] }),
        LI({ children: 'Process Manager (PM2) \u2014 run the engine and dashboard as managed Node.js processes.' }),
        LI({ children: 'Bare Metal \u2014 run pnpm start directly with a reverse proxy (Nginx, Caddy).' }),
      ] }),

      H2({ children: 'Reverse Proxy' }),
      P({ children: 'In production, place YokeBot behind a reverse proxy for SSL termination and routing. Here is a minimal Nginx configuration:' }),
      CodeBlock({ language: 'nginx', children: `server {
    listen 443 ssl;
    server_name yokebot.yourdomain.com;

    ssl_certificate /etc/ssl/certs/yokebot.pem;
    ssl_certificate_key /etc/ssl/private/yokebot.key;

    location /api/ {
        proxy_pass http://localhost:3000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        proxy_pass http://localhost:5173/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}` }),

      H2({ children: 'Database Choice' }),
      P({ children: 'SQLite works well for single-instance deployments with moderate workloads. Switch to Postgres when:' }),
      UL({ children: [
        LI({ children: 'You have more than 20 active agents.' }),
        LI({ children: 'You need concurrent write-heavy workloads.' }),
        LI({ children: 'You want automated backups via your database provider.' }),
        LI({ children: 'You run multiple engine instances behind a load balancer.' }),
      ] }),

      H2({ children: 'Backups' }),
      P({ children: 'For SQLite, back up the database file regularly. For Postgres, use standard pg_dump or your hosting provider\'s automated backup feature. Also back up your .env file and any custom SKILL.md files.' }),

      H2({ children: 'Related Pages' }),
      UL({ children: [
        LI({ children: A({ href: '/docs/self-hosting/docker', children: 'Docker Compose' }) }),
        LI({ children: A({ href: '/docs/self-hosting/env-vars', children: 'Environment Variables' }) }),
      ] }),
    ],
  },

  'self-hosting/docker': {
    slug: 'self-hosting/docker',
    title: 'Docker Compose',
    section: 'Deployment',
    description: 'Deploy YokeBot with Docker Compose for production environments.',
    keywords: ['docker', 'compose', 'container', 'production', 'deploy', 'postgres'],
    content: () => [
      H2({ children: 'Overview' }),
      P({ children: 'Docker Compose is the recommended way to deploy YokeBot in production. The included docker-compose.yml file sets up the engine, dashboard, and an optional Postgres database.' }),

      H2({ children: 'Prerequisites' }),
      UL({ children: [
        LI({ children: 'Docker Engine 24+ installed' }),
        LI({ children: 'Docker Compose v2 installed' }),
        LI({ children: 'At least 2 GB of free RAM' }),
      ] }),

      H2({ children: 'Quick Start' }),
      CodeBlock({ language: 'bash', children: `git clone https://github.com/yokebot/yokebot.git
cd yokebot
cp .env.example .env
# Edit .env with your API keys and configuration

docker compose up -d` }),
      P({ children: 'This starts three services:' }),
      UL({ children: [
        LI({ children: [Code({ children: 'yokebot-engine' }), ' \u2014 the API server on port 3000.'] }),
        LI({ children: [Code({ children: 'yokebot-dashboard' }), ' \u2014 the web UI on port 5173.'] }),
        LI({ children: [Code({ children: 'yokebot-db' }), ' \u2014 a Postgres 16 instance on port 5432.'] }),
      ] }),

      H2({ children: 'Configuration' }),
      P({ children: 'The docker-compose.yml reads all configuration from your .env file. Key variables for Docker deployment:' }),
      CodeBlock({ language: 'bash', children: `# Database (auto-configured with Docker Compose Postgres)
DATABASE_URL=postgresql://yokebot:yokebot@yokebot-db:5432/yokebot

# External URL (used for OAuth callbacks and webhooks)
PUBLIC_URL=https://yokebot.yourdomain.com

# API keys (required)
DEEPINFRA_API_KEY=your_key
FAL_KEY=your_key

# Supabase (required for auth)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key` }),

      H2({ children: 'Updating' }),
      CodeBlock({ language: 'bash', children: `git pull origin main
docker compose build
docker compose up -d` }),
      Tip({ children: 'Docker Compose handles zero-downtime restarts. The new containers start before the old ones are stopped.' }),

      H2({ children: 'Using SQLite with Docker' }),
      P({ children: 'If you prefer SQLite over Postgres, remove or comment out the yokebot-db service in docker-compose.yml and remove the DATABASE_URL variable. Mount a persistent volume for the SQLite file:' }),
      CodeBlock({ language: 'yaml', children: `volumes:
  - ./data:/app/packages/engine/data` }),

      H2({ children: 'Logs and Monitoring' }),
      P({ children: 'View logs for all services:' }),
      CodeBlock({ language: 'bash', children: `docker compose logs -f          # all services
docker compose logs -f engine    # engine only
docker compose logs -f dashboard # dashboard only` }),

      H2({ children: 'Scaling' }),
      P({ children: 'For most deployments, a single instance of each service is sufficient. If you need to scale the engine for large agent counts, use Postgres as the database (required for multi-instance) and run multiple engine containers behind a load balancer.' }),
    ],
  },

  'self-hosting/env-vars': {
    slug: 'self-hosting/env-vars',
    title: 'Environment Variables',
    section: 'Deployment',
    description: 'Complete reference of all environment variables for self-hosted YokeBot.',
    keywords: ['env', 'environment', 'variables', 'configuration', 'reference', '.env'],
    content: () => [
      H2({ children: 'Overview' }),
      P({ children: 'YokeBot is configured primarily through environment variables. For local development, create a .env file in the repository root. For Docker deployments, the same .env file is read by Docker Compose.' }),

      H2({ children: 'Database' }),
      Table({
        headers: ['Variable', 'Required', 'Default', 'Description'],
        rows: [
          ['DATABASE_URL', 'No', 'sqlite:./data/yokebot.db', 'Database connection string. Set to a Postgres URL for production.'],
        ],
      }),

      H2({ children: 'Authentication (Supabase)' }),
      Table({
        headers: ['Variable', 'Required', 'Default', 'Description'],
        rows: [
          ['SUPABASE_URL', 'Yes', '\u2014', 'Your Supabase project URL.'],
          ['SUPABASE_ANON_KEY', 'Yes', '\u2014', 'Supabase anonymous (public) key for client-side auth.'],
          ['SUPABASE_SERVICE_ROLE_KEY', 'Yes', '\u2014', 'Supabase service role key for server-side operations.'],
        ],
      }),

      H2({ children: 'LLM Providers' }),
      Table({
        headers: ['Variable', 'Required', 'Default', 'Description'],
        rows: [
          ['DEEPINFRA_API_KEY', 'No*', '\u2014', 'API key for DeepInfra. *At least one LLM provider is required.'],
          ['OPENROUTER_API_KEY', 'No*', '\u2014', 'API key for OpenRouter. *At least one LLM provider is required.'],
        ],
      }),

      H2({ children: 'Media Generation' }),
      Table({
        headers: ['Variable', 'Required', 'Default', 'Description'],
        rows: [
          ['FAL_KEY', 'No', '\u2014', 'API key for fal.ai. Required for image, video, 3D, music, and SFX generation.'],
        ],
      }),

      H2({ children: 'Web Search' }),
      Table({
        headers: ['Variable', 'Required', 'Default', 'Description'],
        rows: [
          ['TAVILY_API_KEY', 'No', '\u2014', 'API key for Tavily web search.'],
          ['BRAVE_API_KEY', 'No', '\u2014', 'API key for Brave web search.'],
        ],
      }),

      H2({ children: 'Server' }),
      Table({
        headers: ['Variable', 'Required', 'Default', 'Description'],
        rows: [
          ['PORT', 'No', '3000', 'Port the engine API listens on.'],
          ['PUBLIC_URL', 'No', 'http://localhost:3000', 'The public-facing URL. Used for OAuth callbacks and webhook URLs.'],
          ['NODE_ENV', 'No', 'development', 'Set to "production" for production deployments.'],
          ['LOG_LEVEL', 'No', 'info', 'Logging level: debug, info, warn, error.'],
        ],
      }),

      H2({ children: 'MCP' }),
      Table({
        headers: ['Variable', 'Required', 'Default', 'Description'],
        rows: [
          ['MCP_SERVERS', 'No', '[]', 'JSON array of MCP server configurations. See the MCP Integration docs.'],
        ],
      }),

      H2({ children: 'Notifications' }),
      Table({
        headers: ['Variable', 'Required', 'Default', 'Description'],
        rows: [
          ['SMTP_HOST', 'No', '\u2014', 'SMTP server for email notifications.'],
          ['SMTP_PORT', 'No', '587', 'SMTP port.'],
          ['SMTP_USER', 'No', '\u2014', 'SMTP username.'],
          ['SMTP_PASS', 'No', '\u2014', 'SMTP password.'],
          ['SMTP_FROM', 'No', 'noreply@yokebot.com', 'From address for email notifications.'],
        ],
      }),

      Tip({ children: 'Start with the minimum required variables (Supabase + one LLM provider) and add others as you enable more features.' }),
    ],
  },

  // ---------------------------------------------------------------------------
  // REFERENCE
  // ---------------------------------------------------------------------------
  'api-reference': {
    slug: 'api-reference',
    title: 'API Reference',
    section: 'Reference',
    description: 'REST API reference for the YokeBot engine.',
    keywords: ['api', 'rest', 'reference', 'endpoints', 'http', 'json'],
    content: () => [
      H2({ children: 'Overview' }),
      P({ children: 'The YokeBot engine exposes a REST API for managing agents, tasks, chat, knowledge bases, and data tables. The dashboard uses this API under the hood, and you can call it directly for custom integrations.' }),

      H2({ children: 'Base URL' }),
      P({ children: 'For self-hosted instances, the default base URL is:' }),
      CodeBlock({ language: 'text', children: 'http://localhost:3000/api/v1' }),
      P({ children: 'For YokeBot Cloud:' }),
      CodeBlock({ language: 'text', children: 'https://api.yokebot.com/v1' }),

      H2({ children: 'Authentication' }),
      P({ children: 'All API requests require a Bearer token in the Authorization header. Obtain a token by authenticating via Supabase:' }),
      CodeBlock({ language: 'bash', children: `curl -X GET https://api.yokebot.com/v1/agents \\
  -H "Authorization: Bearer YOUR_SUPABASE_ACCESS_TOKEN" \\
  -H "Content-Type: application/json"` }),

      H2({ children: 'Agents' }),
      Table({
        headers: ['Method', 'Endpoint', 'Description'],
        rows: [
          ['GET', '/agents', 'List all agents in the current team.'],
          ['POST', '/agents', 'Create a new agent.'],
          ['GET', '/agents/:id', 'Get agent details.'],
          ['PATCH', '/agents/:id', 'Update an agent.'],
          ['DELETE', '/agents/:id', 'Delete an agent.'],
          ['POST', '/agents/:id/wake', 'Trigger an immediate heartbeat.'],
        ],
      }),

      H2({ children: 'Tasks' }),
      Table({
        headers: ['Method', 'Endpoint', 'Description'],
        rows: [
          ['GET', '/tasks', 'List tasks with optional status filter.'],
          ['POST', '/tasks', 'Create a new task.'],
          ['GET', '/tasks/:id', 'Get task details and comments.'],
          ['PATCH', '/tasks/:id', 'Update task status or details.'],
          ['POST', '/tasks/:id/comments', 'Add a comment to a task.'],
          ['POST', '/tasks/:id/approve', 'Approve a pending task.'],
          ['POST', '/tasks/:id/reject', 'Reject a pending task with feedback.'],
        ],
      }),

      H2({ children: 'Chat' }),
      Table({
        headers: ['Method', 'Endpoint', 'Description'],
        rows: [
          ['GET', '/channels', 'List channels.'],
          ['POST', '/channels', 'Create a channel.'],
          ['GET', '/channels/:id/messages', 'Get messages in a channel.'],
          ['POST', '/channels/:id/messages', 'Send a message to a channel.'],
          ['GET', '/dm/:userId', 'Get direct messages with a user or agent.'],
          ['POST', '/dm/:userId', 'Send a direct message.'],
        ],
      }),

      H2({ children: 'Knowledge Base' }),
      Table({
        headers: ['Method', 'Endpoint', 'Description'],
        rows: [
          ['GET', '/knowledge-bases', 'List knowledge bases.'],
          ['POST', '/knowledge-bases', 'Create a knowledge base.'],
          ['POST', '/knowledge-bases/:id/documents', 'Upload a document (multipart/form-data).'],
          ['GET', '/knowledge-bases/:id/documents', 'List documents in a KB.'],
          ['DELETE', '/knowledge-bases/:id/documents/:docId', 'Delete a document.'],
          ['POST', '/knowledge-bases/:id/query', 'Semantic search query.'],
        ],
      }),

      H2({ children: 'Data Tables' }),
      Table({
        headers: ['Method', 'Endpoint', 'Description'],
        rows: [
          ['GET', '/tables', 'List data tables.'],
          ['POST', '/tables', 'Create a table with column definitions.'],
          ['GET', '/tables/:id/rows', 'Query rows with filters.'],
          ['POST', '/tables/:id/rows', 'Insert rows.'],
          ['PATCH', '/tables/:id/rows', 'Update rows matching filters.'],
          ['DELETE', '/tables/:id/rows', 'Delete rows matching filters.'],
        ],
      }),

      H2({ children: 'Error Responses' }),
      P({ children: 'All error responses follow a standard format:' }),
      CodeBlock({ language: 'json', children: `{
  "error": {
    "code": "NOT_FOUND",
    "message": "Agent with id 'abc123' not found.",
    "status": 404
  }
}` }),
      Table({
        headers: ['Status Code', 'Meaning'],
        rows: [
          ['400', 'Bad request \u2014 invalid parameters.'],
          ['401', 'Unauthorized \u2014 missing or invalid token.'],
          ['403', 'Forbidden \u2014 insufficient permissions.'],
          ['404', 'Not found \u2014 resource does not exist.'],
          ['429', 'Rate limited \u2014 too many requests.'],
          ['500', 'Internal server error.'],
        ],
      }),

      H2({ children: 'Rate Limits' }),
      P({ children: 'The API enforces rate limits to protect against abuse:' }),
      UL({ children: [
        LI({ children: 'Standard endpoints: 100 requests per minute per user.' }),
        LI({ children: 'Document upload: 10 requests per minute per user.' }),
        LI({ children: 'Agent wake: 20 requests per minute per team.' }),
      ] }),
      P({ children: 'Rate limit headers are included in every response:' }),
      CodeBlock({ language: 'text', children: `X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1718450400` }),
    ],
  },
}
