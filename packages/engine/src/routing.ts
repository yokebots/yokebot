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
  /** Optional edit-mode phases — used when modifying existing work instead of building from scratch */
  editPhases?: PhaseConfig[]
  editOrchestratorPrompt?: string
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
    orchestratorModelId: 'mimo-v2-flash',
    orchestratorPrompt: `You are a task planner for a web app builder. Given a task, decide which phases are needed.

Available phases:
- "research": Browse a target website to extract design details (colors, fonts, layout). ONLY needed if the task mentions a specific URL or website to reference/clone/improve.
- "plan": Break the task into implementation steps, component list, file structure, and tech decisions. Recommended for complex tasks with multiple features.
- "design": Create a detailed design specification (color palette, typography, spacing, component breakdown) and generate a visual mockup image. Recommended when the task involves UI work.
- "build": Write code to build the web application. ALWAYS needed.
- "test": Run TypeScript and Vite build checks, fix any compilation errors. ALWAYS needed after build.
- "review": Visit the preview URL, compare to requirements, fix issues. ALWAYS needed unless the task is trivial.

Respond with JSON only: {"phases": ["research", "plan", "design", "build", "test", "review"], "reasoning": "one sentence"}

Rules:
- If no URL/website is mentioned, skip "research"
- "plan" is recommended for complex tasks (3+ features or pages), skip for simple single-component tasks
- "design" is recommended for any task with UI work, skip for backend-only or config tasks
- "build" is always required
- "test" is always required after build
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
        systemInstruction: `Research the task requirements.

If the task references a specific URL or website, browse it and extract: color palette (hex values), fonts, layout structure, logo, key sections, navigation, and branding details.

If NO URL is given, search the web for similar existing apps or examples. Navigate to https://www.bing.com/search?q=YOUR+SEARCH+TERMS and browse 2-3 results to gather design inspiration, feature ideas, and UX patterns.

Output a structured report with your findings. Write your research findings to the workspace using write_workspace_file. Do NOT write code. Do NOT ask the human for a URL — find references yourself. Do NOT post your research to chat — keep it as internal context for the next phase. Do NOT call the respond tool.`,
        required: false,
      },
      {
        name: 'plan',
        modelId: 'mimo-v2-flash',
        fallbackModelId: 'deepseek-v3.2',
        maxIterations: 3,
        toolCategories: ['core', 'tasks'],
        skillFilter: [],
        systemInstruction: `You are an implementation planner. Break this task into a concrete build plan. Output a structured document covering:

1. **Component List** — every React component needed, with descriptions
2. **File Structure** — exact file paths and what each file contains
3. **Tech Decisions** — libraries, patterns, state management approach
4. **Data Flow** — how data moves between components, any API calls needed
5. **Responsive Strategy** — breakpoints, mobile-first considerations
6. **Edge Cases** — error states, loading states, empty states

Be specific and opinionated. The build phase will follow this plan exactly. Do NOT write code — only plan. Write your implementation plan to the workspace using write_workspace_file.

DO NOT skip steps or cut corners. Common excuses to reject:
- "This is simple enough to figure out during build" — NO. Plan everything upfront.
- "Standard React patterns are fine" — NO. Specify which patterns and why.
- "I'll leave the details to the builder" — NO. The more detail here, the better the build.`,
        required: false,
      },
      {
        name: 'design',
        modelId: 'mimo-v2-flash',
        fallbackModelId: 'deepseek-v3.2',
        maxIterations: 5,
        toolCategories: ['core', 'media'],
        skillFilter: [],
        systemInstruction: `You are a UI/UX designer. Create a comprehensive design specification AND a visual mockup.

**Step 1 — Design Spec Document** (output as text):
1. **Color Palette** — primary, secondary, accent, background, surface, text colors (hex values)
2. **Typography** — heading font, body font, sizes, weights, line heights
3. **Spacing System** — base unit, padding/margin scale
4. **Component Styles** — buttons, cards, inputs, navigation bar, footer
5. **Layout** — grid system, max-width, responsive breakpoints
6. **Visual Hierarchy** — what draws the eye first, second, third
7. **Micro-interactions** — hover states, transitions, animations

If a research phase provided branding details from a target site, match those exactly. Otherwise, create a modern, clean design that fits the task requirements.

**Step 2 — Visual Mockup**: Call generate_image with modelId "nano-banana-2" to generate a mockup of the main page/screen. Write a detailed prompt describing the exact layout, colors, and content. This image will be passed to the build phase as a visual reference.

Write your design spec to the workspace using write_workspace_file. DO NOT skip the mockup. The build phase needs both the spec AND the image to achieve visual fidelity.`,
        required: false,
      },
      {
        name: 'build',
        modelId: 'qwen-3.6-plus',
        fallbackModelId: 'deepseek-v3.2',
        maxIterations: 30,
        toolCategories: ['core', 'sandbox', 'tasks'],
        skillFilter: [],
        systemInstruction: `Build a complete working web app using sandbox_setup (one call, all files). Use React + TypeScript + Vite + Tailwind CSS v4.

CRITICAL — Tailwind v4 setup (do NOT use v3 PostCSS setup):
- Install: \`tailwindcss @tailwindcss/vite\` (NOT \`tailwindcss postcss autoprefixer\`)
- vite.config.ts: import tailwindcss from "@tailwindcss/vite" and add to plugins array
- index.css: use \`@import "tailwindcss"\` (NOT \`@tailwind base/components/utilities\`)
- Do NOT create tailwind.config.js or postcss.config.js — v4 doesn't need them

If a plan phase ran, follow the component list and file structure exactly.
If a design phase ran, match the color palette, typography, spacing, and layout from the design spec. If a mockup image was generated, replicate its visual layout as closely as possible.
If a research phase ran, match the branding extracted from the target site.

Focus on visual fidelity and working functionality. Do NOT browse.

DO NOT skip steps or cut corners. Common excuses to reject:
- "I'll add styling later" — NO. Ship complete styling in the first pass.
- "A placeholder is fine for now" — NO. Build real content and real components.
- "This feature isn't critical" — NO. If it's in the requirements, build it.
- "I can simplify this" — NO. Match the spec exactly. Simplification loses details.`,
        required: true,
      },
      {
        name: 'test',
        modelId: 'deepseek-v3.2',
        maxIterations: 10,
        toolCategories: ['core', 'sandbox'],
        skillFilter: [],
        systemInstruction: `You are a QA engineer. Run automated checks on the app that was just built and fix any errors.

Step 1: Run TypeScript check — call sandbox_exec with "cd {projectDir} && npx tsc --noEmit 2>&1 | head -30". If there are type errors, fix them with sandbox_write_files.

Step 2: Run Vite build check — call sandbox_exec with "cd {projectDir} && npx vite build 2>&1 | tail -20". If the build fails, fix the errors.

Step 3: Check that all imported files exist — call sandbox_exec with "cd {projectDir} && find src -name '*.tsx' -o -name '*.ts' | head -20" and verify the file structure matches the imports.

Step 4: If you fixed any errors, re-run the TypeScript check to confirm they're resolved.

Do NOT browse. Do NOT mark the task done. Just fix code errors and move on. If everything passes on the first check, exit immediately — don't waste iterations.`,
        required: true,
      },
      {
        name: 'review',
        modelId: 'deepseek-v3.2',
        maxIterations: 8,
        toolCategories: ['core', 'browser', 'sandbox', 'tasks'],
        skillFilter: [],
        systemInstruction: `You MUST browse the preview URL to verify the app works. Do NOT skip this step.

Step 1: Call browser_navigate with the preview URL to open the app.
Step 2: Take a browser_snapshot to see what's on the page.
Step 3: Test the app — click buttons, fill in fields, verify the UI matches the requirements.
Step 4: If anything is broken or missing, fix it using sandbox_write_files, then browse again to verify.
Step 5: When everything works correctly, call update_task with status "done".

You MUST make at least 2 browser calls (navigate + snapshot). Do NOT mark the task done without actually looking at the app.

CIRCUIT BREAKER: If you have attempted 3 fixes for the same issue and it is still broken, describe the issue and call update_task with status "blocked".`,
      },
    ],
    editOrchestratorPrompt: `You are a task planner for editing an existing web app. Given a fix/edit task, decide which phases are needed.

Available phases:
- "research": Browse the preview URL and read existing code to understand what's broken or needs changing. ALWAYS needed for edits.
- "build": Make targeted code changes to fix/edit the app. ALWAYS needed.
- "test": Run TypeScript and build checks to verify the fix compiles. ALWAYS needed after build.
- "review": Browse the preview URL after changes to verify the fix works. ALWAYS needed.

Respond with JSON only: {"phases": ["research", "build", "test", "review"], "reasoning": "one sentence"}

Rules:
- "research" is always required for edits — you MUST look at the current state before changing anything
- "build" is always required
- "test" is always required after build
- "review" is always required — verify your fix works
- Do NOT include "plan" or "design" — those are for new builds only
- Do NOT add phases not in the list above`,
    editPhases: [
      {
        name: 'research',
        modelId: 'deepseek-v3.2',
        fallbackModelId: 'step-3.5-flash',
        maxIterations: 8,
        toolCategories: ['core', 'browser', 'sandbox'],
        skillFilter: [],
        systemInstruction: `You are editing an EXISTING app, not building a new one. Your job is to diagnose what needs to change.

Step 1: Browse the preview URL to see the current state of the app. Take a browser_snapshot to understand what's visible.
Step 2: Read the existing source code using sandbox_read_file to understand the current implementation. Start with the main entry point and follow imports.
Step 3: Identify exactly what needs to change and why.

Output a clear diagnosis:
- **Current behavior:** What the app does now
- **Expected behavior:** What the user wants
- **Root cause:** Why the current behavior differs
- **Files to change:** Exact file paths and what to modify in each

Do NOT write code yet. Do NOT create new projects. Do NOT use sandbox_setup. Diagnose only.`,
        required: true,
      },
      {
        name: 'build',
        modelId: 'qwen-3.6-plus',
        fallbackModelId: 'deepseek-v3.2',
        maxIterations: 15,
        toolCategories: ['core', 'sandbox', 'tasks'],
        skillFilter: [],
        systemInstruction: `You are making TARGETED edits to an existing app. Do NOT rebuild from scratch. Do NOT call sandbox_setup. Do NOT try to browse — you don't have browser tools in this phase.

Use sandbox_write_file or sandbox_write_files to update ONLY the files that need to change based on the research phase diagnosis.

Rules:
- Preserve all existing functionality that isn't being changed
- Make the minimum changes needed to fix the issue
- Do NOT rewrite entire files unless absolutely necessary — change only the relevant sections
- Do NOT change the project structure, framework, or dependencies unless the fix requires it
- If the research phase identified specific files and changes, follow that plan exactly
- If an auto-detected error was provided, fix that specific error first`,
        required: true,
      },
      {
        name: 'test',
        modelId: 'deepseek-v3.2',
        maxIterations: 6,
        toolCategories: ['core', 'sandbox'],
        skillFilter: [],
        systemInstruction: `Run automated checks to verify your edits compile correctly.

Step 1: Run TypeScript check — call sandbox_exec with "cd {projectDir} && npx tsc --noEmit 2>&1 | head -30". If there are errors, fix them.
Step 2: If you fixed anything, re-run the check to confirm.

Do NOT browse. Do NOT mark done. Just verify the code compiles and move on.`,
        required: true,
      },
      {
        name: 'review',
        modelId: 'deepseek-v3.2',
        maxIterations: 8,
        toolCategories: ['core', 'browser', 'sandbox', 'tasks'],
        skillFilter: [],
        systemInstruction: `Verify that your edits fixed the issue. You MUST browse the preview URL.

Step 1: Call browser_navigate with the preview URL.
Step 2: Take a browser_snapshot to see the result.
Step 3: Test the specific thing that was broken/changed — click buttons, check layouts, verify data.
Step 4: If still broken, make a targeted fix with sandbox_write_files, then browse again.
Step 5: When the fix is verified, call update_task with status "done".

You MUST make at least 2 browser calls. Do NOT mark done without visually verifying.

CIRCUIT BREAKER: If you have attempted 3 fixes for the same issue and it is still broken, describe the issue and call update_task with status "blocked".`,
      },
    ],
  },

  // ===== BuilderBot edit phases (research → build → review) =====
  // When editing/fixing an existing project, skip plan + design and use targeted prompts.
  // The research phase MUST browse the preview + read existing code to diagnose the issue.
  // Defined inline above via editPhases on the builder-bot profile.

  // ===== Universal agent profile (research → execute → deliver) =====
  // Used by non-builder agents: ContentBot, ProspectorBot, AdvisorBot, ReputationBot, etc.
  // 3 phases: research the topic, do the work, deliver a polished result.
  ...[
    'content-bot', 'prospector-bot', 'advisor-bot', 'reputation-bot',
    'social-bot', 'ad-bot', 'seo-bot', 'email-bot', 'closer-bot',
    'onboarder-bot', 'creative-bot', 'support-bot', 'analytics-bot',
    'finance-bot', 'bookkeeper-bot', 'recruiter-bot', 'legal-bot',
    'dev-bot', 'commerce-bot', 'scheduler-bot', 'project-bot',
  ].map(templateId => ({
    templateId,
    orchestratorModelId: '',
    orchestratorPrompt: '',
    phases: [
      {
        name: 'research',
        modelId: 'step-3.5-flash',
        fallbackModelId: 'deepseek-v3.2',
        maxIterations: 10,
        toolCategories: ['core', 'browser', 'workspace', 'data'] as ToolCategory[],
        skillFilter: undefined as string[] | undefined,
        systemInstruction: `Research the task. Browse the web for relevant information, check workspace files for existing context, and gather what you need to produce a high-quality deliverable. Write your research findings to Reports/ or Documents/ in the workspace using write_workspace_file. Do NOT do the actual work yet — just research.

If you need to search the web, navigate to https://www.bing.com/search?q=YOUR+SEARCH+TERMS and browse results. Do NOT ask the human for URLs.`,
        required: false,
      },
      {
        name: 'execute',
        modelId: 'deepseek-v3.2',
        maxIterations: 20,
        toolCategories: ['core', 'workspace', 'tasks', 'chat', 'data', 'browser', 'skills'] as ToolCategory[],
        skillFilter: undefined as string[] | undefined,
        systemInstruction: `Do the work. Using your research findings, produce the deliverable the task requires. Write files to the workspace, create data tables, send messages, or use any tools needed. Be thorough and complete — do NOT cut corners or produce partial work.`,
        required: true,
      },
      {
        name: 'deliver',
        modelId: 'mimo-v2-flash',
        fallbackModelId: 'deepseek-v3.2',
        maxIterations: 3,
        toolCategories: ['core', 'tasks', 'chat'] as ToolCategory[],
        skillFilter: [] as string[],
        systemInstruction: `Review what was produced in the execute phase. Write the full deliverable to the workspace (Reports/ or Documents/) using write_workspace_file if not already saved. Post a concise summary to the team chat using the respond tool — include what was created, where to find it, and any key highlights. Then call update_task with status "done".`,
        required: true,
      },
    ],
    editPhases: [
      {
        name: 'research',
        modelId: 'step-3.5-flash',
        fallbackModelId: 'deepseek-v3.2',
        maxIterations: 6,
        toolCategories: ['core', 'browser', 'workspace', 'data'] as ToolCategory[],
        skillFilter: undefined as string[] | undefined,
        systemInstruction: `You are editing/fixing EXISTING work, not starting fresh. Research what currently exists and what needs to change.

Read the relevant workspace files, check existing data, and understand the current state before making changes. If the task references something visible (a page, report, etc.), browse it first.

Output a clear diagnosis:
- **Current state:** What exists now
- **Requested change:** What the user wants different
- **What to modify:** Specific files, data, or content that need to change

Do NOT do the actual work yet — diagnose only.`,
        required: true,
      },
      {
        name: 'execute',
        modelId: 'deepseek-v3.2',
        maxIterations: 12,
        toolCategories: ['core', 'workspace', 'tasks', 'chat', 'data', 'browser', 'skills'] as ToolCategory[],
        skillFilter: undefined as string[] | undefined,
        systemInstruction: `Make TARGETED changes based on your research. Do NOT redo work that already exists.

- Only modify what needs to change
- Preserve everything that's working correctly
- If updating a document, edit the specific sections — don't rewrite the entire thing
- If fixing data, update the specific records — don't regenerate all data`,
        required: true,
      },
      {
        name: 'deliver',
        modelId: 'mimo-v2-flash',
        fallbackModelId: 'deepseek-v3.2',
        maxIterations: 3,
        toolCategories: ['core', 'tasks', 'chat'] as ToolCategory[],
        skillFilter: [] as string[],
        systemInstruction: `Summarize what was changed. Post to team chat using the respond tool — describe what was fixed/edited and verify the change looks correct. Then call update_task with status "done".`,
        required: true,
      },
    ],
  } as RoutingProfile)),
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
  _db: Db,
  profile: RoutingProfile,
  taskTitle: string,
  taskDescription: string | null,
  _teamId: string,
  _installedSkills?: string[],
  isEdit?: boolean,
): Promise<PhasePlan> {
  // Select edit phases when available and this is an edit/fix request
  const phases = (isEdit && profile.editPhases) ? profile.editPhases : profile.phases
  const mode = (isEdit && profile.editPhases) ? 'edit' : 'build'
  const allPhaseNames = phases.map(p => p.name)
  console.log(`[routing] Orchestrator plan: [${allPhaseNames.join(', ')}] — ${mode} mode`)

  return { phases: allPhaseNames, reasoning: `${mode} mode — all ${mode} phases`, skillOverrides: {} }
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
  extraContext?: { previewUrl?: string; sandboxProjectDir?: string; projectName?: string; detectedError?: string },
): string {
  const parts: string[] = []

  // Phase instruction
  parts.push(`## Your Role\n${phase.systemInstruction}`)

  // Inject auto-detected errors so the agent doesn't waste iterations diagnosing
  if (extraContext?.detectedError) {
    parts.push(`## Auto-Detected Error\nThe harness probed the preview and found this error BEFORE you started:\n\`\`\`\n${extraContext.detectedError}\n\`\`\`\nFix this specific error. Read the failing file(s), identify the bug, and fix it.`)
  }

  // Inject concrete sandbox context so the model doesn't have to guess
  if (extraContext?.previewUrl) {
    parts.push(`## Preview URL\nThe app is running at: ${extraContext.previewUrl}\nUse browser_navigate to visit this URL to see the app.`)
  }
  if (extraContext?.sandboxProjectDir) {
    parts.push(`## Sandbox Project\nAll code files are at: ${extraContext.sandboxProjectDir}`)
  }
  if (extraContext?.projectName) {
    parts.push(`## Workspace Project\nWrite project documents (research, plan, design-spec) to: Projects/${extraContext.projectName}/`)
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
