/**
 * routing.ts — Dynamic model routing for agent sprints
 *
 * A smart orchestrator reads each task once, plans which phases are needed,
 * then delegates each phase to the cheapest model that can handle it.
 * Similar to how Claude Code uses Opus for planning and Sonnet for execution.
 *
 * Agents without a routing profile use the existing single-model flow unchanged.
 */

import type { Db } from './db/types.ts'
import type { ToolCategory } from './runtime.ts'
import { resolveModelConfig, chatCompletionWithFallback, type ModelConfig, type ChatMessage } from './model.ts'
import { getModelCreditCost } from './billing.ts'

// ---- Types ----

export interface PhaseConfig {
  name: string                    // 'research' | 'build' | 'review'
  modelId: string                 // logical model from MODEL_CATALOG
  fallbackModelId?: string        // retry with stronger model on failure
  maxIterations: number           // budget cap
  toolCategories: ToolCategory[]  // which built-in tools this phase gets
  skillFilter?: string[]          // only these skills (empty = none). undefined = all.
  systemInstruction: string       // short, phase-specific prompt (<500 tokens)
  required?: boolean              // orchestrator can't skip this phase
}

export interface RoutingProfile {
  templateId: string
  orchestratorModelId: string
  phases: PhaseConfig[]
  orchestratorPrompt: string
}

export interface PhasePlan {
  phases: string[]
  reasoning: string
  skillOverrides?: Record<string, string[]> // orchestrator-assigned skills per phase (overrides phase.skillFilter)
}

export interface PhaseResult {
  phase: string
  model: string
  summary: string
  iterations: number
  success: boolean
}

// ---- Routing Profiles ----

const ROUTING_PROFILES: RoutingProfile[] = [
  {
    templateId: 'builder-bot',
    orchestratorModelId: 'deepseek-v3.2',
    orchestratorPrompt: `You are a task planner for a web app builder. Given a task, decide which phases are needed.

Available phases:
- "research": Browse a target website to extract design details (colors, fonts, layout). ONLY needed if the task mentions a specific URL or website to reference/clone/improve.
- "build": Write code to build the web application. ALWAYS needed.
- "review": Visit the preview URL, compare to requirements, fix issues. ALWAYS needed unless the task is trivial.

Respond with JSON only: {"phases": ["research", "build", "review"], "reasoning": "one sentence"}

Rules:
- If no URL/website is mentioned, skip "research"
- "build" is always required
- "review" should almost always be included
- Do NOT add phases not in the list above`,
    phases: [
      {
        name: 'research',
        modelId: 'step-3.5-flash',
        fallbackModelId: 'deepseek-v3.2',
        maxIterations: 8,
        toolCategories: ['core', 'browser'],
        skillFilter: [],
        systemInstruction: `Browse the target site. Extract: color palette (hex values), fonts, layout structure, logo description, key sections, navigation, and overall branding. Output a structured report. Do NOT write code. Do NOT visit external sites.

DO NOT skip steps or cut corners. Common excuses to reject:
- "I can infer the design without browsing" — NO. Always browse. You miss details when guessing.
- "The site is simple enough to summarize quickly" — NO. Extract every detail systematically.
- "I already know what this type of site looks like" — NO. Every site is unique. Browse it.`,
        required: false,
      },
      {
        name: 'build',
        modelId: 'deepseek-v3.2',
        maxIterations: 30,
        toolCategories: ['core', 'sandbox', 'tasks'],
        skillFilter: [],
        systemInstruction: `Build a complete working web app using sandbox_setup (one call, all files). Use React + Vite + Tailwind v4. Match the design from the research phase. Focus on visual fidelity and working functionality. Do NOT browse.

DO NOT skip steps or cut corners. Common excuses to reject:
- "I'll add styling later" — NO. Ship complete styling in the first pass.
- "A placeholder is fine for now" — NO. Build real content and real components.
- "This feature isn't critical" — NO. If it's in the requirements, build it.
- "I can simplify this" — NO. Match the spec exactly. Simplification loses details.`,
        required: true,
      },
      {
        name: 'review',
        modelId: 'qwen-3.5-9b',
        fallbackModelId: 'deepseek-v3.2',
        maxIterations: 8,
        toolCategories: ['core', 'browser', 'sandbox', 'tasks'],
        skillFilter: [],
        systemInstruction: `Visit the preview URL with browser_navigate. Compare the app to the requirements. Fix any visual or functional issues using sandbox_write_files. When it looks correct, mark the task done.

CIRCUIT BREAKER: If you have attempted 3 fixes for the same issue and it is still broken, STOP. The approach is wrong — do not keep iterating on a broken fix. Instead, describe the issue clearly in your response and mark the task as blocked so a human can intervene.

DO NOT skip steps or cut corners. Common excuses to reject:
- "It looks close enough" — NO. Compare every detail to the requirements.
- "This is a minor visual difference" — NO. Users notice every pixel. Fix it.
- "The functionality works so the task is done" — NO. Visual fidelity matters equally.`,
      },
    ],
  },
]

// ---- Public API ----

/**
 * Returns the routing profile for a template, or null if no profile exists
 * (meaning the agent uses the standard single-model flow).
 */
export function getRoutingProfile(templateId: string): RoutingProfile | null {
  return ROUTING_PROFILES.find(p => p.templateId === templateId) ?? null
}

/**
 * Single LLM call (no tools) to decide which phases to run.
 * Falls back to "run all required + optional phases" if parsing fails.
 * Costs ~2-3 credits.
 */
export async function runOrchestrator(
  db: Db,
  profile: RoutingProfile,
  taskTitle: string,
  taskDescription: string | null,
  teamId: string,
  installedSkills?: string[],
): Promise<PhasePlan> {
  const allPhaseNames = profile.phases.map(p => p.name)
  const fallbackPlan: PhasePlan = { phases: allPhaseNames, reasoning: 'fallback — running all phases', skillOverrides: {} }

  try {
    const modelConfig = await resolveModelConfig(db, profile.orchestratorModelId)

    // Build prompt with skill awareness if agent has skills installed
    let prompt = profile.orchestratorPrompt
    if (installedSkills && installedSkills.length > 0) {
      prompt += `\n\nThe agent has these skills installed: [${installedSkills.join(', ')}]
If the task requires any of these skills, include a "skills" field mapping phase names to the skill names needed.
Example: {"phases": ["build", "review"], "skills": {"review": ["slack-notify"]}, "reasoning": "..."}
Only assign skills to phases where they are actually needed. Most phases need zero skills.`
    }

    const messages: ChatMessage[] = [
      { role: 'system', content: prompt },
      { role: 'user', content: `Task: ${taskTitle}\n${taskDescription ? `Description: ${taskDescription}` : '(no description)'}` },
    ]

    // Single LLM call, no tools
    const completion = await chatCompletionWithFallback(modelConfig, messages)
    const content = completion.content?.trim() ?? ''

    // Parse JSON from response (handle markdown code blocks)
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.log(`[routing] Orchestrator returned non-JSON, using fallback plan`)
      return fallbackPlan
    }

    const parsed = JSON.parse(jsonMatch[0]) as { phases?: string[]; skills?: Record<string, string[]>; reasoning?: string }
    if (!Array.isArray(parsed.phases) || parsed.phases.length === 0) {
      console.log(`[routing] Orchestrator returned empty phases, using fallback plan`)
      return fallbackPlan
    }

    // Validate phase names and enforce required phases
    const validPhases = parsed.phases.filter(p => allPhaseNames.includes(p))
    for (const phase of profile.phases) {
      if (phase.required && !validPhases.includes(phase.name)) {
        validPhases.push(phase.name)
      }
    }

    // Preserve phase order from profile (not from LLM response)
    const orderedPhases = allPhaseNames.filter(p => validPhases.includes(p))

    // Validate skill overrides — only allow skills the agent actually has installed
    const skillOverrides: Record<string, string[]> = {}
    if (parsed.skills && installedSkills) {
      const installedSet = new Set(installedSkills)
      for (const [phaseName, skills] of Object.entries(parsed.skills)) {
        if (allPhaseNames.includes(phaseName) && Array.isArray(skills)) {
          const validSkills = skills.filter(s => installedSet.has(s))
          if (validSkills.length > 0) {
            skillOverrides[phaseName] = validSkills
          }
        }
      }
      if (Object.keys(skillOverrides).length > 0) {
        console.log(`[routing] Orchestrator skill assignments: ${JSON.stringify(skillOverrides)}`)
      }
    }

    console.log(`[routing] Orchestrator plan: [${orderedPhases.join(', ')}] — ${parsed.reasoning ?? 'no reasoning'}`)
    return { phases: orderedPhases, reasoning: parsed.reasoning ?? '', skillOverrides }
  } catch (err) {
    console.error(`[routing] Orchestrator failed, using fallback plan:`, err)
    return fallbackPlan
  }
}

/**
 * Build a compact prompt for a single phase.
 * Includes: phase instruction + task context + summaries from prior phases.
 * Target: under 1000 tokens total.
 */
export function buildPhasePrompt(
  phase: PhaseConfig,
  taskTitle: string,
  taskDescription: string | null,
  priorResults: PhaseResult[],
  extraContext?: { previewUrl?: string; sandboxProjectDir?: string },
): string {
  const parts: string[] = []

  // Phase instruction
  parts.push(`## Your Role\n${phase.systemInstruction}`)

  // Inject concrete sandbox context so the model doesn't have to guess
  if (extraContext?.previewUrl) {
    parts.push(`## Preview URL\nThe app is running at: ${extraContext.previewUrl}\nUse browser_navigate to visit this URL to see the app.`)
  }
  if (extraContext?.sandboxProjectDir) {
    parts.push(`## Sandbox Project\nAll code files are at: ${extraContext.sandboxProjectDir}`)
  }

  // Task context
  parts.push(`## Task\n**${taskTitle}**${taskDescription ? `\n${taskDescription}` : ''}`)

  // Prior phase outputs
  if (priorResults.length > 0) {
    const summaries = priorResults.map(r => `### ${r.phase} phase (${r.model})\n${r.summary}`).join('\n\n')
    parts.push(`## Context from prior phases\n${summaries}`)
  }

  return parts.join('\n\n')
}

/**
 * Find the most expensive model across all phases in the plan.
 * Used for upfront credit reservation (worst-case estimate).
 */
export async function getMaxPhaseCreditCost(
  db: Db,
  profile: RoutingProfile,
  phasePlan: PhasePlan,
): Promise<{ maxCostPerIteration: number; totalMaxIterations: number }> {
  let maxCostPerIteration = 0
  let totalMaxIterations = 0

  for (const phaseName of phasePlan.phases) {
    const phase = profile.phases.find(p => p.name === phaseName)
    if (!phase) continue

    totalMaxIterations += phase.maxIterations

    const cost = await getModelCreditCost(db, phase.modelId)
    if (cost > maxCostPerIteration) maxCostPerIteration = cost

    // Also check fallback model cost
    if (phase.fallbackModelId) {
      const fallbackCost = await getModelCreditCost(db, phase.fallbackModelId)
      if (fallbackCost > maxCostPerIteration) maxCostPerIteration = fallbackCost
    }
  }

  return { maxCostPerIteration, totalMaxIterations }
}

/**
 * Calculate actual credit cost after a routed sprint completes.
 * Returns the real cost so the caller can compute refunds.
 */
export async function calculateActualCost(
  db: Db,
  phaseResults: PhaseResult[],
): Promise<number> {
  let total = 0
  for (const r of phaseResults) {
    const cost = await getModelCreditCost(db, r.model)
    total += r.iterations * cost
  }
  return total
}
