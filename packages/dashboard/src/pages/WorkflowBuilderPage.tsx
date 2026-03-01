import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router'
import * as engine from '@/lib/engine'
import type { EngineAgent, WorkflowStep, AgentSkill, SorTable } from '@/lib/engine'

interface StepForm {
  id?: string
  title: string
  description: string
  assignedAgentId: string
  gate: 'auto' | 'approval'
  timeoutMinutes: string
  skills: string[]
  instructions: string
  outputVariable: string
}

const emptyStep = (): StepForm => ({
  title: '', description: '', assignedAgentId: '', gate: 'auto', timeoutMinutes: '',
  skills: [], instructions: '', outputVariable: '',
})

interface SkillMeta {
  metadata: { name: string; description: string; tags: string[]; source: string }
  filePath: string
}

export function WorkflowBuilderPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isEditing = !!id

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [triggerType, setTriggerType] = useState<'manual' | 'scheduled' | 'row_added' | 'row_updated'>('manual')
  const [scheduleCron, setScheduleCron] = useState('')
  const [triggerTableId, setTriggerTableId] = useState('')
  const [sorTables, setSorTables] = useState<SorTable[]>([])
  const [steps, setSteps] = useState<StepForm[]>([emptyStep()])
  const [agents, setAgents] = useState<EngineAgent[]>([])
  const [allSkills, setAllSkills] = useState<SkillMeta[]>([])
  const [agentSkillsMap, setAgentSkillsMap] = useState<Record<string, AgentSkill[]>>({})
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(isEditing)

  useEffect(() => {
    engine.listAgents().then(setAgents).catch(() => {})
    engine.listSkills().then(setAllSkills).catch(() => {})
    engine.listSorTables().then(setSorTables).catch(() => {})
    if (isEditing) {
      engine.getWorkflow(id).then((wf) => {
        setName(wf.name)
        setDescription(wf.description)
        setTriggerType(wf.triggerType)
        setScheduleCron(wf.scheduleCron ?? '')
        setTriggerTableId(wf.triggerTableId ?? '')
        if (wf.steps.length > 0) {
          setSteps(wf.steps.map((s: WorkflowStep) => {
            const cfg = safeParseConfig(s.config)
            return {
              id: s.id,
              title: s.title,
              description: s.description,
              assignedAgentId: s.assignedAgentId ?? '',
              gate: s.gate,
              timeoutMinutes: s.timeoutMinutes?.toString() ?? '',
              skills: (Array.isArray(cfg.skills) ? cfg.skills : []) as string[],
              instructions: (typeof cfg.instructions === 'string' ? cfg.instructions : '') as string,
              outputVariable: (typeof cfg.outputVariable === 'string' ? cfg.outputVariable : '') as string,
            }
          }))
        }
        setLoading(false)
      }).catch(() => setLoading(false))
    }
  }, [id])

  // Load agent skills when agents change
  useEffect(() => {
    const loadSkills = async () => {
      const map: Record<string, AgentSkill[]> = {}
      await Promise.all(agents.map(async (a) => {
        try {
          map[a.id] = await engine.getAgentSkills(a.id)
        } catch { /* ignore */ }
      }))
      setAgentSkillsMap(map)
    }
    if (agents.length > 0) loadSkills()
  }, [agents])

  const safeParseConfig = (config: string): Record<string, unknown> => {
    try { return JSON.parse(config || '{}') } catch { return {} }
  }

  const addStep = () => setSteps([...steps, emptyStep()])

  const removeStep = (index: number) => {
    if (steps.length <= 1) return
    setSteps(steps.filter((_, i) => i !== index))
  }

  const updateStepField = (index: number, field: keyof StepForm, value: string | string[]) => {
    setSteps(steps.map((s, i) => i === index ? { ...s, [field]: value } : s))
  }

  const toggleStepSkill = (index: number, skillName: string) => {
    setSteps(steps.map((s, i) => {
      if (i !== index) return s
      const skills = s.skills.includes(skillName)
        ? s.skills.filter((sk) => sk !== skillName)
        : [...s.skills, skillName]
      return { ...s, skills }
    }))
  }

  const moveStep = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction
    if (newIndex < 0 || newIndex >= steps.length) return
    const newSteps = [...steps]
    ;[newSteps[index], newSteps[newIndex]] = [newSteps[newIndex], newSteps[index]]
    setSteps(newSteps)
  }

  const buildStepConfig = (s: StepForm): string | undefined => {
    const config: Record<string, unknown> = {}
    if (s.skills.length > 0) config.skills = s.skills
    if (s.instructions.trim()) config.instructions = s.instructions.trim()
    if (s.outputVariable.trim()) config.outputVariable = s.outputVariable.trim()
    return Object.keys(config).length > 0 ? JSON.stringify(config) : undefined
  }

  const handleSave = async () => {
    if (!name.trim() || steps.some((s) => !s.title.trim())) return
    setSaving(true)
    try {
      const stepData = steps.map((s) => ({
        title: s.title.trim(),
        description: s.description.trim() || undefined,
        assignedAgentId: s.assignedAgentId || undefined,
        gate: s.gate as 'auto' | 'approval',
        timeoutMinutes: s.timeoutMinutes ? parseInt(s.timeoutMinutes, 10) : undefined,
        config: buildStepConfig(s),
      }))

      if (isEditing) {
        // Update workflow metadata
        await engine.updateWorkflow(id, {
          name: name.trim(),
          description: description.trim(),
          triggerType,
          scheduleCron: triggerType === 'scheduled' ? scheduleCron : null,
          triggerTableId: (triggerType === 'row_added' || triggerType === 'row_updated') ? triggerTableId || null : null,
        })
        // Delete old steps and re-create (simplest approach for reorder)
        const existing = await engine.getWorkflow(id)
        for (const s of existing.steps) {
          await engine.deleteWorkflowStep(id, s.id)
        }
        for (const s of stepData) {
          await engine.addWorkflowStep(id, s)
        }
        navigate(`/workflows/${id}`)
      } else {
        const wf = await engine.createWorkflow({
          name: name.trim(),
          description: description.trim(),
          triggerType,
          scheduleCron: triggerType === 'scheduled' ? scheduleCron : undefined,
          triggerTableId: (triggerType === 'row_added' || triggerType === 'row_updated') ? triggerTableId || undefined : undefined,
          steps: stepData,
        })
        navigate(`/workflows/${wf.id}`)
      }
    } catch (err) {
      alert(`Failed to save: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
    setSaving(false)
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-text-muted">Loading...</div>
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <button onClick={() => navigate('/workflows')} className="mb-4 flex items-center gap-1 text-sm text-text-muted hover:text-text-main transition-colors">
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          Back to Workflows
        </button>
        <h1 className="text-2xl font-bold text-text-main">{isEditing ? 'Edit Workflow' : 'New Workflow'}</h1>
      </div>

      {/* Workflow metadata */}
      <div className="rounded-2xl border border-border-subtle bg-light-surface p-6 mb-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-main mb-1.5">Name</label>
            <input
              type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Weekly Content Pipeline"
              className="w-full rounded-lg border border-border-subtle bg-white px-3 py-2 text-sm focus:border-forest-green focus:outline-none focus:ring-1 focus:ring-forest-green"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-main mb-1.5">Description</label>
            <textarea
              value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this workflow accomplish?"
              rows={2}
              className="w-full rounded-lg border border-border-subtle bg-white px-3 py-2 text-sm focus:border-forest-green focus:outline-none focus:ring-1 focus:ring-forest-green resize-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-main mb-1.5">Trigger</label>
            <div className="flex gap-3">
              <button
                onClick={() => setTriggerType('manual')}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium border transition-colors ${
                  triggerType === 'manual' ? 'border-forest-green bg-forest-green/5 text-forest-green' : 'border-border-subtle text-text-secondary hover:border-forest-green/30'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">play_arrow</span>
                Manual
              </button>
              <button
                onClick={() => setTriggerType('scheduled')}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium border transition-colors ${
                  triggerType === 'scheduled' ? 'border-forest-green bg-forest-green/5 text-forest-green' : 'border-border-subtle text-text-secondary hover:border-forest-green/30'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">schedule</span>
                Scheduled
              </button>
              <button
                onClick={() => setTriggerType('row_added')}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium border transition-colors ${
                  triggerType === 'row_added' ? 'border-forest-green bg-forest-green/5 text-forest-green' : 'border-border-subtle text-text-secondary hover:border-forest-green/30'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">add_circle</span>
                Row Added
              </button>
              <button
                onClick={() => setTriggerType('row_updated')}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium border transition-colors ${
                  triggerType === 'row_updated' ? 'border-forest-green bg-forest-green/5 text-forest-green' : 'border-border-subtle text-text-secondary hover:border-forest-green/30'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">edit_note</span>
                Row Updated
              </button>
            </div>
            {triggerType === 'scheduled' && (
              <div className="mt-3">
                <input
                  type="text" value={scheduleCron} onChange={(e) => setScheduleCron(e.target.value)}
                  placeholder="daily:09:00 or weekly:monday:09:00"
                  className="w-full rounded-lg border border-border-subtle bg-white px-3 py-2 text-sm focus:border-forest-green focus:outline-none focus:ring-1 focus:ring-forest-green"
                />
                <p className="mt-1 text-xs text-text-muted">Format: daily:HH:MM or weekly:DAY:HH:MM</p>
              </div>
            )}
            {(triggerType === 'row_added' || triggerType === 'row_updated') && (
              <div className="mt-3">
                <label className="block text-xs font-medium text-text-muted mb-1">Data Table</label>
                <select
                  value={triggerTableId}
                  onChange={(e) => setTriggerTableId(e.target.value)}
                  className="w-full rounded-lg border border-border-subtle bg-white px-3 py-2 text-sm focus:border-forest-green focus:outline-none focus:ring-1 focus:ring-forest-green"
                >
                  <option value="">Select a table...</option>
                  {sorTables.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-text-muted">
                  {triggerType === 'row_added'
                    ? 'This workflow will run automatically when a new row is added to this table.'
                    : 'This workflow will run automatically when a row is updated in this table.'}
                  {' '}Use {'{{row.FieldName}}'} in step descriptions to reference row data.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Steps */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-text-main mb-4">Steps</h2>
        <div className="space-y-3">
          {steps.map((step, index) => {
            const assignedAgent = agents.find((a) => a.id === step.assignedAgentId)
            const assignedAgentSkills = step.assignedAgentId ? agentSkillsMap[step.assignedAgentId] ?? [] : []
            return (
            <div key={index} className="rounded-2xl border border-border-subtle bg-light-surface p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-forest-green text-xs font-bold text-white">
                    {index + 1}
                  </span>
                  <span className="text-sm font-medium text-text-muted">Step {index + 1}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => moveStep(index, -1)} disabled={index === 0}
                    className="rounded p-1 text-text-muted hover:text-text-main disabled:opacity-30 transition-colors">
                    <span className="material-symbols-outlined text-[16px]">arrow_upward</span>
                  </button>
                  <button onClick={() => moveStep(index, 1)} disabled={index === steps.length - 1}
                    className="rounded p-1 text-text-muted hover:text-text-main disabled:opacity-30 transition-colors">
                    <span className="material-symbols-outlined text-[16px]">arrow_downward</span>
                  </button>
                  <button onClick={() => removeStep(index)} disabled={steps.length <= 1}
                    className="rounded p-1 text-text-muted hover:text-red-600 disabled:opacity-30 transition-colors">
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                </div>
              </div>
              <div className="space-y-3">
                <input
                  type="text" value={step.title} onChange={(e) => updateStepField(index, 'title', e.target.value)}
                  placeholder="Step title"
                  className="w-full rounded-lg border border-border-subtle bg-white px-3 py-2 text-sm focus:border-forest-green focus:outline-none focus:ring-1 focus:ring-forest-green"
                />
                <textarea
                  value={step.description} onChange={(e) => updateStepField(index, 'description', e.target.value)}
                  placeholder="Step description (optional)"
                  rows={2}
                  className="w-full rounded-lg border border-border-subtle bg-white px-3 py-2 text-sm focus:border-forest-green focus:outline-none focus:ring-1 focus:ring-forest-green resize-none"
                />
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-text-muted mb-1">Assigned Agent</label>
                    <select
                      value={step.assignedAgentId} onChange={(e) => updateStepField(index, 'assignedAgentId', e.target.value)}
                      className="w-full rounded-lg border border-border-subtle bg-white px-3 py-2 text-sm focus:border-forest-green focus:outline-none focus:ring-1 focus:ring-forest-green"
                    >
                      <option value="">Unassigned</option>
                      {agents.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-muted mb-1">Gate</label>
                    <select
                      value={step.gate} onChange={(e) => updateStepField(index, 'gate', e.target.value)}
                      className="rounded-lg border border-border-subtle bg-white px-3 py-2 text-sm focus:border-forest-green focus:outline-none focus:ring-1 focus:ring-forest-green"
                    >
                      <option value="auto">Auto-proceed</option>
                      <option value="approval">Require Approval</option>
                    </select>
                  </div>
                  <div className="w-28">
                    <label className="block text-xs font-medium text-text-muted mb-1">Timeout (min)</label>
                    <input
                      type="number" min="1" value={step.timeoutMinutes}
                      onChange={(e) => updateStepField(index, 'timeoutMinutes', e.target.value)}
                      placeholder="--"
                      className="w-full rounded-lg border border-border-subtle bg-white px-3 py-2 text-sm focus:border-forest-green focus:outline-none focus:ring-1 focus:ring-forest-green"
                    />
                  </div>
                </div>

                {/* 5a: Agent model & skills info */}
                {assignedAgent ? (
                  <div className="flex items-center gap-3 rounded-lg bg-white/60 border border-border-subtle px-3 py-2">
                    <span
                      className="material-symbols-outlined text-[16px]"
                      style={{ color: assignedAgent.iconColor ?? '#0F4D26' }}
                    >
                      {assignedAgent.iconName ?? 'smart_toy'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs text-text-muted">Model:</span>{' '}
                      <span className="text-xs font-medium text-text-secondary">{assignedAgent.modelId}</span>
                      {assignedAgentSkills.length > 0 && (
                        <>
                          <span className="mx-2 text-text-muted">|</span>
                          <span className="text-xs text-text-muted">Skills:</span>{' '}
                          <span className="text-xs text-text-secondary">{assignedAgentSkills.map((sk) => sk.skillName).join(', ')}</span>
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-text-muted italic">Assign an agent to use its model & skills</p>
                )}

                {/* 5b: Per-step extra skills */}
                {allSkills.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-text-muted mb-1.5">Extra Skills</label>
                    <div className="flex flex-wrap gap-1.5">
                      {allSkills.map((sk) => {
                        const name = sk.metadata.name
                        const selected = step.skills.includes(name)
                        return (
                          <button
                            key={name}
                            type="button"
                            onClick={() => toggleStepSkill(index, name)}
                            className={`rounded-full px-2.5 py-1 text-xs font-medium border transition-colors ${
                              selected
                                ? 'border-forest-green bg-forest-green/10 text-forest-green'
                                : 'border-border-subtle text-text-muted hover:border-forest-green/30'
                            }`}
                          >
                            {name}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* 5c: Per-step instructions */}
                <div>
                  <label className="block text-xs font-medium text-text-muted mb-1">Step Instructions</label>
                  <textarea
                    value={step.instructions}
                    onChange={(e) => updateStepField(index, 'instructions', e.target.value)}
                    placeholder="Custom rules or instructions for this step (added to the agent's prompt)"
                    rows={2}
                    className="w-full rounded-lg border border-border-subtle bg-white px-3 py-2 text-xs focus:border-forest-green focus:outline-none focus:ring-1 focus:ring-forest-green resize-none"
                  />
                </div>

                {/* 5e: Output variable */}
                <div>
                  <label className="block text-xs font-medium text-text-muted mb-1">Output Variable</label>
                  <input
                    type="text" value={step.outputVariable}
                    onChange={(e) => updateStepField(index, 'outputVariable', e.target.value)}
                    placeholder="e.g., research_results (referenced as {{research_results}} in later steps)"
                    className="w-full rounded-lg border border-border-subtle bg-white px-3 py-2 text-xs focus:border-forest-green focus:outline-none focus:ring-1 focus:ring-forest-green"
                  />
                </div>
              </div>
            </div>
          )})}
        </div>
        <button
          onClick={addStep}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border-subtle py-3 text-sm font-medium text-text-muted hover:border-forest-green/30 hover:text-forest-green transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          Add Step
        </button>
      </div>

      {/* Save */}
      <div className="flex justify-end gap-3">
        <button onClick={() => navigate('/workflows')} className="rounded-xl px-5 py-2.5 text-sm font-medium text-text-secondary hover:text-text-main transition-colors">
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !name.trim() || steps.some((s) => !s.title.trim())}
          className="rounded-xl bg-forest-green px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-forest-green-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving...' : isEditing ? 'Update Workflow' : 'Create Workflow'}
        </button>
      </div>
    </div>
  )
}
