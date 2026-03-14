import * as engine from './engine'

export interface SlashCommand {
  name: string
  description: string
  usage: string
  clientOnly: boolean
  execute: (args: string, context: CommandContext) => Promise<void>
}

export interface CommandContext {
  teamId: string
  channelId: string
  addLocalMessage: (content: string) => void
}

const commands: SlashCommand[] = [
  {
    name: 'help',
    description: 'Show available commands',
    usage: '/help',
    clientOnly: true,
    execute: async (_args, ctx) => {
      const lines = commands.map(c => `**/${c.name}** — ${c.description}\n  Usage: \`${c.usage}\``)
      ctx.addLocalMessage('**Available Commands**\n\n' + lines.join('\n\n'))
    },
  },
  {
    name: 'status',
    description: 'Show all agents and their current status',
    usage: '/status',
    clientOnly: false,
    execute: async (_args, ctx) => {
      try {
        const agents = await engine.listAgents()
        if (agents.length === 0) {
          ctx.addLocalMessage('No agents found. Create one from the Agents panel.')
          return
        }
        const lines = agents.map(a => {
          const icon = a.status === 'running' ? '🟢' : '⚪'
          return `${icon} **${a.name}** — ${a.status}`
        })
        ctx.addLocalMessage('**Agent Status**\n\n' + lines.join('\n'))
      } catch {
        ctx.addLocalMessage('Failed to fetch agent status.')
      }
    },
  },
  {
    name: 'assign',
    description: 'Assign a task to an agent',
    usage: '/assign @AgentName Task description',
    clientOnly: false,
    execute: async (args, ctx) => {
      const match = args.match(/^@(\S+)\s+(.+)$/s)
      if (!match) {
        ctx.addLocalMessage('**Usage:** `/assign @AgentName Task description`')
        return
      }
      const [, agentName, taskDesc] = match
      try {
        const agents = await engine.listAgents()
        const agent = agents.find(a => a.name.toLowerCase() === agentName.toLowerCase())
        if (!agent) {
          ctx.addLocalMessage(`Agent "${agentName}" not found. Use /status to see available agents.`)
          return
        }
        await engine.createTask({ title: taskDesc, assignedAgentId: agent.id })
        ctx.addLocalMessage(`Task assigned to **${agent.name}**: ${taskDesc}`)
      } catch {
        ctx.addLocalMessage('Failed to assign task.')
      }
    },
  },
  {
    name: 'workflow',
    description: 'Start a workflow by name',
    usage: '/workflow Sales CRM',
    clientOnly: false,
    execute: async (args, _ctx) => {
      const name = args.trim()
      if (!name) {
        _ctx.addLocalMessage('**Usage:** `/workflow Workflow Name`')
        return
      }
      try {
        const workflows = await engine.listWorkflows()
        const wf = workflows.find(w => w.name.toLowerCase() === name.toLowerCase())
        if (!wf) {
          const available = workflows.map(w => w.name).join(', ')
          _ctx.addLocalMessage(`Workflow "${name}" not found. Available: ${available || 'none'}`)
          return
        }
        await engine.startWorkflowRun(wf.id)
        _ctx.addLocalMessage(`Workflow **${wf.name}** started.`)
      } catch {
        _ctx.addLocalMessage('Failed to start workflow.')
      }
    },
  },
  {
    name: 'clear',
    description: 'Clear chat history (visual only)',
    usage: '/clear',
    clientOnly: true,
    execute: async (_args, ctx) => {
      ctx.addLocalMessage('__clear__')
    },
  },
  {
    name: 'browse',
    description: 'Open a new browser session',
    usage: '/browse',
    clientOnly: false,
    execute: async (_args, ctx) => {
      try {
        const session = await engine.createBrowserSession()
        ctx.addLocalMessage(`Browser session started. Session ID: \`${session.sessionId}\``)
      } catch {
        ctx.addLocalMessage('Failed to start browser session.')
      }
    },
  },
  {
    name: 'vault',
    description: 'List saved login sessions',
    usage: '/vault',
    clientOnly: false,
    execute: async (_args, ctx) => {
      try {
        const sessions = await engine.listVaultSessions()
        if (!sessions || sessions.length === 0) {
          ctx.addLocalMessage('No saved sessions in the vault.')
          return
        }
        const lines = sessions.map(s => `🔐 **${s.serviceLabel || s.domain}** — ${s.domain}`)
        ctx.addLocalMessage('**Session Vault**\n\n' + lines.join('\n'))
      } catch {
        ctx.addLocalMessage('Failed to fetch vault sessions.')
      }
    },
  },
  {
    name: 'credits',
    description: 'Show current credit balance',
    usage: '/credits',
    clientOnly: false,
    execute: async (_args, ctx) => {
      try {
        const billing = await engine.getBillingStatus()
        const bal = billing.credits ?? 0
        const monthly = billing.subscription?.includedCredits ?? 0
        ctx.addLocalMessage(`**Credits**\n\nBalance: **${bal.toLocaleString()}** credits\nMonthly allowance: ${monthly.toLocaleString()} credits`)
      } catch {
        ctx.addLocalMessage('Failed to fetch credit balance.')
      }
    },
  },
  {
    name: 'invite',
    description: 'Invite a team member by email',
    usage: '/invite user@example.com',
    clientOnly: false,
    execute: async (args, ctx) => {
      const email = args.trim()
      if (!email || !email.includes('@')) {
        ctx.addLocalMessage('**Usage:** `/invite user@example.com`')
        return
      }
      try {
        await engine.addTeamMember(ctx.teamId, '', email, 'member')
        ctx.addLocalMessage(`Invitation sent to **${email}**.`)
      } catch {
        ctx.addLocalMessage('Failed to send invitation.')
      }
    },
  },
  {
    name: 'table',
    description: 'Create a new data table',
    usage: '/table Leads',
    clientOnly: false,
    execute: async (args, ctx) => {
      const name = args.trim()
      if (!name) {
        ctx.addLocalMessage('**Usage:** `/table TableName`')
        return
      }
      try {
        await engine.createSorTable(name)
        ctx.addLocalMessage(`Data table **${name}** created.`)
      } catch {
        ctx.addLocalMessage('Failed to create data table.')
      }
    },
  },
]

export function getAllCommands(): SlashCommand[] {
  return commands
}

export function filterCommands(query: string): SlashCommand[] {
  const q = query.toLowerCase()
  return commands.filter(c => c.name.startsWith(q))
}

export interface ParsedCommand {
  command: SlashCommand
  args: string
}

export function parseSlashCommand(content: string): ParsedCommand | null {
  if (!content.startsWith('/')) return null
  const spaceIdx = content.indexOf(' ')
  const name = spaceIdx === -1 ? content.slice(1) : content.slice(1, spaceIdx)
  const args = spaceIdx === -1 ? '' : content.slice(spaceIdx + 1)
  const command = commands.find(c => c.name === name.toLowerCase())
  if (!command) return null
  return { command, args }
}
