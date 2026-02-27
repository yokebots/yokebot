/**
 * skills.ts — SKILL.md parser + marketplace wrapper
 *
 * Skills are SKILL.md files (Anthropic open standard: YAML frontmatter
 * + markdown instructions). This module loads skills from the local
 * filesystem and can fetch from ClawHub/SkillsMP.
 */

import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'
import type { Db } from './db/types.ts'
import type { ToolDef } from './model.ts'

export interface SkillMetadata {
  name: string
  description: string
  tags: string[]
  source: string
  version?: string
  author?: string
  requiredCredentials?: string[]
}

export interface Skill {
  metadata: SkillMetadata
  instructions: string
  filePath: string
}

export function parseSkillFile(content: string, filePath: string): Skill | null {
  if (!content.startsWith('---')) return null
  const endIndex = content.indexOf('---', 3)
  if (endIndex === -1) return null

  const frontmatter = content.slice(3, endIndex).trim()
  const instructions = content.slice(endIndex + 3).trim()

  const metadata: Record<string, unknown> = {}
  for (const line of frontmatter.split('\n')) {
    const colonIndex = line.indexOf(':')
    if (colonIndex === -1) continue
    const key = line.slice(0, colonIndex).trim()
    let value: unknown = line.slice(colonIndex + 1).trim()
    if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).split(',').map((s) => s.trim())
    }
    metadata[key] = value
  }

  return {
    metadata: {
      name: (metadata.name as string) ?? 'Unknown Skill',
      description: (metadata.description as string) ?? '',
      tags: (metadata.tags as string[]) ?? [],
      source: (metadata.source as string) ?? 'unknown',
      version: metadata.version as string | undefined,
      author: metadata.author as string | undefined,
      requiredCredentials: (metadata.requiredCredentials as string[]) ?? undefined,
    },
    instructions,
    filePath,
  }
}

export function loadSkillsFromDir(skillsDir: string): Skill[] {
  if (!existsSync(skillsDir)) return []
  const skills: Skill[] = []
  const entries = readdirSync(skillsDir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const skillMdPath = join(skillsDir, entry.name, 'SKILL.md')
    if (!existsSync(skillMdPath)) continue
    const content = readFileSync(skillMdPath, 'utf-8')
    const skill = parseSkillFile(content, skillMdPath)
    if (skill) skills.push(skill)
  }
  return skills
}

export function loadSkill(skillsDir: string, skillName: string): Skill | null {
  const skillMdPath = join(skillsDir, skillName, 'SKILL.md')
  if (!existsSync(skillMdPath)) return null
  const content = readFileSync(skillMdPath, 'utf-8')
  return parseSkillFile(content, skillMdPath)
}

// Built-in tool names that skills cannot shadow
const RESERVED_TOOL_NAMES = new Set([
  'think', 'respond',
  'read_workspace_file', 'write_workspace_file', 'list_workspace_files',
  'create_task', 'update_task', 'list_tasks',
  'send_chat_message',
  'request_approval',
  'query_source_of_record', 'update_source_of_record',
  'generate_image', 'generate_video', 'generate_3d',
  'browser_navigate', 'browser_snapshot', 'browser_click', 'browser_type',
  'browser_select_option', 'browser_press_key', 'browser_evaluate', 'browser_close',
])

export function parseToolSchemas(instructions: string): ToolDef[] {
  const regex = /```tools\s*\n([\s\S]*?)```/g
  const tools: ToolDef[] = []
  let match
  while ((match = regex.exec(instructions)) !== null) {
    try {
      const parsed = JSON.parse(match[1]) as Array<{ name: string; description: string; parameters: Record<string, unknown> }>
      for (const t of parsed) {
        // Block skill tools that try to shadow built-in tools
        if (RESERVED_TOOL_NAMES.has(t.name)) {
          console.warn(`[skills] Blocked tool "${t.name}" — name conflicts with built-in tool`)
          continue
        }
        // Block tool names with suspicious characters (only allow alphanumeric + underscore)
        if (!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(t.name)) {
          console.warn(`[skills] Blocked tool "${t.name}" — invalid characters in name`)
          continue
        }
        tools.push({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })
      }
    } catch { /* malformed tool block, skip */ }
  }
  return tools
}

export function getSkillTools(skillsDir: string, skillNames: string[]): ToolDef[] {
  const tools: ToolDef[] = []
  for (const name of skillNames) {
    const skill = loadSkill(skillsDir, name)
    if (skill) tools.push(...parseToolSchemas(skill.instructions))
  }
  return tools
}

// ---- DB helpers for agent_skills table ----

export async function getAgentSkills(db: Db, agentId: string): Promise<Array<{ skillName: string; source: string; installedAt: string }>> {
  const rows = await db.query<Record<string, string>>(
    'SELECT skill_name, source, installed_at FROM agent_skills WHERE agent_id = $1',
    [agentId],
  )
  return rows.map((r) => ({ skillName: r.skill_name, source: r.source, installedAt: r.installed_at }))
}

export async function installSkill(db: Db, agentId: string, skillName: string, source = 'yokebot'): Promise<void> {
  if (db.driver === 'postgres') {
    await db.run(
      'INSERT INTO agent_skills (agent_id, skill_name, source) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [agentId, skillName, source],
    )
  } else {
    await db.run(
      'INSERT OR IGNORE INTO agent_skills (agent_id, skill_name, source) VALUES ($1, $2, $3)',
      [agentId, skillName, source],
    )
  }
}

export async function uninstallSkill(db: Db, agentId: string, skillName: string): Promise<void> {
  await db.run('DELETE FROM agent_skills WHERE agent_id = $1 AND skill_name = $2', [agentId, skillName])
}
