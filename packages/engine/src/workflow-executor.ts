/**
 * workflow-executor.ts — Event-driven step chaining for workflow runs
 *
 * Core insight: workflows create real tasks in the existing task system.
 * Step chaining happens via onTaskCompleted() — when a task is marked 'done',
 * we check if it belongs to a workflow run and advance to the next step.
 */

import type { Db } from './db/types.ts'
import { createTask } from './tasks.ts'
import { getRun, getWorkflow, listSteps, listRunSteps } from './workflows.ts'
import { triggerAgentNow } from './scheduler.ts'
import { logActivity } from './activity.ts'

/**
 * Advance a workflow run to its next pending step.
 * Called after starting a run or after a step completes.
 */
export async function advanceWorkflow(db: Db, runId: string): Promise<void> {
  const run = await getRun(db, runId)
  if (!run || run.status === 'completed' || run.status === 'canceled' || run.status === 'failed') return

  const runSteps = await listRunSteps(db, runId)
  const steps = await listSteps(db, run.workflowId)

  // Find next pending run_step
  const nextRunStep = runSteps.find((rs) => rs.status === 'pending')
  if (!nextRunStep) {
    // All steps done — mark run completed
    const now = db.now()
    await db.run(
      `UPDATE workflow_runs SET status = 'completed', completed_at = ${now} WHERE id = $1`,
      [runId],
    )

    // Log completion
    const completedWf = await getWorkflow(db, run.workflowId)
    await logActivity(db, 'workflow_run_completed', null, `Workflow "${completedWf?.name ?? run.workflowId}" run completed`, undefined, run.teamId)

    // Update linked goal progress if applicable
    const workflow = completedWf ?? await getWorkflow(db, run.workflowId)
    if (workflow?.goalId) {
      try {
        // Trigger a no-op link/unlink to force recalc (linkTask is idempotent)
        const { getGoalTasks } = await import('./goals.ts')
        const taskIds = await getGoalTasks(db, workflow.goalId)
        if (taskIds.length > 0) {
          const { linkTask } = await import('./goals.ts')
          await linkTask(db, workflow.goalId, taskIds[0])
        }
      } catch { /* goal progress update is best-effort */ }
    }
    return
  }

  // Find the matching step definition
  const stepDef = steps.find((s) => s.id === nextRunStep.stepId)
  if (!stepDef) {
    await db.run(
      `UPDATE workflow_run_steps SET status = 'failed', error = 'Step definition not found' WHERE id = $1`,
      [nextRunStep.id],
    )
    await db.run(
      `UPDATE workflow_runs SET status = 'failed', error = 'Step definition missing', completed_at = ${db.now()} WHERE id = $1`,
      [runId],
    )
    const failedWf = await getWorkflow(db, run.workflowId)
    await logActivity(db, 'workflow_run_failed', null, `Workflow "${failedWf?.name ?? run.workflowId}" run failed: step definition missing`, undefined, run.teamId)
    return
  }

  // Parse step config (skills, instructions, outputVariable)
  let stepConfig: { skills?: string[]; instructions?: string; outputVariable?: string } = {}
  try { stepConfig = JSON.parse(stepDef.config || '{}') } catch { /* use defaults */ }

  // Build task description: step description + any custom instructions
  let taskDescription = stepDef.description || ''
  if (stepConfig.instructions) {
    taskDescription = taskDescription
      ? `${taskDescription}\n\n--- Step Instructions ---\n${stepConfig.instructions}`
      : stepConfig.instructions
  }

  // Resolve {{row.Field}} references from run context (row-triggered data)
  if (taskDescription.includes('{{')) {
    try {
      const runContext = JSON.parse(run.context || '{}')
      if (runContext.row && typeof runContext.row === 'object') {
        for (const [key, val] of Object.entries(runContext.row as Record<string, unknown>)) {
          taskDescription = taskDescription.replace(
            new RegExp(`\\{\\{row\\.${key}\\}\\}`, 'g'),
            String(val ?? ''),
          )
        }
      }
      // Also resolve {{tableName}} from context
      if (runContext.tableName) {
        taskDescription = taskDescription.replace(/\{\{tableName\}\}/g, String(runContext.tableName))
      }
    } catch { /* ignore bad context JSON */ }
  }

  // Resolve {{variable}} references in the description from prior step outputs
  if (taskDescription.includes('{{')) {
    const priorOutputs = await db.query<Record<string, unknown>>(
      `SELECT wrs.config FROM workflow_run_steps wrs
       JOIN workflow_steps ws ON ws.id = wrs.step_id
       WHERE wrs.run_id = $1 AND wrs.status = 'completed'`,
      [runId],
    )
    for (const row of priorOutputs) {
      try {
        const cfg = JSON.parse((row.config as string) || '{}')
        if (cfg.outputVariable && cfg.outputValue) {
          taskDescription = taskDescription.replace(
            new RegExp(`\\{\\{${cfg.outputVariable}\\}\\}`, 'g'),
            cfg.outputValue,
          )
        }
      } catch { /* skip */ }
    }
  }

  // Create a real task for this step
  const task = await createTask(db, run.teamId, stepDef.title, {
    description: taskDescription || undefined,
    assignedAgentId: stepDef.assignedAgentId || undefined,
    priority: 'medium',
  })

  // Install extra skills on the assigned agent for this step
  if (stepConfig.skills && stepConfig.skills.length > 0 && stepDef.assignedAgentId) {
    try {
      const { installSkill } = await import('./skills.ts')
      for (const skillName of stepConfig.skills) {
        await installSkill(db, stepDef.assignedAgentId, skillName).catch(() => {})
      }
    } catch { /* best-effort skill installation */ }
  }

  // Update run_step with task_id and mark running
  const now = db.now()
  await db.run(
    `UPDATE workflow_run_steps SET task_id = $1, status = 'running', started_at = ${now} WHERE id = $2`,
    [task.id, nextRunStep.id],
  )

  // Update run's current_step
  await db.run(
    'UPDATE workflow_runs SET current_step = $1 WHERE id = $2',
    [stepDef.stepOrder, runId],
  )

  if (stepDef.gate === 'approval') {
    // Pause for human approval
    await db.run(
      `UPDATE workflow_run_steps SET status = 'awaiting_approval' WHERE id = $1`,
      [nextRunStep.id],
    )
    await db.run(
      `UPDATE workflow_runs SET status = 'paused' WHERE id = $1`,
      [runId],
    )
  } else {
    // Auto gate — trigger agent if assigned
    if (stepDef.assignedAgentId) {
      try {
        await triggerAgentNow(db, stepDef.assignedAgentId, run.teamId)
      } catch (err) {
        console.error(`[workflow-executor] Failed to trigger agent for step:`, err)
      }
    }
  }
}

/**
 * Called when any task transitions to 'done'.
 * Checks if the task is linked to a workflow run step and advances the workflow.
 */
export async function onTaskCompleted(db: Db, taskId: string): Promise<void> {
  // Find a run_step linked to this task
  const runStep = await db.queryOne<Record<string, unknown>>(
    `SELECT wrs.*, ws.config as step_config FROM workflow_run_steps wrs
     JOIN workflow_steps ws ON ws.id = wrs.step_id
     WHERE wrs.task_id = $1 AND wrs.status IN ('running', 'awaiting_approval')`,
    [taskId],
  )
  if (!runStep) return

  // If the step has an outputVariable, store the task's final output/description as the value
  try {
    const stepCfg = JSON.parse((runStep.step_config as string) || '{}')
    if (stepCfg.outputVariable) {
      // Get the task's description (which may have been updated by the agent as its output)
      const { getTask } = await import('./tasks.ts')
      const completedTask = await getTask(db, taskId)
      if (completedTask) {
        // Store the output value in the run_step's config column
        const runStepConfig = JSON.parse((runStep.config as string) || '{}')
        runStepConfig.outputVariable = stepCfg.outputVariable
        runStepConfig.outputValue = completedTask.description || completedTask.title
        await db.run(
          `UPDATE workflow_run_steps SET config = $1 WHERE id = $2`,
          [JSON.stringify(runStepConfig), runStep.id as string],
        )
      }
    }
  } catch { /* best-effort output variable storage */ }

  const now = db.now()
  await db.run(
    `UPDATE workflow_run_steps SET status = 'completed', completed_at = ${now} WHERE id = $1`,
    [runStep.id as string],
  )

  // Resume run if it was paused
  await db.run(
    `UPDATE workflow_runs SET status = 'running' WHERE id = $1 AND status = 'paused'`,
    [runStep.run_id as string],
  )

  // Advance to next step
  await advanceWorkflow(db, runStep.run_id as string)
}

/**
 * Human approves a paused workflow step.
 * Marks the step as running, resumes the run, and triggers the assigned agent.
 */
export async function approveWorkflowStep(db: Db, runStepId: string): Promise<void> {
  const runStep = await db.queryOne<Record<string, unknown>>(
    `SELECT * FROM workflow_run_steps WHERE id = $1 AND status = 'awaiting_approval'`,
    [runStepId],
  )
  if (!runStep) return

  const now = db.now()
  await db.run(
    `UPDATE workflow_run_steps SET status = 'running', started_at = ${now} WHERE id = $1`,
    [runStepId],
  )

  // Resume the run
  await db.run(
    `UPDATE workflow_runs SET status = 'running' WHERE id = $1 AND status = 'paused'`,
    [runStep.run_id as string],
  )

  // Find step def to get assigned agent
  const stepDef = await db.queryOne<Record<string, unknown>>(
    'SELECT * FROM workflow_steps WHERE id = $1',
    [runStep.step_id as string],
  )

  if (stepDef?.assigned_agent_id) {
    // Get teamId from the run
    const run = await getRun(db, runStep.run_id as string)
    if (run) {
      try {
        await triggerAgentNow(db, stepDef.assigned_agent_id as string, run.teamId)
      } catch (err) {
        console.error(`[workflow-executor] Failed to trigger agent after approval:`, err)
      }
    }
  }
}
