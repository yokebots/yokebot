/**
 * skills.ts — SKILL.md parser + marketplace wrapper
 *
 * Skills are SKILL.md files (Anthropic open standard: YAML frontmatter
 * + markdown instructions). This module loads skills from the local
 * filesystem and can fetch from ClawHub/SkillsMP.
 */

import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'

export interface SkillMetadata {
  name: string
  description: string
  tags: string[]
  source: string          // 'yokebot', 'openclaw', 'community', etc.
  version?: string
  author?: string
}

export interface Skill {
  metadata: SkillMetadata
  instructions: string    // The markdown body (after frontmatter)
  filePath: string        // Where this skill was loaded from
}

/**
 * Parse a SKILL.md file into metadata + instructions.
 */
export function parseSkillFile(content: string, filePath: string): Skill | null {
  // Check for YAML frontmatter (--- delimited)
  if (!content.startsWith('---')) {
    return null
  }

  const endIndex = content.indexOf('---', 3)
  if (endIndex === -1) return null

  const frontmatter = content.slice(3, endIndex).trim()
  const instructions = content.slice(endIndex + 3).trim()

  // Parse YAML frontmatter (simple key: value parsing, no external dep)
  const metadata: Record<string, unknown> = {}
  for (const line of frontmatter.split('\n')) {
    const colonIndex = line.indexOf(':')
    if (colonIndex === -1) continue

    const key = line.slice(0, colonIndex).trim()
    let value: unknown = line.slice(colonIndex + 1).trim()

    // Handle arrays: [tag1, tag2, tag3]
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
    },
    instructions,
    filePath,
  }
}

/**
 * Load all skills from a directory (e.g. /yokebot/skills/).
 * Each skill is a subdirectory containing a SKILL.md file.
 */
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
    if (skill) {
      skills.push(skill)
    }
  }

  return skills
}

/**
 * Load a single skill by name from a directory.
 */
export function loadSkill(skillsDir: string, skillName: string): Skill | null {
  const skillMdPath = join(skillsDir, skillName, 'SKILL.md')
  if (!existsSync(skillMdPath)) return null

  const content = readFileSync(skillMdPath, 'utf-8')
  return parseSkillFile(content, skillMdPath)
}
