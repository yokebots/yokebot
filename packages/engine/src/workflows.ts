/**
 * workflows.ts — Workflow CRUD: reusable multi-step agent processes
 *
 * Workflows are blueprints of ordered steps. When run, they create real tasks
 * in the existing task system. Step chaining is event-driven via onTaskCompleted().
 */

import type { Db } from './db/types.ts'
import { randomUUID } from 'crypto'

// ---- Types ----

export type WorkflowStatus = 'active' | 'archived'
export type TriggerType = 'manual' | 'scheduled' | 'row_added' | 'row_updated'
export type GateType = 'auto' | 'approval'
export type RunStatus = 'running' | 'paused' | 'completed' | 'failed' | 'canceled'
export type RunStepStatus = 'pending' | 'running' | 'awaiting_approval' | 'completed' | 'failed' | 'skipped'

export interface Workflow {
  id: string
  teamId: string
  name: string
  description: string
  goalId: string | null
  triggerType: TriggerType
  scheduleCron: string | null
  triggerTableId: string | null
  createdBy: string
  status: WorkflowStatus
  createdAt: string
  updatedAt: string
}

export interface WorkflowStep {
  id: string
  workflowId: string
  stepOrder: number
  title: string
  description: string
  assignedAgentId: string | null
  gate: GateType
  timeoutMinutes: number | null
  config: string
}

export interface WorkflowRun {
  id: string
  teamId: string
  workflowId: string
  status: RunStatus
  currentStep: number
  startedBy: string
  context: string
  startedAt: string
  completedAt: string | null
  error: string | null
}

export interface WorkflowRunStep {
  id: string
  runId: string
  stepId: string
  taskId: string | null
  status: RunStepStatus
  startedAt: string | null
  completedAt: string | null
  error: string | null
}

// ---- Workflow CRUD ----

export async function createWorkflow(
  db: Db,
  teamId: string,
  name: string,
  opts?: { description?: string; goalId?: string; triggerType?: TriggerType; scheduleCron?: string; triggerTableId?: string; createdBy?: string },
): Promise<Workflow> {
  const id = randomUUID()
  await db.run(
    'INSERT INTO workflows (id, team_id, name, description, goal_id, trigger_type, schedule_cron, trigger_table_id, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
    [id, teamId, name, opts?.description ?? '', opts?.goalId ?? null, opts?.triggerType ?? 'manual', opts?.scheduleCron ?? null, opts?.triggerTableId ?? null, opts?.createdBy ?? ''],
  )
  return (await getWorkflow(db, id))!
}

export async function getWorkflow(db: Db, id: string): Promise<Workflow | null> {
  const row = await db.queryOne<Record<string, unknown>>('SELECT * FROM workflows WHERE id = $1', [id])
  if (!row) return null
  return rowToWorkflow(row)
}

export async function listWorkflows(db: Db, teamId: string, status?: WorkflowStatus): Promise<Workflow[]> {
  let sql = 'SELECT * FROM workflows WHERE team_id = $1'
  const params: unknown[] = [teamId]
  if (status) {
    sql += ' AND status = $2'
    params.push(status)
  }
  sql += ' ORDER BY created_at DESC'
  const rows = await db.query<Record<string, unknown>>(sql, params)
  return rows.map(rowToWorkflow)
}

export async function updateWorkflow(
  db: Db,
  id: string,
  updates: { name?: string; description?: string; goalId?: string | null; triggerType?: TriggerType; scheduleCron?: string | null; triggerTableId?: string | null; status?: WorkflowStatus },
): Promise<Workflow | null> {
  const fields: string[] = []
  const values: unknown[] = []
  let paramIdx = 1

  if (updates.name !== undefined) { fields.push(`name = $${paramIdx++}`); values.push(updates.name) }
  if (updates.description !== undefined) { fields.push(`description = $${paramIdx++}`); values.push(updates.description) }
  if (updates.goalId !== undefined) { fields.push(`goal_id = $${paramIdx++}`); values.push(updates.goalId) }
  if (updates.triggerType !== undefined) { fields.push(`trigger_type = $${paramIdx++}`); values.push(updates.triggerType) }
  if (updates.scheduleCron !== undefined) { fields.push(`schedule_cron = $${paramIdx++}`); values.push(updates.scheduleCron) }
  if (updates.triggerTableId !== undefined) { fields.push(`trigger_table_id = $${paramIdx++}`); values.push(updates.triggerTableId) }
  if (updates.status !== undefined) { fields.push(`status = $${paramIdx++}`); values.push(updates.status) }

  if (fields.length === 0) return getWorkflow(db, id)

  fields.push(`updated_at = ${db.now()}`)
  values.push(id)

  await db.run(`UPDATE workflows SET ${fields.join(', ')} WHERE id = $${paramIdx}`, values)
  return getWorkflow(db, id)
}

export async function deleteWorkflow(db: Db, id: string): Promise<void> {
  await db.run('DELETE FROM workflows WHERE id = $1', [id])
}

// ---- Step CRUD ----

export async function addStep(
  db: Db,
  workflowId: string,
  title: string,
  opts?: { description?: string; assignedAgentId?: string; gate?: GateType; timeoutMinutes?: number; config?: string; stepOrder?: number },
): Promise<WorkflowStep> {
  const id = randomUUID()
  let stepOrder = opts?.stepOrder
  if (stepOrder === undefined) {
    const row = await db.queryOne<{ max_order: number | null }>(
      'SELECT MAX(step_order) as max_order FROM workflow_steps WHERE workflow_id = $1',
      [workflowId],
    )
    stepOrder = (row?.max_order ?? -1) + 1
  }
  await db.run(
    'INSERT INTO workflow_steps (id, workflow_id, step_order, title, description, assigned_agent_id, gate, timeout_minutes, config) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
    [id, workflowId, stepOrder, title, opts?.description ?? '', opts?.assignedAgentId ?? null, opts?.gate ?? 'auto', opts?.timeoutMinutes ?? null, opts?.config ?? '{}'],
  )
  return (await getStep(db, id))!
}

async function getStep(db: Db, id: string): Promise<WorkflowStep | null> {
  const row = await db.queryOne<Record<string, unknown>>('SELECT * FROM workflow_steps WHERE id = $1', [id])
  if (!row) return null
  return rowToStep(row)
}

export async function updateStep(
  db: Db,
  id: string,
  updates: { title?: string; description?: string; assignedAgentId?: string | null; gate?: GateType; timeoutMinutes?: number | null; config?: string },
): Promise<WorkflowStep | null> {
  const fields: string[] = []
  const values: unknown[] = []
  let paramIdx = 1

  if (updates.title !== undefined) { fields.push(`title = $${paramIdx++}`); values.push(updates.title) }
  if (updates.description !== undefined) { fields.push(`description = $${paramIdx++}`); values.push(updates.description) }
  if (updates.assignedAgentId !== undefined) { fields.push(`assigned_agent_id = $${paramIdx++}`); values.push(updates.assignedAgentId) }
  if (updates.gate !== undefined) { fields.push(`gate = $${paramIdx++}`); values.push(updates.gate) }
  if (updates.timeoutMinutes !== undefined) { fields.push(`timeout_minutes = $${paramIdx++}`); values.push(updates.timeoutMinutes) }
  if (updates.config !== undefined) { fields.push(`config = $${paramIdx++}`); values.push(updates.config) }

  if (fields.length === 0) return getStep(db, id)

  values.push(id)
  await db.run(`UPDATE workflow_steps SET ${fields.join(', ')} WHERE id = $${paramIdx}`, values)
  return getStep(db, id)
}

export async function deleteStep(db: Db, id: string): Promise<void> {
  await db.run('DELETE FROM workflow_steps WHERE id = $1', [id])
}

export async function listSteps(db: Db, workflowId: string): Promise<WorkflowStep[]> {
  const rows = await db.query<Record<string, unknown>>(
    'SELECT * FROM workflow_steps WHERE workflow_id = $1 ORDER BY step_order ASC',
    [workflowId],
  )
  return rows.map(rowToStep)
}

export async function reorderSteps(db: Db, workflowId: string, stepIds: string[]): Promise<void> {
  for (let i = 0; i < stepIds.length; i++) {
    await db.run(
      'UPDATE workflow_steps SET step_order = $1 WHERE id = $2 AND workflow_id = $3',
      [i, stepIds[i], workflowId],
    )
  }
}

// ---- Run CRUD ----

export async function startRun(
  db: Db,
  teamId: string,
  workflowId: string,
  startedBy: string,
  context?: Record<string, unknown>,
): Promise<WorkflowRun> {
  const id = randomUUID()
  await db.run(
    'INSERT INTO workflow_runs (id, team_id, workflow_id, started_by, context) VALUES ($1, $2, $3, $4, $5)',
    [id, teamId, workflowId, startedBy, JSON.stringify(context ?? {})],
  )

  // Create run_step records for each workflow step
  const steps = await listSteps(db, workflowId)
  for (const step of steps) {
    const rsId = randomUUID()
    await db.run(
      'INSERT INTO workflow_run_steps (id, run_id, step_id) VALUES ($1, $2, $3)',
      [rsId, id, step.id],
    )
  }

  return (await getRun(db, id))!
}

export async function getRun(db: Db, id: string): Promise<WorkflowRun | null> {
  const row = await db.queryOne<Record<string, unknown>>('SELECT * FROM workflow_runs WHERE id = $1', [id])
  if (!row) return null
  return rowToRun(row)
}

export async function listRuns(db: Db, filters?: { teamId?: string; workflowId?: string; status?: RunStatus }): Promise<WorkflowRun[]> {
  let sql = 'SELECT * FROM workflow_runs WHERE 1=1'
  const params: unknown[] = []
  let paramIdx = 1

  if (filters?.teamId) { sql += ` AND team_id = $${paramIdx++}`; params.push(filters.teamId) }
  if (filters?.workflowId) { sql += ` AND workflow_id = $${paramIdx++}`; params.push(filters.workflowId) }
  if (filters?.status) { sql += ` AND status = $${paramIdx++}`; params.push(filters.status) }

  sql += ' ORDER BY started_at DESC'
  const rows = await db.query<Record<string, unknown>>(sql, params)
  return rows.map(rowToRun)
}

export async function cancelRun(db: Db, id: string): Promise<WorkflowRun | null> {
  const now = db.now()
  await db.run(
    `UPDATE workflow_runs SET status = 'canceled', completed_at = ${now} WHERE id = $1 AND status IN ('running', 'paused')`,
    [id],
  )
  // Skip remaining pending steps
  await db.run(
    `UPDATE workflow_run_steps SET status = 'skipped' WHERE run_id = $1 AND status = 'pending'`,
    [id],
  )
  return getRun(db, id)
}

export async function listRunSteps(db: Db, runId: string): Promise<WorkflowRunStep[]> {
  const rows = await db.query<Record<string, unknown>>(
    'SELECT rs.* FROM workflow_run_steps rs JOIN workflow_steps ws ON ws.id = rs.step_id WHERE rs.run_id = $1 ORDER BY ws.step_order ASC',
    [runId],
  )
  return rows.map(rowToRunStep)
}

// ---- Capture from existing tasks ----

export async function captureWorkflow(
  db: Db,
  teamId: string,
  name: string,
  taskIds: string[],
): Promise<Workflow> {
  // Fetch the tasks to build steps from
  const tasks: Array<{ title: string; description: string | null; assignedAgentId: string | null; createdAt: string }> = []
  for (const taskId of taskIds) {
    const row = await db.queryOne<Record<string, unknown>>(
      'SELECT title, description, assigned_agent_id, created_at FROM tasks WHERE id = $1 AND team_id = $2',
      [taskId, teamId],
    )
    if (row) {
      tasks.push({
        title: row.title as string,
        description: row.description as string | null,
        assignedAgentId: row.assigned_agent_id as string | null,
        createdAt: row.created_at as string,
      })
    }
  }

  // Sort by created_at to preserve original order
  tasks.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

  // Create workflow
  const workflow = await createWorkflow(db, teamId, name, { createdBy: 'capture' })

  // Create steps from tasks
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i]
    await addStep(db, workflow.id, t.title, {
      description: t.description ?? '',
      assignedAgentId: t.assignedAgentId ?? undefined,
      stepOrder: i,
    })
  }

  return workflow
}

// ---- Table-triggered workflow lookup ----

export async function findWorkflowsByTableTrigger(
  db: Db,
  teamId: string,
  tableId: string,
  triggerType: 'row_added' | 'row_updated',
): Promise<Workflow[]> {
  const rows = await db.query<Record<string, unknown>>(
    `SELECT * FROM workflows WHERE team_id = $1 AND trigger_table_id = $2 AND trigger_type = $3 AND status = 'active'`,
    [teamId, tableId, triggerType],
  )
  return rows.map(rowToWorkflow)
}

// ---- Row converters ----

function rowToWorkflow(row: Record<string, unknown>): Workflow {
  return {
    id: row.id as string,
    teamId: row.team_id as string,
    name: row.name as string,
    description: (row.description as string) ?? '',
    goalId: row.goal_id as string | null,
    triggerType: (row.trigger_type as TriggerType) ?? 'manual',
    scheduleCron: row.schedule_cron as string | null,
    triggerTableId: row.trigger_table_id as string | null,
    createdBy: (row.created_by as string) ?? '',
    status: (row.status as WorkflowStatus) ?? 'active',
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

function rowToStep(row: Record<string, unknown>): WorkflowStep {
  return {
    id: row.id as string,
    workflowId: row.workflow_id as string,
    stepOrder: row.step_order as number,
    title: row.title as string,
    description: (row.description as string) ?? '',
    assignedAgentId: row.assigned_agent_id as string | null,
    gate: (row.gate as GateType) ?? 'auto',
    timeoutMinutes: row.timeout_minutes as number | null,
    config: (row.config as string) ?? '{}',
  }
}

function rowToRun(row: Record<string, unknown>): WorkflowRun {
  return {
    id: row.id as string,
    teamId: row.team_id as string,
    workflowId: row.workflow_id as string,
    status: (row.status as RunStatus) ?? 'running',
    currentStep: (row.current_step as number) ?? 0,
    startedBy: (row.started_by as string) ?? '',
    context: (row.context as string) ?? '{}',
    startedAt: row.started_at as string,
    completedAt: row.completed_at as string | null,
    error: row.error as string | null,
  }
}

function rowToRunStep(row: Record<string, unknown>): WorkflowRunStep {
  return {
    id: row.id as string,
    runId: row.run_id as string,
    stepId: row.step_id as string,
    taskId: row.task_id as string | null,
    status: (row.status as RunStepStatus) ?? 'pending',
    startedAt: row.started_at as string | null,
    completedAt: row.completed_at as string | null,
    error: row.error as string | null,
  }
}
