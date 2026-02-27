/**
 * mcp-client.ts — Generic MCP client for self-hosted users
 *
 * Allows agents to connect to any MCP server (Blender, Figma,
 * databases, custom tools, etc.) via stdio or HTTP transport.
 *
 * Each agent can have multiple MCP servers configured. Tools from
 * MCP servers are namespaced with the server name prefix to avoid
 * conflicts (e.g., blender__create_mesh).
 */

import { spawn, type ChildProcess } from 'child_process'
import { randomUUID } from 'crypto'
import { createInterface, type Interface } from 'readline'
import type { Db } from './db/types.ts'
import type { ToolDef } from './model.ts'

const HOSTED_MODE = process.env.YOKEBOT_HOSTED_MODE === 'true'

// ---- Types ----

export interface McpServerConfig {
  id?: string
  agentId: string
  serverName: string
  transportType: 'stdio' | 'http'
  command?: string   // for stdio
  args?: string      // JSON array of args for stdio
  url?: string       // for http
  envVars?: string   // JSON object of env vars
}

interface McpConnection {
  process?: ChildProcess
  readline?: Interface
  pending: Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>
  tools: ToolDef[]
  serverName: string
}

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: string
  method: string
  params?: Record<string, unknown>
}

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: string
  result?: unknown
  error?: { code: number; message: string }
}

// Active connections keyed by `${agentId}:${serverName}`
const connections = new Map<string, McpConnection>()

// ---- DB helpers for agent_mcp_servers ----

export async function listMcpServers(db: Db, agentId: string): Promise<McpServerConfig[]> {
  const rows = await db.query<Record<string, unknown>>(
    'SELECT * FROM agent_mcp_servers WHERE agent_id = $1 ORDER BY server_name',
    [agentId],
  )
  return rows.map(rowToConfig)
}

export async function addMcpServer(db: Db, config: McpServerConfig): Promise<McpServerConfig> {
  const id = randomUUID()
  const now = new Date().toISOString()
  await db.run(
    `INSERT INTO agent_mcp_servers (id, agent_id, server_name, transport_type, command, args, url, env_vars, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [id, config.agentId, config.serverName, config.transportType,
     config.command ?? null, config.args ?? null, config.url ?? null,
     config.envVars ?? null, now],
  )
  return { ...config, id }
}

export async function removeMcpServer(db: Db, agentId: string, serverName: string): Promise<void> {
  // Disconnect first
  await disconnectMcpServer(agentId, serverName)
  await db.run(
    'DELETE FROM agent_mcp_servers WHERE agent_id = $1 AND server_name = $2',
    [agentId, serverName],
  )
}

function rowToConfig(row: Record<string, unknown>): McpServerConfig {
  return {
    id: row.id as string,
    agentId: row.agent_id as string,
    serverName: row.server_name as string,
    transportType: row.transport_type as 'stdio' | 'http',
    command: row.command as string | undefined,
    args: row.args as string | undefined,
    url: row.url as string | undefined,
    envVars: row.env_vars as string | undefined,
  }
}

// ---- Connection management ----

function connectionKey(agentId: string, serverName: string): string {
  return `${agentId}:${serverName}`
}

/**
 * Send a JSON-RPC request over stdio.
 */
function sendStdioRequest(conn: McpConnection, method: string, params?: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = randomUUID()
    const request: JsonRpcRequest = { jsonrpc: '2.0', id, method, params }

    const timer = setTimeout(() => {
      conn.pending.delete(id)
      reject(new Error(`MCP request timed out: ${method}`))
    }, 30_000)

    conn.pending.set(id, {
      resolve: (v) => { clearTimeout(timer); resolve(v) },
      reject: (e) => { clearTimeout(timer); reject(e) },
    })

    conn.process?.stdin?.write(JSON.stringify(request) + '\n')
  })
}

/**
 * Send a JSON-RPC request over HTTP (Streamable HTTP transport).
 */
async function sendHttpRequest(url: string, method: string, params?: Record<string, unknown>): Promise<unknown> {
  const id = randomUUID()
  const request: JsonRpcRequest = { jsonrpc: '2.0', id, method, params }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(30_000),
  })

  if (!response.ok) {
    throw new Error(`MCP HTTP error: ${response.status} ${response.statusText}`)
  }

  const result = await response.json() as JsonRpcResponse
  if (result.error) {
    throw new Error(`MCP error: ${result.error.message}`)
  }
  return result.result
}

/**
 * Connect to an MCP server and discover its tools.
 */
export async function connectMcpServer(config: McpServerConfig): Promise<ToolDef[]> {
  // MCP is disabled in hosted mode for security
  if (HOSTED_MODE) {
    throw new Error('MCP server connections are not available in hosted mode. Use native YokeBot skills instead.')
  }

  const key = connectionKey(config.agentId, config.serverName)

  // Already connected
  if (connections.has(key)) {
    return connections.get(key)!.tools
  }

  if (config.transportType === 'stdio') {
    return connectStdio(config)
  } else {
    return connectHttp(config)
  }
}

async function connectStdio(config: McpServerConfig): Promise<ToolDef[]> {
  const key = connectionKey(config.agentId, config.serverName)
  const args = config.args ? JSON.parse(config.args) as string[] : []
  const envVars = config.envVars ? JSON.parse(config.envVars) as Record<string, string> : {}

  const child = spawn(config.command!, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...envVars },
  })

  const readline = createInterface({ input: child.stdout! })
  const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()

  const conn: McpConnection = {
    process: child,
    readline,
    pending,
    tools: [],
    serverName: config.serverName,
  }

  // Handle responses
  readline.on('line', (line) => {
    try {
      const response = JSON.parse(line) as JsonRpcResponse
      if (response.id && pending.has(response.id)) {
        const { resolve, reject } = pending.get(response.id)!
        pending.delete(response.id)
        if (response.error) {
          reject(new Error(response.error.message))
        } else {
          resolve(response.result)
        }
      }
    } catch { /* ignore */ }
  })

  child.on('exit', () => {
    for (const [, { reject }] of pending) {
      reject(new Error(`MCP server '${config.serverName}' process exited`))
    }
    pending.clear()
    connections.delete(key)
  })

  connections.set(key, conn)

  // Initialize
  await sendStdioRequest(conn, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'yokebot-agent', version: '1.0.0' },
  })

  // Discover tools
  conn.tools = await discoverTools(conn, config)
  return conn.tools
}

async function connectHttp(config: McpServerConfig): Promise<ToolDef[]> {
  const key = connectionKey(config.agentId, config.serverName)

  const conn: McpConnection = {
    pending: new Map(),
    tools: [],
    serverName: config.serverName,
  }

  // Initialize
  await sendHttpRequest(config.url!, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'yokebot-agent', version: '1.0.0' },
  })

  connections.set(key, conn)

  // Discover tools
  conn.tools = await discoverTools(conn, config)
  return conn.tools
}

/**
 * Discover tools from an MCP server and convert to YokeBot ToolDef format.
 * Tool names are prefixed with the server name for namespacing.
 */
async function discoverTools(conn: McpConnection, config: McpServerConfig): Promise<ToolDef[]> {
  let result: { tools?: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }> }

  if (config.transportType === 'stdio') {
    result = await sendStdioRequest(conn, 'tools/list') as typeof result
  } else {
    result = await sendHttpRequest(config.url!, 'tools/list') as typeof result
  }

  if (!result?.tools) return []

  const prefix = config.serverName.replace(/[^a-zA-Z0-9]/g, '_')

  return result.tools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: `${prefix}__${tool.name}`,
      description: `[${config.serverName}] ${tool.description ?? tool.name}`,
      parameters: tool.inputSchema ?? { type: 'object', properties: {}, required: [] },
    },
  }))
}

/**
 * Call a tool on an MCP server.
 * The toolName should be prefixed (e.g., "blender__create_mesh").
 */
export async function callMcpTool(
  agentId: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<string | null> {
  // Find which server owns this tool
  const separatorIndex = toolName.indexOf('__')
  if (separatorIndex === -1) return null

  const serverPrefix = toolName.slice(0, separatorIndex)
  const actualToolName = toolName.slice(separatorIndex + 2)

  // Find the connection
  for (const [key, conn] of connections) {
    if (!key.startsWith(agentId + ':')) continue
    const prefix = conn.serverName.replace(/[^a-zA-Z0-9]/g, '_')
    if (prefix !== serverPrefix) continue

    // Found the right connection
    try {
      const config = { serverName: conn.serverName } as McpServerConfig
      let result: { content?: Array<{ type: string; text?: string }> }

      if (conn.process) {
        // stdio transport
        result = await sendStdioRequest(conn, 'tools/call', {
          name: actualToolName,
          arguments: args,
        }) as typeof result
      } else {
        // http transport — we need to find the config URL
        // For http, we'd need to store the URL in the connection
        return `MCP HTTP tool call not yet supported for tool: ${toolName}`
      }

      if (result?.content) {
        return result.content
          .filter((c) => c.type === 'text' && c.text)
          .map((c) => c.text)
          .join('\n') || 'Action completed.'
      }
      return 'Action completed.'
    } catch (err) {
      return `MCP tool error: ${(err as Error).message}`
    }
  }

  return null // Not an MCP tool
}

/**
 * Check if a tool name belongs to an MCP server (has __ separator).
 */
export function isMcpTool(toolName: string): boolean {
  return toolName.includes('__')
}

/**
 * Disconnect a specific MCP server for an agent.
 */
export async function disconnectMcpServer(agentId: string, serverName: string): Promise<void> {
  const key = connectionKey(agentId, serverName)
  const conn = connections.get(key)
  if (!conn) return

  if (conn.process) {
    conn.readline?.close()
    conn.process.kill('SIGTERM')
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        conn.process?.kill('SIGKILL')
        resolve()
      }, 2000)
      conn.process!.on('exit', () => {
        clearTimeout(timer)
        resolve()
      })
    })
  }

  connections.delete(key)
}

/**
 * Load all MCP tools for an agent (connects to all configured servers).
 * Returns combined tool list from all servers.
 */
export async function loadMcpTools(db: Db, agentId: string): Promise<ToolDef[]> {
  // MCP disabled in hosted mode
  if (HOSTED_MODE) return []

  const servers = await listMcpServers(db, agentId)
  const allTools: ToolDef[] = []

  for (const server of servers) {
    try {
      const tools = await connectMcpServer(server)
      allTools.push(...tools)
    } catch (err) {
      console.warn(`[mcp] Failed to connect to ${server.serverName}: ${(err as Error).message}`)
    }
  }

  return allTools
}

/**
 * Disconnect all MCP servers for an agent.
 */
export async function disconnectAllMcpServers(agentId: string): Promise<void> {
  const keysToRemove: string[] = []
  for (const key of connections.keys()) {
    if (key.startsWith(agentId + ':')) {
      keysToRemove.push(key)
    }
  }
  for (const key of keysToRemove) {
    const serverName = key.split(':')[1]
    await disconnectMcpServer(agentId, serverName)
  }
}
