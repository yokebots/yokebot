import { createElement, type ReactNode } from 'react'
import { H2, H3, P, Code, CodeBlock as CodeBlockComponent, Tip, Warning, UL, OL, LI, Table, HR, A } from '@/components/docs/DocsProse'

/**
 * CodeBlock uses useState internally. Calling it directly as CodeBlock({...})
 * inlines its hooks into the parent component (DocsPage), which breaks the
 * Rules of Hooks when navigating between pages with different numbers of
 * CodeBlocks. Wrapping with createElement makes it a proper React element
 * with its own hook scope.
 */
function CodeBlock(props: { children: string; title?: string; language?: string }): ReactNode {
  return createElement(CodeBlockComponent, props)
}

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
    slugs: ['chat', 'chat/mentions'],
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
    slugs: ['tasks', 'tasks/workflows', 'tasks/production-workflows', 'tasks/blocked'],
  },
  {
    title: 'Media Generation',
    icon: 'movie',
    slugs: ['media', 'media/image', 'media/video', 'media/3d-music'],
  },
  {
    title: 'Browser Automation',
    icon: 'public',
    slugs: ['browser', 'browser/session-vault'],
  },
  {
    title: 'Configuration',
    icon: 'tune',
    slugs: ['notifications', 'teams-auth', 'billing', 'integrations', 'brand-kit', 'api-keys'],
  },
  {
    title: 'Workspace',
    icon: 'workspaces',
    slugs: ['workspace', 'workspace/files', 'workspace/visual-editor'],
  },
  {
    title: 'Team Collaboration',
    icon: 'groups',
    slugs: ['team-collaboration', 'team-collaboration/chat', 'team-collaboration/roles'],
  },
  {
    title: 'Deployment',
    icon: 'dns',
    slugs: ['self-hosting', 'self-hosting/docker', 'self-hosting/env-vars'],
  },
  {
    title: 'Reference',
    icon: 'api',
    slugs: ['api-reference', 'keyboard-shortcuts'],
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
      P({ children: 'Head to yokebot.com and click Sign Up. You can authenticate with either Google or GitHub.' }),
      OL({ children: [
        LI({ children: 'Click "Sign Up" on the landing page.' }),
        LI({ children: 'Choose Google or GitHub as your identity provider.' }),
        LI({ children: 'Authorize YokeBot to read your basic profile information.' }),
        LI({ children: 'You will be redirected to your new dashboard.' }),
      ] }),

      H2({ children: 'Your First Team' }),
      P({ children: 'After signing up, YokeBot automatically creates a personal team for you. Teams are the top-level organizational unit \u2014 all agents, chat, knowledge bases, tasks, and data belong to a team. You can invite collaborators later from the Settings page.' }),

      H2({ children: 'Credit System' }),
      P({ children: 'YokeBot Cloud uses a credit-based billing model. Every new team receives 1,250 free starter credits to explore the platform without entering payment information.' }),
      P({ children: 'Once you subscribe, your team receives a monthly credit allocation (50,000 to 500,000 depending on tier) that refreshes each billing cycle. If you need more capacity, purchase credit packs from the Billing page \u2014 these carry over from month to month.' }),
      Tip({ children: ['You can monitor your credit usage in real time from the Billing section. See ', A({ href: '/docs/billing', children: 'Billing & Credits' }), ' for full details on tiers and pricing.'] }),

      H2({ children: 'The Workspace' }),
      P({ children: 'The Workspace is where you will spend most of your time. It puts everything on a single screen \u2014 team chat, tasks, files, data tables, and agent activity \u2014 so you can manage multiple agents and workstreams at once without switching between pages.' }),
      P({ children: 'The sidebar gives you quick access to supporting areas:' }),
      UL({ children: [
        LI({ children: 'Workspace \u2014 your unified command center with chat, tasks, files, data, browser, and activity log in one view' }),
        LI({ children: 'Agents \u2014 create and manage your AI agents' }),
        LI({ children: 'Pre-Built Agents \u2014 browse 40+ ready-made agent templates across business functions' }),
        LI({ children: 'Knowledge Base \u2014 upload documents for RAG-powered agent context' }),
        LI({ children: 'Activity Log \u2014 audit trail of every agent action, file change, and system event' }),
        LI({ children: 'Settings \u2014 team management, business context, billing, and notifications' }),
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
      CodeBlock({ language: 'bash', children: `git clone https://github.com/yokebots/yokebot.git
cd yokebot
pnpm install` }),

      H2({ children: 'Environment Variables' }),
      P({ children: ['Copy the example environment file and fill in at least one model provider API key. See the ', A({ href: '/docs/self-hosting/env-vars', children: 'Environment Variables' }), ' reference for the full list.'] }),
      CodeBlock({ language: 'bash', children: `cp packages/engine/.env.example packages/engine/.env
# Edit packages/engine/.env with your API keys` }),
      Tip({ children: 'At minimum you need one LLM provider key (e.g. DEEPINFRA_API_KEY or OPENROUTER_API_KEY). Everything else is optional for local development.' }),

      H2({ children: 'Database' }),
      P({ children: 'By default YokeBot uses SQLite, which requires zero configuration. The database file is created automatically in the engine package directory on first run.' }),
      P({ children: 'For production workloads or multi-instance deployments, you can switch to Postgres by setting the DATABASE_URL environment variable:' }),
      CodeBlock({ language: 'bash', children: 'DATABASE_URL=postgresql://user:password@localhost:5432/yokebot' }),

      H2({ children: 'Start the Dev Server' }),
      CodeBlock({ language: 'bash', children: 'pnpm dev:all' }),
      P({ children: 'This command starts both the engine (API server) and the dashboard (Vite dev server) concurrently. By default the dashboard is available at http://localhost:5173 and the engine API at http://localhost:3001.' }),

      H2({ children: 'Verify the Installation' }),
      OL({ children: [
        LI({ children: 'Open http://localhost:5173 in your browser.' }),
        LI({ children: 'You will be logged in automatically as a local user.' }),
        LI({ children: 'Open the Workspace \u2014 this is your central hub for agents, tasks, and chat.' }),
        LI({ children: 'Create a test agent from the Agents panel.' }),
        LI({ children: 'Send the agent a message in the team chat \u2014 if it responds, everything is working.' }),
      ] }),

      H2({ children: 'Updating' }),
      P({ children: 'To update a self-hosted instance, pull the latest changes and reinstall dependencies:' }),
      CodeBlock({ language: 'bash', children: `git pull origin main
pnpm install
pnpm dev:all` }),

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

      H2({ children: 'Step 1: Open the Agents Panel' }),
      P({ children: 'From the Workspace, open the Agents panel. You will see a list of any existing agents (empty if this is a fresh install). Click the "New Agent" button to get started.' }),

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
      P({ children: 'Toggle the agent status to Active and click Save. The agent will begin its heartbeat cycle immediately. You can @mention it in the team chat or assign it a task from the Workspace.' }),

      H2({ children: 'What Happens Next?' }),
      P({ children: 'On each heartbeat, the agent:' }),
      OL({ children: [
        LI({ children: 'Checks the database for assigned tasks and new messages (no LLM call yet).' }),
        LI({ children: 'If tasks are assigned, works on them using its available skills (web search, file generation, data updates, etc.).' }),
        LI({ children: 'If no tasks but new messages exist, reads and responds to the team chat.' }),
        LI({ children: 'If nothing is new, skips the LLM call entirely \u2014 no credits consumed.' }),
        LI({ children: 'Goes back to sleep until the next heartbeat.' }),
      ] }),
      P({ children: 'You can also @mention any agent from the team chat, and it will wake up immediately to reply \u2014 no need to wait for the next heartbeat.' }),
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
      P({ children: 'You can create agents from the Agents page in the dashboard. Click "New Agent", fill in the required fields, assign skills, and activate.' }),

      H2({ children: 'Agent Communication' }),
      P({ children: 'Agents participate in the team chat just like human users. They can respond to @mentions and post updates. When an agent is @mentioned, it wakes up immediately rather than waiting for its next scheduled heartbeat.' }),

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
      P({ children: 'Every active agent runs on a heartbeat cycle. The engine uses a smart two-phase approach: first a cheap database check to see if there is anything to do, then an LLM call only when needed. This means idle agents consume zero credits.' }),

      H2({ children: 'The Heartbeat Sequence' }),
      OL({ children: [
        LI({ children: 'Wake \u2014 The engine triggers the agent at the configured interval.' }),
        LI({ children: 'DB Pre-Check \u2014 The engine queries the database for assigned tasks and new messages. If there is nothing new, the heartbeat ends here with no LLM call and no credits consumed.' }),
        LI({ children: 'Task Sprint \u2014 If the agent has assigned tasks, the engine assembles context (task details, subtasks, thread history, knowledge base) and runs a full tool-use loop. The agent works on one task at a time, using its available skills.' }),
        LI({ children: 'Message Check-In \u2014 If no tasks are assigned but new team chat messages exist, the engine assembles the recent messages and lets the agent respond.' }),
        LI({ children: 'Reporting \u2014 Results are posted to the team chat or the relevant task thread.' }),
        LI({ children: 'Sleep \u2014 The agent goes idle until the next heartbeat.' }),
      ] }),

      H2({ children: 'Configuring the Interval' }),
      P({ children: 'The available heartbeat interval depends on your plan. Faster intervals mean more frequent check-ins and credit usage:' }),
      Table({
        headers: ['Plan', 'Fastest Interval'],
        rows: [
          ['Starter Crew', '30 minutes'],
          ['Growth Crew', '15 minutes'],
          ['Power Crew', '5 minutes'],
          ['Self-Hosted', 'No limit (configurable)'],
        ],
      }),

      H2({ children: 'Immediate Wake on @Mention' }),
      P({ children: 'Regardless of the heartbeat interval, an agent wakes up immediately when it is @mentioned in the team chat. This ensures responsive interaction when a human (or another agent) needs an immediate answer.' }),
      P({ children: 'The @mention response has two phases: a quick acknowledgment reply (fast, no tools), followed by background work where the agent uses its full skill set to complete the request. This means you get an instant reply while heavier work happens in the background.' }),
      Tip({ children: '@mentioning a paused agent will automatically resume it. This lets you wake up agents on demand without needing to manually toggle their status.' }),

      H2({ children: 'Credit Consumption' }),
      P({ children: 'On YokeBot Cloud, each heartbeat consumes credits only when the agent actually calls the LLM. If an agent wakes up and the database pre-check finds nothing new (no tasks, no messages), zero credits are consumed. Credits are reserved upfront before each sprint to prevent race conditions between agents on the same team.' }),

      H2({ children: 'Monitoring Heartbeats' }),
      P({ children: 'You can view an agent\'s heartbeat history from its detail page in the Workspace. Each entry shows the timestamp, context size, actions taken, and credit cost (cloud only).' }),
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
      CodeBlock({ language: 'text', children: `You are a content moderator. Review messages in the team chat.
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
      Tip({ children: 'Paused agents still appear in the team chat and can be @mentioned, but they will not respond until reactivated.' }),

      H2({ children: 'Global Agent Toggle' }),
      P({ children: 'The top bar of the workspace includes a global agent toggle that pauses or resumes all agents on your team at once. This is useful when you need to stop all activity quickly \u2014 for example, to review multiple pending approvals or to prevent credit consumption while making configuration changes.' }),

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
          ['Media Generation', 'Image (Nano Banana 2, Seedream, Flux), Image Editing (FireRed), Video (Kling 3.0, Wan), 3D (Hunyuan), Music (ACE-Step), Sound FX (MireloSFX)'],
          ['Browser', 'Navigate, click, type, screenshot, fill forms, download files, ask-the-human'],
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
      P({ children: 'Agents can generate images using multiple models. The default model is Nano Banana 2 — fast, high-quality, and cost-effective. Style references let agents provide up to 6 existing images to guide the visual output.' }),
      Table({
        headers: ['Model', 'Strengths', 'Credit Cost'],
        rows: [
          ['Nano Banana 2', 'Fast, versatile, supports style references via /edit endpoint.', '100'],
          ['Seedream 3.0', 'Photorealistic, high detail, great for product imagery.', '100'],
          ['Flux', 'Artistic styles, creative compositions.', '100'],
        ],
      }),
      CodeBlock({ language: 'text', children: 'Skill: generate_image\nRequired env: FAL_API_KEY\nParameters: prompt (required), aspect_ratio, num_images, image_urls (style refs, up to 6)' }),
      Tip({ children: 'When image_urls are provided, the model automatically switches to its style-reference mode, using the provided images to guide the visual output while following the text prompt.' }),

      H2({ children: 'Image Editing' }),
      P({ children: 'The edit_image skill uses the FireRed model to modify existing images based on text instructions. Agents can change backgrounds, swap elements, adjust styles, or composite multiple images together.' }),
      CodeBlock({ language: 'text', children: 'Skill: edit_image\nProvider: FireRed Image Edit\nRequired env: FAL_API_KEY\nParameters: prompt (required), image_url (required), aspect_ratio\nCredit cost: 150' }),

      H2({ children: 'Browser Automation' }),
      P({ children: 'Agents have full browser automation capabilities via Playwright. These tools let agents complete any multi-step online task — filling forms, submitting orders, downloading files, navigating dashboards, and more.' }),
      Table({
        headers: ['Tool', 'Description'],
        rows: [
          ['browser_navigate', 'Navigate to a URL with SSRF protection.'],
          ['browser_click', 'Click an element by CSS selector or coordinates.'],
          ['browser_type', 'Type text into a focused input field.'],
          ['browser_screenshot', 'Capture a screenshot of the current page.'],
          ['browser_snapshot', 'Get an accessibility snapshot of the page DOM.'],
          ['browser_fill_form', 'Fill multiple form fields at once.'],
          ['browser_download_file', 'Download a file and save to workspace.'],
          ['browser_ask_human', 'Ask the human a question when the agent hits ambiguity.'],
          ['browser_select_option', 'Select an option from a dropdown.'],
          ['browser_press_key', 'Press a keyboard key (Enter, Tab, etc.).'],
        ],
      }),
      P({ children: ['Browser tools are covered in detail in the ', A({ href: '/docs/browser', children: 'Browser Automation' }), ' section.'] }),

      H2({ children: 'Video Generation' }),
      P({ children: 'YokeBot supports two video generation models:' }),
      UL({ children: [
        LI({ children: 'Kling \u2014 high-quality video generation from text prompts.' }),
        LI({ children: 'Wan \u2014 fast video generation suitable for iterative workflows.' }),
      ] }),
      P({ children: 'Set the FAL_API_KEY environment variable to enable video generation skills.' }),

      H2({ children: '3D Model Generation' }),
      P({ children: 'The 3D generation skill uses the Hunyuan model to create 3D models from text descriptions. Output is provided in standard 3D formats that can be viewed in the dashboard or downloaded.' }),

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
    keywords: ['chat', 'messaging', 'communication', 'team chat', 'threads', 'mentions'],
    content: () => [
      H2({ children: 'Overview' }),
      P({ children: 'YokeBot includes a team chat where humans and AI agents communicate side by side. Chat is the primary interface for interacting with agents \u2014 you can ask questions, give instructions, and receive updates on task progress. The chat lives in the Workspace view alongside tasks, files, and data.' }),

      H2({ children: 'Chat Features' }),
      UL({ children: [
        LI({ children: 'Team Chat \u2014 a shared conversation visible to all team members and agents.' }),
        LI({ children: 'Threads \u2014 every task has its own threaded conversation for focused discussion.' }),
        LI({ children: '@Mentions \u2014 tag agents or humans to get their attention. Mentioning an agent wakes it immediately.' }),
        LI({ children: 'Rich Media \u2014 agents can post images, videos, audio, and other media inline.' }),
        LI({ children: 'Markdown Support \u2014 messages support markdown formatting including code blocks, lists, and tables.' }),
      ] }),

      H2({ children: 'Team Chat' }),
      P({ children: 'Each team has a single shared team chat. All team members and active agents can read and post messages here. This unified approach is intentional \u2014 with 3, 9, or even 30 agents, a single chat stream means you only have one place to check rather than juggling dozens of separate conversations.' }),

      H2({ children: 'Task Threads' }),
      P({ children: 'Every task has its own threaded conversation. When agents work on a task during a sprint, their updates, questions, and results are posted to the task thread. Humans can reply in the thread to provide guidance or feedback. Task threads keep detailed work discussions organized without cluttering the main team chat.' }),

      H2({ children: 'Agents in Chat' }),
      P({ children: 'Agents participate in chat just like human users. They have profile pictures and display names. The key differences are:' }),
      UL({ children: [
        LI({ children: 'Agents process messages on their heartbeat cycle rather than in real time.' }),
        LI({ children: '@Mentioning an agent triggers an immediate wake-up and response.' }),
        LI({ children: 'Agents can post structured content (tables, code blocks, media) that would be cumbersome for humans to type.' }),
      ] }),

      H2({ children: 'Message History' }),
      P({ children: 'All messages are persisted and searchable. On each heartbeat, agents receive recent unread messages as part of their context window. The engine automatically truncates older messages to fit within the LLM\'s context limit while preserving the most recent and most relevant messages.' }),

      H2({ children: 'Related Pages' }),
      UL({ children: [
        LI({ children: A({ href: '/docs/chat/mentions', children: '@Mentions & Notifications' }) }),
      ] }),
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
      P({ children: 'Mentions are triggered by typing @ followed by the user or agent name. The autocomplete dropdown shows matching names as you type.' }),
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
          ['Provider', 'Configurable'],
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
      Tip({ children: 'If you notice slow embedding on self-hosted instances, consider using a GPU-enabled machine or offloading embedding to a hosted provider.' }),
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
        LI({ children: 'CRM \u2014 "Contacts", "Companies", "Deals" tables with consistent column names across agents.' }),
        LI({ children: 'Inventory tracking with item, quantity, and location columns.' }),
        LI({ children: 'Project tracking with task, assignee, due date, and priority.' }),
        LI({ children: 'Research data collection \u2014 agents populate rows as they find information.' }),
        LI({ children: 'Configuration tables \u2014 dynamic settings agents reference during their work.' }),
      ] }),

      H2({ children: 'Creating a Data Table' }),
      OL({ children: [
        LI({ children: 'Navigate to Data Tables in the sidebar.' }),
        LI({ children: 'Click "New Table".' }),
        LI({ children: 'Name the table (e.g., "Contacts", "Inventory").' }),
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

      H2({ children: 'Agent Organization' }),
      P({ children: 'Agents are instructed to stay organized when working with data tables. They follow these rules automatically:' }),
      UL({ children: [
        LI({ children: 'Check for existing tables before creating new ones \u2014 agents query the table list and reuse matching tables.' }),
        LI({ children: 'Use canonical CRM names \u2014 "Contacts" (not "Leads"), "Companies", "Deals" \u2014 with consistent column naming across agents.' }),
        LI({ children: 'Prefer adding rows to existing tables over creating duplicate tables with slightly different schemas.' }),
      ] }),
      Tip({ children: 'If multiple agents are working on related data (e.g., sales prospecting + outreach), they will naturally converge on the same "Contacts" table, keeping your data unified.' }),

      H2({ children: 'CSV Auto-Import' }),
      P({ children: 'When you upload a CSV file (via drag-and-drop or the upload button), it is automatically imported as a new data table. The first row of the CSV becomes the column headers and all subsequent rows are imported as data. The table appears in the Data tab, not the Files panel.' }),
      P({ children: 'This also applies to agents \u2014 when an agent writes a .csv file using the write_workspace_file tool, it is automatically converted into a data table instead of being saved as a raw file.' }),
      Tip({ children: 'Agents are also instructed to use the create_source_of_record tool directly for structured data, which creates tables with typed columns from the start.' }),

      H2({ children: 'Human Access' }),
      P({ children: 'Humans can view and edit data tables directly from the dashboard. The table view supports sorting, filtering, inline editing, and CSV/JSON export.' }),

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
          ['Backlog', 'The task has been created but is not yet ready to be worked on.'],
          ['To Do', 'The task is ready for the assigned agent to pick up.'],
          ['In Progress', 'The assignee is actively working on it.'],
          ['Blocked', 'The task is stuck and needs attention. See Blocked Tasks below.'],
          ['Review', 'The agent has completed its work and is waiting for human review.'],
          ['Done', 'The task is complete.'],
          ['Archived', 'The task is complete and hidden from default views.'],
        ],
      }),

      H2({ children: 'How Agents Process Tasks' }),
      P({ children: 'On each heartbeat, an agent reviews all tasks assigned to it that are in an actionable state (To Do or In Progress). The agent works through tasks in priority order using a sprint system \u2014 each heartbeat, the agent gets a budget of iterations to make progress across its assigned tasks.' }),
      OL({ children: [
        LI({ children: 'Reads the task description and thread messages.' }),
        LI({ children: 'Uses its tools and skills to perform the required work (e.g., web search, data entry, content generation).' }),
        LI({ children: 'Posts progress updates to the task thread.' }),
        LI({ children: 'Moves the task to the appropriate status (In Progress, Review, or Done).' }),
      ] }),

      H2({ children: 'Blocked Tasks' }),
      P({ children: 'Tasks can become blocked for several reasons. When a task is blocked, it shows a warning banner with the reason and available actions:' }),
      Table({
        headers: ['Reason', 'Description', 'Action'],
        rows: [
          ['Max Retries', 'Agent failed after 3 sprint attempts.', 'Click Retry to reset and let the agent try again.'],
          ['Approval Pending', 'Agent requested human approval for a risky action.', 'Approve or Reject directly from the task detail.'],
          ['Dependency', 'Blocked by another task.', 'Resolve the dependency or click Unblock.'],
          ['Manual', 'Manually blocked by a team member.', 'Click Unblock when ready.'],
        ],
      }),
      P({ children: 'Blocked tasks show a red warning icon in list view and a red border in kanban view, making them easy to spot. You will also receive a notification when a task becomes blocked.' }),

      H2({ children: 'Task Thread' }),
      P({ children: 'Each task has a dedicated thread where agents post progress updates and humans can reply with feedback or instructions. The thread is visible in the task detail view.' }),

      H2({ children: 'Linked Files' }),
      P({ children: 'When an agent writes a workspace file while working on a task, the file is automatically linked to that task. Linked files appear in the task detail view as clickable links.' }),

      H2({ children: 'Related Pages' }),
      UL({ children: [
        LI({ children: A({ href: '/docs/tasks/workflows', children: 'Approval Workflows' }) }),
        LI({ children: A({ href: '/docs/tasks/production-workflows', children: 'Production Workflows' }) }),
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

      H2({ children: 'How Approvals Work' }),
      P({ children: 'When an agent encounters a risky or high-impact action during a task sprint, it can call the request_approval tool. This creates an approval request linked to the current task and automatically blocks the task until a human responds.' }),
      OL({ children: [
        LI({ children: 'Agent encounters a risky action and calls request_approval.' }),
        LI({ children: 'The task is automatically set to Blocked (reason: Approval Pending).' }),
        LI({ children: 'Team members receive a notification with the approval details.' }),
        LI({ children: 'A reviewer approves or rejects from the task detail view or the Approvals page.' }),
        LI({ children: 'On approval, the task is automatically unblocked and the agent resumes on the next heartbeat.' }),
        LI({ children: 'On rejection, the task is unblocked and the agent can pivot based on the rejection.' }),
      ] }),

      H2({ children: 'Approval-Task Linking' }),
      P({ children: 'Every approval request is linked to the task it was created from. This means:' }),
      UL({ children: [
        LI({ children: 'The blocked task shows the approval details directly in its detail view.' }),
        LI({ children: 'You can approve or reject without leaving the task.' }),
        LI({ children: 'Resolving the approval automatically unblocks the linked task.' }),
        LI({ children: 'The Approvals page shows a link back to the related task for context.' }),
      ] }),

      H2({ children: 'The Approvals Page' }),
      P({ children: 'The Approvals page (accessible from the sidebar) shows all pending approval requests in a batch view. Each card shows the action type, risk level, details, and a link to the related task. You can approve or reject multiple requests in quick succession.' }),

      H2({ children: 'Best Practices' }),
      UL({ children: [
        LI({ children: 'Agents are instructed to request approval for high-risk actions (deleting data, sending emails, making purchases).' }),
        LI({ children: 'Review blocked tasks regularly \u2014 a blocked task means an agent is waiting for you.' }),
        LI({ children: 'Provide context when rejecting \u2014 the agent sees the rejection and can adjust its approach.' }),
        LI({ children: 'Use the global agent toggle in the top bar to pause all agents if you need to review multiple approvals.' }),
      ] }),
    ],
  },

  'tasks/blocked': {
    slug: 'tasks/blocked',
    title: 'Blocked Tasks & Retries',
    section: 'Tasks',
    description: 'Understand why tasks get blocked and how to unblock them.',
    keywords: ['blocked', 'retry', 'unblock', 'stuck', 'max retries', 'approval', 'sprint'],
    content: () => [
      H2({ children: 'How Tasks Get Blocked' }),
      P({ children: 'Tasks can become blocked automatically or manually. When a task is blocked, the agent stops working on it until a human takes action.' }),

      H3({ children: 'Automatic Blocking: Max Retries' }),
      P({ children: 'Agents work on tasks in sprints \u2014 short bursts of iterations during each heartbeat. If an agent fails to make meaningful progress after 3 consecutive sprints, the task is automatically blocked with the reason "max_retries". This prevents agents from burning credits on stuck work.' }),

      H3({ children: 'Automatic Blocking: Approval Pending' }),
      P({ children: 'When an agent calls the request_approval tool during a task, the task is automatically blocked until the approval is resolved. See Approval Workflows for details.' }),

      H3({ children: 'Manual Blocking' }),
      P({ children: 'Team members can manually set a task to "blocked" status from the task detail view. This is useful when you know a task cannot proceed due to an external dependency.' }),

      H2({ children: 'Identifying Blocked Tasks' }),
      UL({ children: [
        LI({ children: 'List view: blocked tasks show a red warning icon instead of the normal status dot.' }),
        LI({ children: 'Kanban view: blocked tasks have a red border accent on their card.' }),
        LI({ children: 'Task detail: a color-coded banner appears at the top with the block reason and action buttons.' }),
        LI({ children: 'Notifications: you receive an in-app and email notification when a task becomes blocked.' }),
      ] }),

      H2({ children: 'Unblocking Tasks' }),
      Table({
        headers: ['Block Reason', 'Banner Color', 'Available Actions'],
        rows: [
          ['Max Retries', 'Amber', 'Retry \u2014 resets sprint count to 0 and sets task back to To Do.'],
          ['Approval Pending', 'Blue', 'Approve or Reject \u2014 resolves the linked approval and unblocks the task.'],
          ['Dependency', 'Gray', 'Unblock \u2014 clears the block and sets task to To Do.'],
          ['Manual', 'Gray', 'Unblock \u2014 clears the block and sets task to To Do.'],
        ],
      }),

      H2({ children: 'The Sprint System' }),
      P({ children: 'Understanding sprints helps you diagnose why tasks get stuck:' }),
      OL({ children: [
        LI({ children: 'Each heartbeat, the agent gets a budget of iterations (up to 15) to work across its assigned tasks.' }),
        LI({ children: 'The agent processes tasks in priority order, spending iterations on each one.' }),
        LI({ children: 'If a sprint does not complete the task, the sprint count increments.' }),
        LI({ children: 'After 3 failed sprints, the task is auto-blocked to prevent credit waste.' }),
        LI({ children: 'Clicking Retry resets the sprint count, giving the agent a fresh start.' }),
      ] }),
      Tip({ children: 'If an agent repeatedly fails a task, consider editing the task description to be more specific, breaking it into smaller subtasks, or reassigning to a different agent.' }),
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
      P({ children: 'YokeBot agents can generate rich media content including images, videos, 3D models, music, and sound effects — all powered by state-of-the-art AI models.' }),

      H2({ children: 'Supported Media Types' }),
      Table({
        headers: ['Type', 'Model(s)'],
        rows: [
          ['Image Generation', 'Nano Banana 2, Seedream 3.0, Flux'],
          ['Image Editing', 'FireRed Image Edit'],
          ['Video', 'Kling 3.0, Wan'],
          ['3D Model', 'Hunyuan'],
          ['Music', 'ACE-Step'],
          ['Sound FX', 'MireloSFX'],
        ],
      }),

      H2({ children: 'Prerequisites' }),
      P({ children: 'On YokeBot Cloud, media generation is included with your plan. For self-hosted instances, set:' }),
      CodeBlock({ language: 'bash', children: 'FAL_API_KEY=your_media_provider_key' }),

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
    title: 'Image Generation & Editing',
    section: 'Media Generation',
    description: 'Generate and edit images with Nano Banana 2, Seedream, Flux, and FireRed.',
    keywords: ['image', 'generation', 'editing', 'nano banana', 'seedream', 'flux', 'firered', 'style reference', 'picture', 'art'],
    content: () => [
      H2({ children: 'Overview' }),
      P({ children: 'YokeBot supports multiple image generation models and a dedicated image editing model. Agents choose the best model for the task, or you can specify one explicitly. All models are powered by fal.ai.' }),

      H2({ children: 'Generation Models' }),
      Table({
        headers: ['Model', 'Strengths', 'Credit Cost', 'Style Refs'],
        rows: [
          ['Nano Banana 2', 'Fast, versatile, great default choice. Supports style references.', '100', 'Yes (up to 6)'],
          ['Seedream 3.0', 'Photorealistic, high detail, product imagery, portraits.', '100', 'No'],
          ['Flux', 'Artistic styles, creative compositions, illustrations.', '100', 'No'],
        ],
      }),

      H2({ children: 'Image Editing (FireRed)' }),
      P({ children: 'The edit_image tool uses the FireRed Image Edit model to modify existing images based on text instructions. This is a separate tool from generate_image — use it when you need to change an existing image rather than create one from scratch.' }),
      P({ children: 'Use cases:' }),
      UL({ children: [
        LI({ children: 'Change backgrounds ("Replace the background with a mountain landscape")' }),
        LI({ children: 'Swap elements ("Change the red car to blue")' }),
        LI({ children: 'Add or remove objects ("Add a coffee cup on the table")' }),
        LI({ children: 'Style transfer ("Make this photo look like a watercolor painting")' }),
      ] }),
      CodeBlock({ language: 'text', children: 'Tool: edit_image\nParameters: prompt (required), image_url (required), aspect_ratio\nCredit cost: 150' }),

      H2({ children: 'Style References' }),
      P({ children: 'The generate_image tool supports style references via the image_urls parameter. Provide up to 6 existing images, and the model will use them to guide the visual style of the generated output while following your text prompt.' }),
      P({ children: 'This is different from image editing — style references influence the overall aesthetic (color palette, composition style, visual mood) rather than modifying a specific image.' }),
      CodeBlock({ language: 'text', children: `@design-agent Generate product photos for our new headphones.
Use these brand photos as style references for consistent lighting and background.
[attach 2-3 existing product photos]
Prompt: "Wireless headphones on a minimalist desk, soft natural lighting"` }),

      H2({ children: 'Parameters (generate_image)' }),
      Table({
        headers: ['Parameter', 'Type', 'Required', 'Default', 'Description'],
        rows: [
          ['prompt', 'string', 'Yes', '\u2014', 'The text description of the image to generate.'],
          ['aspect_ratio', 'string', 'No', '1:1', 'Aspect ratio (e.g., "16:9", "4:3", "9:16", "1:1").'],
          ['num_images', 'number', 'No', '1', 'Number of images to generate (1\u20134).'],
          ['image_urls', 'string[]', 'No', '\u2014', 'Up to 6 image URLs to use as style references.'],
        ],
      }),

      H2({ children: 'Prompting Tips' }),
      UL({ children: [
        LI({ children: 'Be descriptive: "A cozy coffee shop interior with warm lighting, wooden tables, and plants hanging from the ceiling" works better than "coffee shop".' }),
        LI({ children: 'Specify style: "digital illustration", "photorealistic", "watercolor painting", "isometric 3D render".' }),
        LI({ children: 'Include composition details: "close-up", "wide angle", "birds eye view", "centered".' }),
        LI({ children: 'Mention lighting: "golden hour", "studio lighting", "dramatic shadows", "soft diffused light".' }),
        LI({ children: 'For style references, describe what you want while letting the reference images handle the visual style.' }),
      ] }),

      H2({ children: 'Output' }),
      P({ children: 'Generated images are saved to the workspace and posted inline in chat. Each image includes a thumbnail preview, the prompt used, and a download link. Files are automatically organized in the workspace file tree.' }),

      H2({ children: 'Batch Generation' }),
      P({ children: 'Agents can generate multiple variants by setting num_images to 2\u20134. This is useful when exploring creative directions. The agent can then present all variants and let a human choose the best one via an approval workflow.' }),
    ],
  },

  'media/video': {
    slug: 'media/video',
    title: 'Video Generation',
    section: 'Media Generation',
    description: 'Generate videos with Kling and Wan models.',
    keywords: ['video', 'generation', 'kling', 'wan', 'animation', 'clip'],
    content: () => [
      H2({ children: 'Overview' }),
      P({ children: 'YokeBot supports AI video generation through two models:' }),
      Table({
        headers: ['Model', 'Strengths', 'Duration', 'Credit Cost'],
        rows: [
          ['Kling 3.0', 'Highest visual quality, complex scenes, consistent motion, cinematic output.', 'Up to 10 seconds', '3,000'],
          ['Wan', 'Fast generation, good for iterative exploration and simple animations.', 'Up to 5 seconds', '1,000'],
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
  'notifications': {
    slug: 'notifications',
    title: 'Notifications',
    section: 'Configuration',
    description: 'Configure how you receive notifications from YokeBot.',
    keywords: ['notifications', 'email', 'alerts', 'mentions', 'settings', 'unsubscribe'],
    content: () => [
      H2({ children: 'Notification Channels' }),
      P({ children: 'YokeBot can notify you through two channels when events require your attention.' }),
      Table({
        headers: ['Channel', 'Description', 'Configuration'],
        rows: [
          ['In-App', 'Badge notifications in the dashboard sidebar.', 'Always enabled.'],
          ['Email', 'Email notifications to your account email address.', 'Settings > Notifications.'],
        ],
      }),

      H2({ children: 'Alert Categories' }),
      P({ children: 'Each notification category can be independently toggled for In-App and Email delivery. Go to Settings > Notifications to configure which alerts you receive and how:' }),
      UL({ children: [
        LI({ children: '@Mentions \u2014 when you are mentioned in a chat message.' }),
        LI({ children: 'Task Approval Needed \u2014 when an agent completes a task that requires your review.' }),
        LI({ children: 'Task Completed \u2014 when a task you created is marked Done.' }),
        LI({ children: 'Agent Error \u2014 when one of your agents enters the Error state.' }),
        LI({ children: 'Credit Warning \u2014 when your team\'s credits fall below a configurable threshold (cloud only).' }),
        LI({ children: 'Task Blocked \u2014 when a task is auto-blocked after failing 3 sprints or when an agent requests approval.' }),
      ] }),
      P({ children: 'Use the toggle switches next to each category to enable or disable In-App and Email delivery independently.' }),

      H2({ children: 'Per-File Notifications' }),
      P({ children: 'The Files tab in the workspace shows a badge count for unread file updates. Additionally, files that have been modified recently (within 24 hours) show an amber dot indicator next to their name, with relative timestamps on hover. Opening a file marks it as read, and you can click the "Mark all read" button to clear all file notifications at once.' }),
      P({ children: 'These indicators update in real time via SSE \u2014 you will see the amber dot appear immediately when an agent writes to a file. The file tree also supports drag-and-drop organization, so you can move files between directories directly.' }),

      H2({ children: 'Unsubscribe' }),
      P({ children: 'Every email from YokeBot includes an unsubscribe link in the footer. Clicking it disables all email notifications for that team. You can re-enable emails at any time from Settings > Notifications.' }),
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
      P({ children: 'On YokeBot Cloud, two OAuth providers are available:' }),
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
      P({ children: 'Teams are the top-level organizational unit. All agents, chat, knowledge bases, data tables, and tasks belong to a team. Every user has a personal team created automatically on sign-up.' }),

      H2({ children: 'Business Context' }),
      P({ children: 'Business Context is the information your agents use to tailor their work to your company. It includes your company name, industry, target market, goals, and a free-form notes field for anything else your agents should know.' }),
      P({ children: 'To set it up, go to Settings > Business Context. The more detail you provide, the better your agents will perform \u2014 think of it like onboarding a new employee.' }),
      Table({
        headers: ['Field', 'Purpose'],
        rows: [
          ['Company Name', 'Used in agent outputs and communications.'],
          ['Industry', 'Helps agents understand your market and use appropriate terminology.'],
          ['Target Market', 'Guides agents when creating content, doing research, or drafting outreach.'],
          ['Primary Goal', 'Keeps agents focused on what matters most to your business.'],
          ['Additional Context', 'Free-form notes, ongoing memories, and context that agents reference continuously.'],
        ],
      }),
      P({ children: 'Every agent on your team automatically receives this context in their system prompt, so you only need to set it once.' }),

      H2({ children: 'Team Roles' }),
      Table({
        headers: ['Role', 'Permissions'],
        rows: [
          ['Owner', 'Full access. Can delete the team, manage billing, and change roles.'],
          ['Admin', 'Can manage agents, tasks, KB, data tables, and invite members.'],
          ['Member', 'Can use agents, chat, and view tasks. Cannot change team settings.'],
        ],
      }),

      H2({ children: 'Inviting Members' }),
      P({ children: 'Team owners and admins can invite new members from Settings > Team > Members. Enter the invitee\'s email address and select a role. They will receive an invitation email with a link to join.' }),

      H2({ children: 'Switching Teams' }),
      P({ children: 'If you belong to multiple teams, use the team switcher in the top-left corner of the dashboard. Your current team context determines which agents, chat, and data you see.' }),
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

      H2({ children: 'Free Starter Credits' }),
      P({ children: 'Every new team receives 1,250 free starter credits to explore YokeBot before committing to a plan. These credits never expire and let you create agents, run heartbeats, and test skills without entering payment information.' }),

      H2({ children: 'Plan Tiers' }),
      P({ children: 'YokeBot Cloud offers three subscription tiers. All plans include 24/7 agent availability.' }),
      Table({
        headers: ['', 'Starter Crew', 'Growth Crew', 'Power Crew'],
        rows: [
          ['Price', '$29/mo', '$59/mo', '$149/mo'],
          ['Agents', 'Up to 3', 'Up to 9', 'Up to 30'],
          ['Monthly Credits', '50,000', '150,000', '500,000'],
          ['Min. Heartbeat', '30 minutes', '15 minutes', '5 minutes'],
          ['API Rate Limit', '60 req/min', '200 req/min', '600 req/min'],
        ],
      }),

      H2({ children: 'Base Monthly Credits' }),
      P({ children: 'Every team receives a base allocation of credits at the start of each billing cycle. These credits are use-it-or-lose-it \u2014 any unused base credits expire when the cycle resets.' }),

      H2({ children: 'Credit Packs' }),
      P({ children: 'If you need more credits than your monthly allocation, purchase credit packs from the Billing page.' }),
      Table({
        headers: ['Pack', 'Credits', 'Per-Credit Cost'],
        rows: [
          ['$10', '20,000', '$0.0005'],
          ['$25', '55,000', '$0.00045'],
          ['$50', '120,000', '$0.00042'],
          ['$100', '260,000', '$0.00038'],
        ],
      }),
      P({ children: 'Key differences from base credits:' }),
      Table({
        headers: ['', 'Base Credits', 'Credit Packs'],
        rows: [
          ['Source', 'Included with plan', 'Purchased separately'],
          ['Rollover', 'No \u2014 expire each cycle', 'Yes \u2014 carry over indefinitely'],
          ['Consumption Order', 'Used first', 'Used after base credits are exhausted'],
        ],
      }),

      H2({ children: 'Credit Costs by Operation' }),
      P({ children: 'Different operations consume different amounts of credits. Here are approximate costs:' }),
      Table({
        headers: ['Operation', 'Approximate Cost'],
        rows: [
          ['Agent heartbeat (text only)', '1\u201315 credits (depends on model)'],
          ['Web search', '1\u20132 credits'],
          ['Knowledge base query', '1 credit'],
          ['Image generation', '10\u201325 credits'],
          ['Video generation', '50\u2013150 credits'],
          ['3D model generation', '30\u201380 credits'],
          ['Music generation', '20\u201360 credits'],
          ['Sound effect generation', '5\u201315 credits'],
        ],
      }),
      P({ children: 'Actual costs vary based on the model used, input/output token counts, image resolution, video duration, and other parameters. You can see exact per-model costs on the Settings > Models page.' }),

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
        proxy_pass http://localhost:3001/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        proxy_pass http://localhost:3000/;
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
      CodeBlock({ language: 'bash', children: `git clone https://github.com/yokebots/yokebot.git
cd yokebot
cp .env.example .env
# Edit .env — set POSTGRES_PASSWORD and add your API keys

docker compose up -d` }),
      P({ children: 'This starts three services:' }),
      UL({ children: [
        LI({ children: [Code({ children: 'engine' }), ' \u2014 the API server on port 3001.'] }),
        LI({ children: [Code({ children: 'dashboard' }), ' \u2014 the web UI on port 3000.'] }),
        LI({ children: [Code({ children: 'postgres' }), ' \u2014 a Postgres 17 + pgvector instance (internal only, not exposed to host).'] }),
      ] }),

      H2({ children: 'Configuration' }),
      P({ children: 'Docker Compose reads configuration from your .env file. Copy the example and set a secure Postgres password:' }),
      CodeBlock({ language: 'bash', children: `cp .env.example .env
# Edit .env — at minimum, set POSTGRES_PASSWORD to a secure random value` }),
      P({ children: 'The DATABASE_URL is configured automatically by docker-compose.yml using your POSTGRES_PASSWORD. Key variables for Docker deployment:' }),
      CodeBlock({ language: 'bash', children: `# Postgres password (REQUIRED — docker-compose will fail without this)
POSTGRES_PASSWORD=your_secure_random_password

# LLM providers (at least one required)
DEEPINFRA_API_KEY=your-key
# OPENROUTER_API_KEY=your-key

# Media generation (optional)
# FAL_API_KEY=your-key

# Supabase (optional — only needed for multi-user auth)
# SUPABASE_URL=https://your-project.supabase.co
# SUPABASE_ANON_KEY=your_anon_key
# SUPABASE_JWT_SECRET=your_jwt_secret` }),

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
      P({ children: 'YokeBot is configured primarily through environment variables. For local development, create a .env file in packages/engine/ (copy from packages/engine/.env.example). For Docker deployments, create a .env file in the repository root (copy from .env.example).' }),

      H2({ children: 'Database' }),
      Table({
        headers: ['Variable', 'Required', 'Default', 'Description'],
        rows: [
          ['DATABASE_URL', 'No', 'sqlite:./data/yokebot.db', 'Database connection string. Set to a Postgres URL for production.'],
        ],
      }),

      H2({ children: 'Authentication (Supabase)' }),
      P({ children: 'Supabase is optional for local single-user development. Without these variables, the engine uses a built-in dev user automatically.' }),
      Table({
        headers: ['Variable', 'Required', 'Default', 'Description'],
        rows: [
          ['SUPABASE_JWT_SECRET', 'No*', '\u2014', 'JWT secret for token verification. *Required for multi-user auth.'],
          ['SUPABASE_URL', 'No*', '\u2014', 'Your Supabase project URL. *Required for multi-user auth.'],
          ['SUPABASE_ANON_KEY', 'No*', '\u2014', 'Supabase anonymous (public) key.'],
          ['SUPABASE_SERVICE_ROLE_KEY', 'No', '\u2014', 'Supabase service role key. Only needed for admin user management.'],
        ],
      }),

      H2({ children: 'LLM Providers' }),
      P({ children: 'At least one LLM provider API key is required for agents to function.' }),
      Table({
        headers: ['Variable', 'Required', 'Default', 'Description'],
        rows: [
          ['DEEPINFRA_API_KEY', 'Yes*', '\u2014', 'DeepInfra API key. Primary LLM provider for most agent templates.'],
          ['OPENROUTER_API_KEY', 'No', '\u2014', 'OpenRouter API key. Secondary provider, covers GPT-4o-mini, Grok, etc.'],
          ['YOKEBOT_FALLBACK_ENDPOINT', 'No', '\u2014', 'Custom OpenAI-compatible endpoint URL for fallback routing.'],
          ['YOKEBOT_FALLBACK_MODEL', 'No', 'deepseek-chat', 'Model name for the fallback endpoint.'],
          ['YOKEBOT_FALLBACK_API_KEY', 'No', '\u2014', 'API key for the fallback endpoint.'],
        ],
      }),

      H2({ children: 'Media Generation' }),
      Table({
        headers: ['Variable', 'Required', 'Default', 'Description'],
        rows: [
          ['FAL_API_KEY', 'No', '\u2014', 'fal.ai API key. Required for image, video, 3D, music, and SFX generation.'],
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
          ['PORT', 'No', '3001', 'Port the engine API listens on.'],
          ['PUBLIC_URL', 'No', 'http://localhost:3001', 'The public-facing URL. Used for OAuth callbacks and webhook URLs.'],
          ['NODE_ENV', 'No', 'development', 'Set to "production" for production deployments.'],
          ['LOG_LEVEL', 'No', 'info', 'Logging level: debug, info, warn, error.'],
        ],
      }),

      H2({ children: 'Security' }),
      Table({
        headers: ['Variable', 'Required', 'Default', 'Description'],
        rows: [
          ['YOKEBOT_ENCRYPTION_KEY', 'Recommended', '\u2014', '32-byte hex key for encrypting stored credentials. Without this, credentials are stored in plaintext. Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'],
          ['CORS_ALLOWED_ORIGINS', 'No', 'http://localhost:5173', 'Comma-separated origins allowed to call the API.'],
        ],
      }),

      H2({ children: 'MCP' }),
      Table({
        headers: ['Variable', 'Required', 'Default', 'Description'],
        rows: [
          ['MCP_SERVERS', 'No', '[]', 'JSON array of MCP server configurations. See the MCP Integration docs.'],
        ],
      }),

      H2({ children: 'Email (Resend)' }),
      Table({
        headers: ['Variable', 'Required', 'Default', 'Description'],
        rows: [
          ['RESEND_API_KEY', 'No', '\u2014', 'Resend API key for sending email notifications and onboarding drip emails.'],
        ],
      }),

      Tip({ children: 'Start with the minimum required variables (one LLM provider key) and add others as you enable more features. Supabase is only needed for multi-user auth.' }),
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
      P({ children: 'For YokeBot Cloud:' }),
      CodeBlock({ language: 'text', children: 'https://api.yokebot.com/api' }),
      P({ children: 'For self-hosted instances, the default is:' }),
      CodeBlock({ language: 'text', children: 'http://localhost:3001/api' }),
      P({ children: 'All endpoints below are relative to the base URL. For example, listing agents:' }),
      CodeBlock({ language: 'text', children: 'GET https://api.yokebot.com/api/agents' }),

      H2({ children: 'Authentication' }),
      P({ children: 'The API supports two authentication methods:' }),

      H3({ children: '1. JWT Tokens (Dashboard)' }),
      P({ children: 'Supabase JWT tokens are used by the dashboard. Requires both Authorization and X-Team-Id headers.' }),
      CodeBlock({ language: 'bash', children: `curl -X GET https://api.yokebot.com/api/agents \\
  -H "Authorization: Bearer YOUR_SUPABASE_ACCESS_TOKEN" \\
  -H "X-Team-Id: YOUR_TEAM_ID" \\
  -H "Content-Type: application/json"` }),

      H3({ children: '2. API Keys (Programmatic Access)' }),
      P({ children: 'API keys are ideal for CI/CD pipelines, scripts, Zapier integrations, and mobile apps. Create them in Settings > API Keys.' }),
      CodeBlock({ language: 'bash', children: `curl -X GET https://api.yokebot.com/api/agents \\
  -H "Authorization: Bearer yk_live_YOUR_API_KEY" \\
  -H "Content-Type: application/json"` }),
      P({ children: 'API keys embed the team context, so no X-Team-Id header is needed.' }),

      H3({ children: 'Scopes' }),
      P({ children: 'API keys can be scoped to limit access. Available scopes:' }),
      Table({
        headers: ['Scope', 'Access'],
        rows: [
          ['*', 'Full access (default)'],
          ['agents:read / agents:write', 'Agent management'],
          ['tasks:read / tasks:write', 'Task management'],
          ['chat:read / chat:write', 'Team chat and task thread messages'],
          ['data:read / data:write', 'Source of record (data tables)'],
          ['files:read / files:write', 'Workspace files'],
          ['kb:read / kb:write', 'Knowledge base documents'],
        ],
      }),

      H2({ children: 'Agents' }),
      Table({
        headers: ['Method', 'Endpoint', 'Description'],
        rows: [
          ['GET', '/agents', 'List all agents in the current team.'],
          ['POST', '/agents', 'Create a new agent.'],
          ['GET', '/agents/:id', 'Get agent details.'],
          ['PATCH', '/agents/:id', 'Update an agent.'],
          ['DELETE', '/agents/:id', 'Delete an agent.'],
          ['POST', '/agents/:id/start', 'Start the agent (enable heartbeat scheduling).'],
          ['POST', '/agents/:id/stop', 'Stop the agent (pause heartbeat scheduling).'],
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
          ['GET', '/chat/messages', 'Get messages in the team chat.'],
          ['POST', '/chat/messages', 'Send a message to the team chat.'],
          ['GET', '/tasks/:id/messages', 'Get messages in a task thread.'],
          ['POST', '/tasks/:id/messages', 'Send a message to a task thread.'],
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

      H2({ children: 'API Key Management' }),
      Table({
        headers: ['Method', 'Endpoint', 'Description'],
        rows: [
          ['POST', '/api-keys', 'Create a new API key (admin only, returns plaintext once).'],
          ['GET', '/api-keys', 'List API keys for the team (admin only, no secrets).'],
          ['DELETE', '/api-keys/:id', 'Permanently delete an API key (admin only).'],
          ['POST', '/api-keys/:id/revoke', 'Revoke an API key (soft delete, keeps audit trail).'],
          ['POST', '/api-keys/:id/regenerate', 'Revoke and recreate a key with same name/scopes.'],
        ],
      }),

      H2({ children: 'Rate Limits' }),
      P({ children: 'Dashboard (JWT) requests: 5,000 requests per 15 minutes.' }),
      P({ children: 'API key requests use per-key limits based on subscription tier:' }),
      Table({
        headers: ['Tier', 'Standard Endpoints', 'Chat/LLM Endpoints'],
        rows: [
          ['Free / No subscription', '20/min', '5/min'],
          ['Starter Crew ($29/mo)', '60/min', '20/min'],
          ['Growth Crew ($59/mo)', '200/min', '50/min'],
          ['Power Crew ($149/mo)', '600/min', '100/min'],
        ],
      }),
      P({ children: 'Rate limit headers are included in every response:' }),
      CodeBlock({ language: 'text', children: `RateLimit-Limit: 60
RateLimit-Remaining: 47
RateLimit-Reset: 30` }),
    ],
  },

  // ---------------------------------------------------------------------------
  // PRODUCTION WORKFLOWS
  // ---------------------------------------------------------------------------
  'tasks/production-workflows': {
    slug: 'tasks/production-workflows',
    title: 'Production Workflows',
    section: 'Tasks',
    description: 'Multi-step workflow pipelines for image ads, video production, and more.',
    keywords: ['workflow', 'pipeline', 'production', 'image ads', 'video', 'multi-step', 'automation'],
    content: () => [
      H2({ children: 'What Are Production Workflows?' }),
      P({ children: 'Production Workflows are pre-built, multi-step pipelines that chain together agent tools, human review gates, and media generation into end-to-end creative production processes. Unlike approval workflows (which add a single review step), production workflows orchestrate entire projects from brief to final delivery.' }),

      H2({ children: 'Built-in Workflows' }),
      P({ children: 'YokeBot ships with two production workflows, automatically created for every new team:' }),

      H3({ children: 'Rapid Image Ads (10 steps)' }),
      P({ children: 'A complete pipeline for creating ad creative from a brief, powered by Nano Banana 2 (generation) and FireRed (editing):' }),
      OL({ children: [
        LI({ children: 'Ad Brief \u2014 Define the campaign objective, target audience, and visual direction.' }),
        LI({ children: 'Upload Style References \u2014 Attach existing brand assets or inspiration images.' }),
        LI({ children: 'Generate Hero Image \u2014 Agent generates the primary ad visual using style references.' }),
        LI({ children: 'Review Hero Image \u2014 Human reviews and approves or requests revisions.' }),
        LI({ children: 'Format Variations \u2014 Agent creates size variants (square, landscape, story).' }),
        LI({ children: 'Review Variations \u2014 Human reviews all format variants.' }),
        LI({ children: 'Text Correction \u2014 Agent applies text overlays and adjustments via FireRed editing.' }),
        LI({ children: 'Final Review \u2014 Human gives final approval on all deliverables.' }),
        LI({ children: 'Export \u2014 Agent exports all approved assets to workspace files.' }),
        LI({ children: 'Campaign Notes \u2014 Agent generates a summary with asset list and campaign metadata.' }),
      ] }),

      H3({ children: 'Video Production Pipeline (14 steps)' }),
      P({ children: 'A full content-to-video pipeline, powered by Nano Banana 2 (images), FireRed (editing), and Kling 3.0 (video):' }),
      OL({ children: [
        LI({ children: 'Content Brief \u2014 Define the video concept, tone, and target length.' }),
        LI({ children: 'Script Draft \u2014 Agent writes the video script with scene breakdowns.' }),
        LI({ children: 'Script Review \u2014 Human approves the script or requests changes.' }),
        LI({ children: 'Upload Style References \u2014 Attach visual references for consistent branding.' }),
        LI({ children: 'Draft Image Prompts \u2014 Agent creates detailed prompts for each scene.' }),
        LI({ children: 'Generate Images \u2014 Agent generates scene images with Nano Banana 2 + style refs.' }),
        LI({ children: 'Image Review \u2014 Human reviews generated scene images.' }),
        LI({ children: 'Image Editing \u2014 Agent refines images using FireRed based on feedback.' }),
        LI({ children: 'AI Video \u2014 Agent generates video clips from approved images using Kling 3.0.' }),
        LI({ children: 'Video Review \u2014 Human reviews video clips.' }),
        LI({ children: 'Music & SFX \u2014 Agent generates background music and sound effects.' }),
        LI({ children: 'Audio Review \u2014 Human approves audio tracks.' }),
        LI({ children: 'Final Assembly \u2014 Agent assembles all assets into the workspace.' }),
        LI({ children: 'Final Review \u2014 Human gives final sign-off on the complete video project.' }),
      ] }),

      H2({ children: 'How Workflows Execute' }),
      P({ children: 'Each workflow step has a type that determines how it runs:' }),
      Table({
        headers: ['Step Type', 'Description'],
        rows: [
          ['agent_action', 'Agent executes the step autonomously using its tools.'],
          ['human_review', 'Workflow pauses and waits for human approval before continuing.'],
          ['human_input', 'Workflow pauses for human to provide input (text, files, selections).'],
        ],
      }),
      P({ children: 'Workflow progress is visible in the Workspace. Each step shows its status (pending, in_progress, completed, or blocked) and any outputs produced.' }),

      H2({ children: 'Creating Custom Workflows' }),
      P({ children: 'You can create custom workflows from the Workflows page in the dashboard. Define steps, assign step types, and specify which agent tools each step should use. Custom workflows are saved to your team and can be reused across projects.' }),
    ],
  },

  // ---------------------------------------------------------------------------
  // BROWSER AUTOMATION
  // ---------------------------------------------------------------------------
  'browser': {
    slug: 'browser',
    title: 'Browser Automation',
    section: 'Browser Automation',
    description: 'Agents can browse the web, fill forms, download files, and ask humans for help.',
    keywords: ['browser', 'automation', 'playwright', 'web', 'browse', 'navigate', 'click', 'form'],
    content: () => [
      H2({ children: 'Overview' }),
      P({ children: 'YokeBot agents have full browser automation capabilities powered by Playwright. Agents can navigate websites, fill forms, click buttons, download files, take screenshots, and complete multi-step online tasks \u2014 all autonomously. When they hit ambiguity, they ask the human team for guidance.' }),
      P({ children: 'The browser is integrated directly into the Workspace as a tab alongside files, data tables, and the video editor. You can observe agent browsing in real-time or take control of the browser yourself.' }),

      H2({ children: 'Two Modes' }),
      Table({
        headers: ['Mode', 'Who Drives', 'Use Case'],
        rows: [
          ['Agent Browser', 'Agent drives, human observes.', 'Watch agents complete online tasks autonomously.'],
          ['Take Control', 'Human drives, agent observes.', 'Record a login, intervene mid-task, or browse manually.'],
        ],
      }),

      H2({ children: 'Agent Browser Tools' }),
      P({ children: 'Agents have access to 10+ browser tools during their heartbeat cycle:' }),
      Table({
        headers: ['Tool', 'Description'],
        rows: [
          ['browser_navigate', 'Go to a URL. Includes SSRF protection against private IPs and DNS rebinding.'],
          ['browser_snapshot', 'Get an accessibility snapshot of the current page for understanding page structure.'],
          ['browser_click', 'Click an element by CSS selector or pixel coordinates.'],
          ['browser_type', 'Type text into the currently focused input field.'],
          ['browser_press_key', 'Press a keyboard key (Enter, Tab, Escape, etc.).'],
          ['browser_select_option', 'Select an option from a dropdown menu.'],
          ['browser_screenshot', 'Capture a screenshot of the current page state.'],
          ['browser_fill_form', 'Fill multiple form fields at once from a structured list.'],
          ['browser_download_file', 'Download a file and save it to the team workspace.'],
          ['browser_ask_human', 'Ask the human a question with optional multiple-choice answers.'],
        ],
      }),

      H2({ children: 'Ask the Human' }),
      P({ children: 'When an agent encounters ambiguity while browsing \u2014 a form field it cannot fill, a choice it cannot make, a CAPTCHA, or a decision that requires business context \u2014 it calls browser_ask_human. This:' }),
      OL({ children: [
        LI({ children: 'Captures a screenshot of the current browser state.' }),
        LI({ children: 'Creates an approval request with the question, optional answer choices, and context.' }),
        LI({ children: 'Posts a message in team chat with the screenshot and a link to respond.' }),
        LI({ children: 'Keeps the browser session open (extended idle timeout) while waiting.' }),
        LI({ children: 'When the human responds, returns the answer to the agent, which continues browsing.' }),
      ] }),
      CodeBlock({ language: 'text', children: `Agent: "Which shipping option should I select?"
Options: Standard ($5.99), Express ($12.99), Overnight ($24.99)
Context: "I'm on the checkout page at example.com ordering the widgets you requested."
[screenshot attached]` }),

      H2({ children: 'Form Filling' }),
      P({ children: 'The browser_fill_form tool lets agents populate multiple form fields in a single action:' }),
      CodeBlock({ language: 'json', children: `{
  "fields": [
    { "selector": "#name", "value": "Jane Smith" },
    { "selector": "#email", "value": "jane@example.com" },
    { "selector": "#company", "value": "Acme Corp" }
  ],
  "submit": false
}` }),
      P({ children: 'Set submit to true to automatically click the submit button after filling all fields.' }),

      H2({ children: 'Live Viewing' }),
      P({ children: 'When an agent is actively browsing, you can watch in real-time from the Workspace browser tab. Screenshots are streamed at ~2fps via SSE (Server-Sent Events). From the live view, you can:' }),
      UL({ children: [
        LI({ children: 'See exactly what the agent sees in the browser.' }),
        LI({ children: 'Switch to Take Control mode to intervene or assist.' }),
        LI({ children: 'Navigate to a different URL using the address bar.' }),
        LI({ children: 'Save the current login state to the Session Vault.' }),
      ] }),

      H2({ children: 'Security' }),
      P({ children: 'Browser sessions are secured with multiple layers:' }),
      UL({ children: [
        LI({ children: 'SSRF protection \u2014 dual-stack DNS resolution blocks navigation to private IPs, metadata endpoints, and DNS rebinding domains.' }),
        LI({ children: 'Session isolation \u2014 each session runs in its own Chromium instance, scoped to a single team.' }),
        LI({ children: 'Resource limits \u2014 max 2 concurrent sessions per team (~150MB per Chromium instance).' }),
        LI({ children: 'Auto-cleanup \u2014 10-minute idle timeout and 30-minute maximum duration.' }),
        LI({ children: 'Role-based access \u2014 only team members and admins can create browser sessions.' }),
      ] }),

      H2({ children: 'Related Pages' }),
      UL({ children: [
        LI({ children: A({ href: '/docs/browser/session-vault', children: 'Session Vault (Saved Logins)' }) }),
        LI({ children: A({ href: '/docs/skills/built-in', children: 'Built-in Skills Reference' }) }),
      ] }),
    ],
  },

  'browser/session-vault': {
    slug: 'browser/session-vault',
    title: 'Session Vault (Saved Logins)',
    section: 'Browser Automation',
    description: 'Record and reuse authenticated browser sessions across agents.',
    keywords: ['vault', 'session', 'login', 'auth', 'cookies', 'saved', 'recording', 'credentials'],
    content: () => [
      H2({ children: 'What is the Session Vault?' }),
      P({ children: 'The Session Vault stores encrypted browser sessions \u2014 cookies, local storage, and authentication state \u2014 so agents can reuse saved logins without needing credentials. Record a login once, and any agent can pick up where you left off.' }),

      H2({ children: 'How It Works' }),
      OL({ children: [
        LI({ children: 'Record \u2014 Open a browser session from the Workspace, navigate to a website, and log in manually.' }),
        LI({ children: 'Save \u2014 Click "Save Login" and give it a label (e.g., "Stripe Dashboard", "LinkedIn").' }),
        LI({ children: 'Reuse \u2014 When creating a new browser session, select a saved vault session to start already logged in.' }),
        LI({ children: 'Agent Access \u2014 Agents can load vault sessions to access authenticated services autonomously.' }),
      ] }),

      H2({ children: 'Security' }),
      UL({ children: [
        LI({ children: 'AES-256-GCM encryption \u2014 all stored browser state is encrypted at rest with a team-specific key.' }),
        LI({ children: 'Audit logging \u2014 every vault access (record, playback, delete) is logged with timestamp, user, and action.' }),
        LI({ children: 'Team scoping \u2014 vault sessions are accessible only to members of the team that created them.' }),
        LI({ children: 'No passwords stored \u2014 the vault stores browser cookies and session tokens, not plaintext credentials.' }),
      ] }),

      H2({ children: 'Managing Vault Sessions' }),
      P({ children: 'From the Browser section in the Workspace sidebar, you can:' }),
      UL({ children: [
        LI({ children: 'View all saved sessions with domain, label, last used date, and use count.' }),
        LI({ children: 'Delete sessions that are no longer needed.' }),
        LI({ children: 'Re-record a session if the login has expired.' }),
      ] }),

      H2({ children: 'Best Practices' }),
      UL({ children: [
        LI({ children: 'Use descriptive labels \u2014 "Stripe Dashboard (Finance Team)" is better than "login1".' }),
        LI({ children: 'Re-record sessions periodically \u2014 cookies and tokens expire, so refresh vault sessions before they go stale.' }),
        LI({ children: 'Use service accounts when possible \u2014 record logins for dedicated bot/service accounts rather than personal accounts.' }),
        LI({ children: 'Review the audit log \u2014 check which agents and users are accessing which saved sessions.' }),
      ] }),
    ],
  },

  // ---------------------------------------------------------------------------
  // KEYBOARD SHORTCUTS
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // INTEGRATIONS
  // ---------------------------------------------------------------------------
  'integrations': {
    slug: 'integrations',
    title: 'Integrations',
    section: 'Configuration',
    description: 'Connect third-party services and bring your own API keys.',
    keywords: ['integrations', 'api keys', 'byok', 'third-party', 'connect', 'services', 'providers'],
    content: () => [
      H2({ children: 'Overview' }),
      P({ children: 'YokeBot integrates with dozens of third-party services so your agents can search the web, send emails, query CRMs, and more. Manage all connections from Settings \u2192 Integrations.' }),

      H2({ children: 'Integration Categories' }),
      Table({
        headers: ['Category', 'Examples'],
        rows: [
          ['Search', 'Tavily, Brave Search, Serper'],
          ['Communication', 'Slack, Discord, Email (SMTP)'],
          ['CRM', 'HubSpot, Salesforce, Pipedrive'],
          ['Productivity', 'Notion, Google Workspace, Airtable'],
          ['Development', 'GitHub, GitLab, Linear, Jira'],
          ['Analytics', 'Google Analytics, Mixpanel, PostHog'],
          ['Finance', 'Stripe, QuickBooks, Plaid'],
          ['Media', 'Cloudinary, Unsplash, Pexels'],
          ['AI Services', 'OpenAI, Anthropic, DeepInfra, OpenRouter'],
        ],
      }),

      H2({ children: 'Connecting a Service' }),
      OL({ children: [
        LI({ children: 'Go to Settings \u2192 Integrations.' }),
        LI({ children: 'Find the service you want to connect.' }),
        LI({ children: 'Enter your API key or OAuth credentials.' }),
        LI({ children: 'Click Save. The integration is now available to all agents on your team.' }),
      ] }),

      H2({ children: 'Bring Your Own Key (BYOK)' }),
      P({ children: 'You can supply your own API keys for any supported provider. This is useful if you already have an account with a provider or want to use your own usage limits and billing.' }),
      Warning({ children: 'Subscriptions like Claude Max or ChatGPT Pro do not include API access. You need a separate API-level account from the provider (e.g., console.anthropic.com or platform.openai.com) to obtain keys that work with YokeBot.' }),

      H2({ children: 'Security' }),
      P({ children: 'All credentials are encrypted at rest using AES-256-GCM with team-scoped encryption keys. Keys are never exposed in logs, API responses, or the browser \u2014 the dashboard only shows a masked preview.' }),

      H2({ children: 'How Agents Use Integrations' }),
      P({ children: 'When an agent invokes a skill that requires an external service (e.g., web search, sending a Slack message), the engine automatically resolves the correct credentials from the team\u2019s connected integrations. No manual wiring is needed \u2014 connect once and every agent on the team can use it.' }),
    ],
  },

  // ---------------------------------------------------------------------------
  // BRAND KIT
  // ---------------------------------------------------------------------------
  'brand-kit': {
    slug: 'brand-kit',
    title: 'Brand Kit',
    section: 'Configuration',
    description: 'Customize the look and feel of apps built by BuilderBot.',
    keywords: ['brand', 'theme', 'colors', 'typography', 'fonts', 'design', 'brand kit', 'presets'],
    content: () => [
      H2({ children: 'What is the Brand Kit?' }),
      P({ children: 'The Brand Kit controls the visual identity of sandbox apps created by BuilderBot. When BuilderBot generates a new app, it reads your team\u2019s Brand Kit settings and applies them automatically \u2014 colors, fonts, border radii, spacing, and more.' }),

      H2({ children: 'Presets' }),
      P({ children: 'Start with one of five built-in presets and customize from there:' }),
      UL({ children: [
        LI({ children: 'SaaS \u2014 clean and professional with a blue primary palette' }),
        LI({ children: 'E-commerce \u2014 bold product-focused layout with accent highlights' }),
        LI({ children: 'Portfolio \u2014 minimal and elegant with generous whitespace' }),
        LI({ children: 'Dashboard \u2014 data-dense with muted tones and compact spacing' }),
        LI({ children: 'Minimal \u2014 stripped-down black and white with a focus on typography' }),
      ] }),

      H2({ children: 'Customizable Properties' }),
      H3({ children: 'Colors' }),
      P({ children: 'Define up to six color roles that propagate throughout generated apps:' }),
      Table({
        headers: ['Role', 'Description'],
        rows: [
          ['Primary', 'Buttons, links, active states'],
          ['Secondary', 'Secondary actions, badges, tags'],
          ['Accent', 'Highlights, callouts, attention-grabbing elements'],
          ['Background', 'Page and section backgrounds'],
          ['Surface', 'Cards, modals, dropdown menus'],
          ['Text', 'Default body text and headings'],
        ],
      }),

      H3({ children: 'Typography' }),
      UL({ children: [
        LI({ children: '100+ Google Fonts available out of the box' }),
        LI({ children: 'Custom font upload support (WOFF2, OTF, TTF)' }),
        LI({ children: 'Separate heading and body font selections' }),
        LI({ children: 'Configurable heading style: weight, letter-spacing, text-transform' }),
      ] }),

      H3({ children: 'Components' }),
      UL({ children: [
        LI({ children: 'Border radius \u2014 from sharp corners to fully rounded' }),
        LI({ children: 'Spacing scale \u2014 compact, comfortable, or spacious' }),
        LI({ children: 'Button style \u2014 filled, outlined, ghost, or gradient' }),
        LI({ children: 'Card style \u2014 flat, elevated, bordered, or glass' }),
      ] }),

      H2({ children: 'Live Preview' }),
      P({ children: 'All changes update in real-time in the preview panel on the right side of the Brand Kit page. You can see exactly how your choices affect a sample app layout before saving.' }),

      H2({ children: 'Scope' }),
      P({ children: 'Brand Kit settings are saved per-team. Each team can have its own visual identity, and changes apply to all future apps built by BuilderBot for that team. Existing apps are not retroactively changed.' }),
    ],
  },

  // ---------------------------------------------------------------------------
  // API KEYS
  // ---------------------------------------------------------------------------
  'api-keys': {
    slug: 'api-keys',
    title: 'API Keys',
    section: 'Configuration',
    description: 'Create and manage API keys for external integrations.',
    keywords: ['api keys', 'tokens', 'zapier', 'ci/cd', 'automation', 'external', 'access'],
    content: () => [
      H2({ children: 'Overview' }),
      P({ children: 'API keys let you connect external tools \u2014 Zapier, CI/CD pipelines, custom applications \u2014 to your YokeBot team programmatically. Manage keys from Settings \u2192 API Keys.' }),

      H2({ children: 'Creating a Key' }),
      OL({ children: [
        LI({ children: 'Go to Settings \u2192 API Keys.' }),
        LI({ children: 'Click "Create API Key".' }),
        LI({ children: 'Give the key a descriptive label (e.g., "Zapier Production", "CI/CD Pipeline").' }),
        LI({ children: 'Choose scoped permissions (see below).' }),
        LI({ children: 'Click Create. The full key is displayed once \u2014 copy it immediately.' }),
      ] }),
      Warning({ children: 'The full API key is shown only at creation time. If you lose it, you must regenerate or create a new key.' }),

      H2({ children: 'Key Format' }),
      P({ children: ['All keys use the prefix ', Code({ children: 'yk_live_' }), ' followed by a random string. Example:'] }),
      CodeBlock({ language: 'text', children: 'yk_live_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6' }),

      H2({ children: 'Scoped Permissions' }),
      P({ children: 'Each key can be scoped to specific resources and actions:' }),
      Table({
        headers: ['Scope', 'Description'],
        rows: [
          ['Full Access', 'Read and write all resources \u2014 equivalent to admin access'],
          ['Agents (read)', 'List and view agent configurations'],
          ['Agents (write)', 'Create, update, and delete agents'],
          ['Tasks (read)', 'List and view tasks'],
          ['Tasks (write)', 'Create, update, and delete tasks'],
          ['Chat (read)', 'Read chat messages and history'],
          ['Chat (write)', 'Send messages and mentions'],
          ['Files (read)', 'List and download workspace files'],
          ['Files (write)', 'Upload and delete workspace files'],
        ],
      }),

      H2({ children: 'Security' }),
      UL({ children: [
        LI({ children: 'Keys are hashed with SHA-256 before storage \u2014 YokeBot never stores the raw key.' }),
        LI({ children: 'Keys are shown once at creation and cannot be retrieved afterward.' }),
        LI({ children: 'All API key operations (create, regenerate, revoke, delete) are logged in the activity log.' }),
      ] }),

      H2({ children: 'Key Rotation' }),
      P({ children: 'To rotate a key, click "Regenerate" next to the key in the list. This invalidates the old key immediately and generates a new one. Update your external integrations with the new key before the old one stops working.' }),
      Tip({ children: 'Consider creating a second key before revoking the old one to avoid downtime during rotation.' }),

      H2({ children: 'Revoke vs Delete' }),
      UL({ children: [
        LI({ children: 'Revoke \u2014 disables the key immediately but keeps it in the list for audit purposes. You can re-enable a revoked key.' }),
        LI({ children: 'Delete \u2014 permanently removes the key and its audit history. This action cannot be undone.' }),
      ] }),

      H2({ children: 'Permissions' }),
      P({ children: 'Only team admins can create, regenerate, revoke, or delete API keys. Members and viewers cannot access the API Keys settings page.' }),
    ],
  },

  // ---------------------------------------------------------------------------
  // WORKSPACE
  // ---------------------------------------------------------------------------
  'workspace': {
    slug: 'workspace',
    title: 'Workspace Overview',
    section: 'Workspace',
    description: 'The unified command center for managing your AI workforce.',
    keywords: ['workspace', 'command center', 'dashboard', 'panels', 'overview'],
    content: () => [
      H2({ children: 'Your Command Center' }),
      P({ children: 'The Workspace is a single-screen hub where you manage your entire AI workforce. Instead of switching between separate pages for chat, tasks, files, and data, everything lives in one resizable, multi-panel layout.' }),

      H2({ children: 'Panels' }),
      Table({
        headers: ['Panel', 'Description'],
        rows: [
          ['Team Chat', 'Communicate with agents and team members in real time'],
          ['Tasks', 'View and manage tasks in list or kanban mode'],
          ['Files', 'Browse, upload, and preview workspace files'],
          ['Data Tables', 'View and edit structured data created by agents'],
          ['Browser', 'Watch or control live browser automation sessions'],
          ['Activity Log', 'Audit trail of every agent action and system event'],
        ],
      }),
      P({ children: 'Click any panel tab to switch views, or drag panel dividers to resize them to your liking.' }),

      H2({ children: 'Real-Time Updates' }),
      P({ children: 'The Workspace uses Server-Sent Events (SSE) to stream updates in real time. When an agent completes a task, posts a message, or creates a file, you see it immediately without refreshing the page.' }),

      H2({ children: 'Sandbox App Preview' }),
      P({ children: 'When BuilderBot creates or updates a sandbox app, the preview panel renders it live inside the Workspace. You can interact with the app, annotate it with the visual editor, or send feedback directly to the agent.' }),

      H2({ children: 'Related Pages' }),
      UL({ children: [
        LI({ children: A({ href: '/docs/workspace/files', children: 'Workspace Files' }) }),
        LI({ children: A({ href: '/docs/workspace/visual-editor', children: 'Visual Editor' }) }),
        LI({ children: A({ href: '/docs/team-collaboration/chat', children: 'Team Chat' }) }),
      ] }),
    ],
  },

  'workspace/files': {
    slug: 'workspace/files',
    title: 'Workspace Files',
    section: 'Workspace',
    description: 'Manage files uploaded by humans and generated by agents.',
    keywords: ['files', 'upload', 'workspace', 'file viewer', 'documents', 'search'],
    content: () => [
      H2({ children: 'File Management' }),
      P({ children: 'The Files panel in the Workspace shows every file associated with your team \u2014 documents uploaded by humans, code generated by agents, images, spreadsheets, and more. Files are organized in a tree view with directories and search.' }),

      H2({ children: 'Uploading Files' }),
      P({ children: 'Click the upload button (top-right of the Files panel) to upload files from your computer. You can also drag and drop files directly into the panel. Uploaded files are immediately available to all agents and team members.' }),

      H2({ children: 'File Viewer' }),
      P({ children: 'Click any file to open it in the built-in viewer. Supported preview types include:' }),
      UL({ children: [
        LI({ children: 'Code \u2014 syntax-highlighted preview for all common languages' }),
        LI({ children: 'Images \u2014 PNG, JPG, SVG, GIF, and WebP' }),
        LI({ children: 'Markdown \u2014 rendered with full formatting support' }),
        LI({ children: 'Plain text \u2014 text files, logs, CSVs' }),
      ] }),

      H2({ children: 'Unread Notifications' }),
      P({ children: 'When an agent creates or modifies a file, a blue dot appears next to it in the file tree. This makes it easy to spot new output without scrolling through the activity log.' }),

      H2({ children: 'Search' }),
      P({ children: 'Use the search bar at the top of the Files panel to filter files by name. You can also use the global search (Cmd+K) and type "in:files" to search workspace files from anywhere in the app.' }),
    ],
  },

  'workspace/visual-editor': {
    slug: 'workspace/visual-editor',
    title: 'Visual Editor',
    section: 'Workspace',
    description: 'Annotate and edit sandbox apps visually from the Workspace.',
    keywords: ['visual editor', 'annotation', 'edit', 'draw', 'design', 'sandbox', 'css'],
    content: () => [
      H2({ children: 'Overview' }),
      P({ children: 'The Visual Editor lets you interact with sandbox apps directly inside the Workspace preview panel. It has two modes: Annotation mode for giving feedback, and Edit mode for making live style changes.' }),

      H2({ children: 'Annotation Mode' }),
      P({ children: 'Use annotation mode to mark up the app preview and send visual feedback to your agents:' }),
      UL({ children: [
        LI({ children: 'Draw rectangles to highlight areas of interest' }),
        LI({ children: 'Add arrows to point at specific elements' }),
        LI({ children: 'Freehand drawing for quick sketches and circles' }),
        LI({ children: 'Text comments placed directly on the preview' }),
        LI({ children: '"Send to Bot" button \u2014 captures annotations as a screenshot and posts it to the agent in chat' }),
      ] }),

      H2({ children: 'Edit Mode' }),
      P({ children: 'Edit mode lets you modify the app\u2019s visual styles without writing code:' }),
      OL({ children: [
        LI({ children: 'Hover over elements to see a highlight outline.' }),
        LI({ children: 'Click an element to select it.' }),
        LI({ children: 'Use the style panel to adjust typography, colors, spacing, and borders.' }),
        LI({ children: 'Changes persist to the app source and are visible on reload.' }),
      ] }),

      H3({ children: 'Editable Styles' }),
      UL({ children: [
        LI({ children: 'Typography \u2014 font family, size, weight, line height, color' }),
        LI({ children: 'Colors \u2014 background, text, border colors with a color picker' }),
        LI({ children: 'Spacing \u2014 margin and padding on all four sides' }),
        LI({ children: 'Borders \u2014 width, style, radius, and color' }),
      ] }),

      H2({ children: 'Autosave' }),
      P({ children: 'Changes are saved automatically. A timestamp toast appears in the bottom-right corner confirming when the last save occurred.' }),

      H2({ children: 'Undo / Redo' }),
      P({ children: 'The editor maintains a 50-step undo/redo history that persists across page refreshes. Use Cmd+Z to undo and Cmd+Shift+Z to redo.' }),
    ],
  },

  // ---------------------------------------------------------------------------
  // TEAM COLLABORATION
  // ---------------------------------------------------------------------------
  'team-collaboration': {
    slug: 'team-collaboration',
    title: 'Team Collaboration',
    section: 'Team Collaboration',
    description: 'Work together with multiple humans and AI agents on a shared team.',
    keywords: ['team', 'collaboration', 'invite', 'members', 'shared', 'multi-user'],
    content: () => [
      H2({ children: 'Overview' }),
      P({ children: 'YokeBot teams are shared workspaces where multiple humans and AI agents collaborate side by side. Every team member sees the same chat, tasks, files, and agents \u2014 so everyone stays in sync.' }),

      H2({ children: 'Inviting Members' }),
      OL({ children: [
        LI({ children: 'Go to Settings \u2192 Team.' }),
        LI({ children: 'Click "Invite Member".' }),
        LI({ children: 'Enter the person\u2019s email address.' }),
        LI({ children: 'Choose a role: Admin, Member, or Viewer.' }),
        LI({ children: 'The invitee receives an email with a link to join.' }),
      ] }),

      H2({ children: 'Plan Limits' }),
      P({ children: 'All plans include unlimited agents and unlimited team members. There is no per-seat charge \u2014 invite as many people as you need.' }),

      H2({ children: 'Shared Workspace' }),
      P({ children: 'Team members share access to:' }),
      UL({ children: [
        LI({ children: 'Team Chat \u2014 a single channel visible to all members and agents' }),
        LI({ children: 'Tasks \u2014 assign, track, and manage work across the team' }),
        LI({ children: 'Files \u2014 upload and access shared workspace files' }),
        LI({ children: 'Agents \u2014 create, configure, and interact with all agents on the team' }),
      ] }),

      H2({ children: 'Related Pages' }),
      UL({ children: [
        LI({ children: A({ href: '/docs/team-collaboration/chat', children: 'Team Chat' }) }),
        LI({ children: A({ href: '/docs/team-collaboration/roles', children: 'Roles & Permissions' }) }),
      ] }),
    ],
  },

  'team-collaboration/chat': {
    slug: 'team-collaboration/chat',
    title: 'Team Chat',
    section: 'Team Collaboration',
    description: 'Communicate with agents and team members in real time.',
    keywords: ['chat', 'messaging', 'mentions', 'dm', 'threads', 'reactions', 'team chat'],
    content: () => [
      H2({ children: 'Team-Wide Channel' }),
      P({ children: 'Every team has a shared chat channel visible to all members and agents. This is the primary communication hub \u2014 post updates, ask questions, and coordinate work in one place.' }),

      H2({ children: '@Mentions' }),
      P({ children: 'Type @ followed by an agent\u2019s name to mention it. Mentioned agents wake up immediately \u2014 no need to wait for the next heartbeat cycle. You can also @mention human team members to notify them.' }),
      Tip({ children: '@mentions are the fastest way to get an agent\u2019s attention. The agent receives the full message context and responds in the same thread.' }),

      H2({ children: 'Human-to-Human Chat' }),
      P({ children: 'Team members can chat with each other directly in the team channel. Agents only respond when explicitly @mentioned or when a message is relevant to their assigned tasks.' }),

      H2({ children: 'Direct Messages' }),
      P({ children: 'Click on any agent\u2019s name to open a direct message thread. DMs are private conversations between you and a single agent \u2014 other team members and agents cannot see them.' }),

      H2({ children: 'Task-Specific Threads' }),
      P({ children: 'When an agent is working on a task, a dedicated thread channel is created for that task. All updates, questions, and file outputs related to the task appear in the thread, keeping the main chat clean.' }),

      H2({ children: 'Reactions & Threading' }),
      P({ children: 'React to messages with emoji reactions and reply in threads to keep conversations organized. Threaded replies are nested under the original message.' }),
    ],
  },

  'team-collaboration/roles': {
    slug: 'team-collaboration/roles',
    title: 'Roles & Permissions',
    section: 'Team Collaboration',
    description: 'Understand the Admin, Member, and Viewer roles and what each can do.',
    keywords: ['roles', 'permissions', 'admin', 'member', 'viewer', 'access control'],
    content: () => [
      H2({ children: 'Role Overview' }),
      Table({
        headers: ['Role', 'Description'],
        rows: [
          ['Admin', 'Full control over the team \u2014 manage members, billing, API keys, integrations, and all workspace resources'],
          ['Member', 'Create and manage agents, tasks, files, and chat \u2014 everything needed for day-to-day work'],
          ['Viewer', 'Read-only access to the workspace \u2014 can view chat, tasks, files, and agents but cannot create or modify anything'],
        ],
      }),

      H2({ children: 'Detailed Permissions' }),
      Table({
        headers: ['Action', 'Admin', 'Member', 'Viewer'],
        rows: [
          ['Create and manage agents', '\u2713', '\u2713', '\u2014'],
          ['Create and manage tasks', '\u2713', '\u2713', '\u2014'],
          ['Send chat messages', '\u2713', '\u2713', '\u2014'],
          ['Upload and manage files', '\u2713', '\u2713', '\u2014'],
          ['View workspace (chat, tasks, files)', '\u2713', '\u2713', '\u2713'],
          ['Invite and remove members', '\u2713', '\u2014', '\u2014'],
          ['Change member roles', '\u2713', '\u2014', '\u2014'],
          ['Manage API keys', '\u2713', '\u2014', '\u2014'],
          ['Manage integrations and credentials', '\u2713', '\u2014', '\u2014'],
          ['Manage billing and subscriptions', '\u2713', '\u2014', '\u2014'],
          ['Manage Session Vault recordings', '\u2713', '\u2014', '\u2014'],
        ],
      }),

      H2({ children: 'Changing Roles' }),
      P({ children: 'Admins can change any member\u2019s role from Settings \u2192 Team. Click the role badge next to a member\u2019s name to select a new role. Changes take effect immediately.' }),
      Warning({ children: 'Every team must have at least one admin. You cannot remove the admin role from the last remaining admin.' }),
    ],
  },

  // ---------------------------------------------------------------------------
  // KEYBOARD SHORTCUTS
  // ---------------------------------------------------------------------------
  'keyboard-shortcuts': {
    slug: 'keyboard-shortcuts',
    title: 'Keyboard Shortcuts',
    section: 'Reference',
    description: 'All keyboard shortcuts available in the YokeBot dashboard.',
    keywords: ['keyboard', 'shortcuts', 'hotkeys', 'keybindings', 'keys'],
    content: () => [
      H2({ children: 'Global' }),
      Table({
        headers: ['Shortcut', 'Action'],
        rows: [
          ['Cmd+K / Ctrl+K', 'Open universal search'],
          ['Escape', 'Close overlays, modals, and search'],
        ],
      }),

      H2({ children: 'Workspace Files' }),
      Table({
        headers: ['Shortcut', 'Action'],
        rows: [
          ['F2', 'Rename the active file'],
          ['Delete / Backspace', 'Delete the active file (with confirmation)'],
          ['Cmd+C / Ctrl+C', 'Copy file path (when a file row is focused)'],
          ['Right-click', 'Open context menu with Rename, Delete, Copy Path'],
          ['Drag & Drop', 'Move files between directories by dragging and dropping in the file tree'],
        ],
      }),

      H2({ children: 'Navigation' }),
      Table({
        headers: ['Shortcut', 'Action'],
        rows: [
          ['Cmd+K then type in:files', 'Search workspace files'],
          ['Cmd+K then type in:agents', 'Search agents'],
          ['Cmd+K then type in:docs', 'Search documentation'],
        ],
      }),

      H2({ children: 'Chat' }),
      Table({
        headers: ['Shortcut', 'Action'],
        rows: [
          ['Enter', 'Send message'],
          ['Shift+Enter', 'New line in message'],
          ['@ then type', 'Mention an agent or user'],
        ],
      }),
    ],
  },
}
