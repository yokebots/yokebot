import { useState, useEffect } from 'react'
import * as engine from '@/lib/engine'
import type { SorTable, SorRow, SorPermission, EngineAgent } from '@/lib/engine'

const statusStyle: Record<string, string> = {
  Qualified: 'bg-green-50 text-green-700',
  New: 'bg-blue-50 text-blue-700',
  Contacted: 'bg-amber-50 text-amber-700',
}

export function DataTablesPage() {
  const [tables, setTables] = useState<SorTable[]>([])
  const [activeTableId, setActiveTableId] = useState('')
  const [rows, setRows] = useState<SorRow[]>([])
  const [permissions, setPermissions] = useState<SorPermission[]>([])
  const [agents, setAgents] = useState<EngineAgent[]>([])
  const [showPermissions, setShowPermissions] = useState(true)
  const [newTableName, setNewTableName] = useState('')
  const [showNewTable, setShowNewTable] = useState(false)

  const loadTables = async () => {
    try {
      const [t, ag] = await Promise.all([engine.listSorTables(), engine.listAgents()])
      setTables(t)
      setAgents(ag)
      if (!activeTableId && t.length > 0) setActiveTableId(t[0].id)
    } catch { /* offline */ }
  }

  const loadRows = async () => {
    if (!activeTableId) return
    try {
      const [r, p] = await Promise.all([engine.listSorRows(activeTableId), engine.getSorPermissions(activeTableId)])
      setRows(r)
      setPermissions(p)
    } catch { /* offline */ }
  }

  useEffect(() => { loadTables() }, [])
  useEffect(() => { loadRows() }, [activeTableId])

  const handleCreateTable = async () => {
    if (!newTableName.trim()) return
    const t = await engine.createSorTable(newTableName.trim())
    setNewTableName('')
    setShowNewTable(false)
    await loadTables()
    setActiveTableId(t.id)
  }

  const handleDeleteRow = async (rowId: string) => {
    await engine.deleteSorRow(activeTableId, rowId)
    loadRows()
  }

  const handleTogglePermission = async (agentId: string, current: SorPermission | undefined) => {
    const canRead = true
    const canWrite = current?.canWrite ? false : true
    await engine.setSorPermission(activeTableId, agentId, canRead, canWrite)
    loadRows()
  }

  const activeTable = tables.find((t) => t.id === activeTableId)
  const columnNames = activeTable?.columns.map((c) => c.name) ?? []
  // Derive columns from row data if no explicit columns
  const dataColumns = columnNames.length > 0 ? columnNames
    : rows.length > 0 ? Object.keys(rows[0].data) : []

  return (
    <div>
      <div className="mb-2 text-sm text-text-muted">Home / Data Tables</div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-text-main">Source of Record</h1>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 rounded-lg border border-border-subtle bg-white px-4 py-2 text-sm font-medium text-text-secondary hover:bg-light-surface-alt">
            <span className="material-symbols-outlined text-[18px]">download</span>
            Export CSV
          </button>
          <button className="flex items-center gap-2 rounded-lg bg-forest-green px-4 py-2 text-sm font-medium text-white">
            <span className="material-symbols-outlined text-[18px]">add</span>
            Add Row
          </button>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Main Table */}
        <div className="flex-1 min-w-0">
          {/* Table Tabs */}
          <div className="mb-4 flex gap-1 border-b border-border-subtle">
            {tables.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTableId(t.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                  activeTableId === t.id
                    ? 'border-b-2 border-forest-green text-forest-green'
                    : 'text-text-muted hover:text-text-main'
                }`}
              >
                {t.name}
                <span className="rounded-full bg-light-surface-alt px-2 py-0.5 text-xs">{t.rowCount}</span>
              </button>
            ))}
            {showNewTable ? (
              <div className="flex items-center gap-1 px-2">
                <input
                  type="text"
                  value={newTableName}
                  onChange={(e) => setNewTableName(e.target.value)}
                  placeholder="Table name..."
                  className="w-32 rounded border border-border-subtle px-2 py-1 text-sm focus:border-forest-green focus:outline-none"
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateTable()}
                  autoFocus
                />
                <button onClick={handleCreateTable} className="text-forest-green">
                  <span className="material-symbols-outlined text-[18px]">check</span>
                </button>
                <button onClick={() => setShowNewTable(false)} className="text-text-muted">
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>
            ) : (
              <button onClick={() => setShowNewTable(true)} className="px-4 py-2.5 text-sm text-text-muted hover:text-forest-green">
                <span className="material-symbols-outlined text-[18px]">add</span>
              </button>
            )}
          </div>

          {tables.length === 0 && (
            <div className="rounded-lg border border-border-subtle bg-white p-12 text-center">
              <span className="material-symbols-outlined mb-2 text-4xl text-text-muted">table_chart</span>
              <p className="text-sm text-text-muted">No data tables yet. Create one to get started.</p>
            </div>
          )}

          {activeTable && (
            <>
              {/* Search */}
              <div className="mb-4">
                <input
                  type="text"
                  placeholder="Search records..."
                  className="w-full max-w-md rounded-lg border border-border-subtle px-4 py-2 text-sm focus:border-forest-green focus:outline-none"
                />
              </div>

              {/* Table */}
              <div className="overflow-hidden rounded-lg border border-border-subtle bg-white">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border-subtle bg-light-surface-alt/50">
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-text-muted">
                        <input type="checkbox" className="rounded" />
                      </th>
                      {dataColumns.map((col) => (
                        <th key={col} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-text-muted">{col}</th>
                      ))}
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-text-muted">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={row.id} className={`border-b border-border-subtle ${i % 2 === 1 ? 'bg-light-surface-alt/30' : ''} hover:bg-forest-green/5`}>
                        <td className="px-4 py-3"><input type="checkbox" className="rounded" /></td>
                        {dataColumns.map((col) => {
                          const val = String(row.data[col] ?? '')
                          const style = statusStyle[val]
                          return (
                            <td key={col} className="px-4 py-3 text-sm text-text-main">
                              {style ? (
                                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${style}`}>{val}</span>
                              ) : val}
                            </td>
                          )
                        })}
                        <td className="px-4 py-3">
                          <button onClick={() => handleDeleteRow(row.id)} className="text-text-muted hover:text-red-600">
                            <span className="material-symbols-outlined text-[16px]">delete</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={dataColumns.length + 2} className="px-4 py-8 text-center text-sm text-text-muted">
                          No rows yet. Add data via the API or have an agent populate it.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                <div className="flex items-center justify-between border-t border-border-subtle px-4 py-3">
                  <span className="text-xs text-text-muted">Showing {rows.length} row{rows.length !== 1 ? 's' : ''}</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Permissions Sidebar */}
        {showPermissions && activeTable && (
          <div className="w-72 shrink-0">
            <div className="rounded-lg border border-border-subtle bg-white p-4">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-bold text-text-main">Table Permissions</h3>
                <button onClick={() => setShowPermissions(false)} className="text-text-muted hover:text-text-main">
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>
              <p className="mb-4 text-xs text-text-muted">
                {activeTable.name} — Manage which AI agents can read or modify this dataset.
              </p>

              <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-text-muted">Agents</h4>
              <div className="space-y-3">
                {agents.map((agent) => {
                  const perm = permissions.find((p) => p.agentId === agent.id)
                  const canWrite = perm?.canWrite ?? false
                  return (
                    <div key={agent.id} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-text-main">{agent.name}</p>
                        <p className="text-xs text-text-muted">{canWrite ? 'Read & Write' : perm ? 'Read Only' : 'No Access'}</p>
                      </div>
                      <button
                        onClick={() => handleTogglePermission(agent.id, perm)}
                        className={`h-5 w-10 rounded-full ${canWrite ? 'bg-forest-green' : 'bg-gray-300'} relative`}
                      >
                        <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${canWrite ? 'left-5' : 'left-0.5'}`} />
                      </button>
                    </div>
                  )
                })}
                {agents.length === 0 && (
                  <p className="text-xs text-text-muted">No agents yet.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
