import { useState, useEffect, useRef } from 'react'
import * as engine from '@/lib/engine'
import type { SorTable, SorRow, SorPermission, EngineAgent, Workflow } from '@/lib/engine'

const statusStyle: Record<string, string> = {
  Qualified: 'bg-green-50 text-green-700',
  New: 'bg-blue-50 text-blue-700',
  Contacted: 'bg-amber-50 text-amber-700',
  Active: 'bg-green-50 text-green-700',
  Inactive: 'bg-gray-100 text-gray-600',
  Lead: 'bg-purple-50 text-purple-700',
  Customer: 'bg-green-50 text-green-700',
  Canceled: 'bg-red-50 text-red-700',
}

export function DataTablesPage() {
  const [tables, setTables] = useState<SorTable[]>([])
  const [activeTableId, setActiveTableId] = useState('')
  const [rows, setRows] = useState<SorRow[]>([])
  const [permissions, setPermissions] = useState<SorPermission[]>([])
  const [agents, setAgents] = useState<EngineAgent[]>([])
  const [showPermissions, setShowPermissions] = useState(true)

  // Table creation with columns
  const [showNewTable, setShowNewTable] = useState(false)
  const [newTableName, setNewTableName] = useState('')
  const [newTableColumns, setNewTableColumns] = useState<Array<{ name: string; colType: string }>>([])
  const [newColName, setNewColName] = useState('')

  // Add row
  const [showAddRow, setShowAddRow] = useState(false)
  const [newRowData, setNewRowData] = useState<Record<string, string>>({})

  // Add column to existing table
  const [showAddColumn, setShowAddColumn] = useState(false)
  const [addColumnName, setAddColumnName] = useState('')

  // Inline editing
  const [editingCell, setEditingCell] = useState<{ rowId: string; col: string } | null>(null)
  const [editCellValue, setEditCellValue] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)

  // Workflows
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [showWorkflowPicker, setShowWorkflowPicker] = useState<{ rowId: string; rowData: Record<string, unknown> } | null>(null)

  // CSV Import
  const [showCsvImport, setShowCsvImport] = useState(false)
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [csvRows, setCsvRows] = useState<string[][]>([])
  const [csvMapping, setCsvMapping] = useState<Record<string, string>>({}) // csvHeader → tableColumn
  const [csvImporting, setCsvImporting] = useState(false)
  const [csvImportTarget, setCsvImportTarget] = useState<'existing' | 'new'>('existing')
  const [csvNewTableName, setCsvNewTableName] = useState('')
  const csvFileRef = useRef<HTMLInputElement>(null)

  // Search
  const [searchQuery, setSearchQuery] = useState('')

  const loadTables = async () => {
    try {
      const [t, ag, wf] = await Promise.all([engine.listSorTables(), engine.listAgents(), engine.listWorkflows()])
      setTables(t)
      setAgents(ag)
      setWorkflows(wf)
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

  // Focus edit input when editing a cell
  useEffect(() => {
    if (editingCell && editInputRef.current) editInputRef.current.focus()
  }, [editingCell])

  // ---- Table creation ----

  const handleAddColumnToNewTable = () => {
    const name = newColName.trim()
    if (!name) return
    if (newTableColumns.some((c) => c.name.toLowerCase() === name.toLowerCase())) return
    setNewTableColumns([...newTableColumns, { name, colType: 'text' }])
    setNewColName('')
  }

  const handleRemoveNewTableColumn = (idx: number) => {
    setNewTableColumns(newTableColumns.filter((_, i) => i !== idx))
  }

  const handleCreateTable = async () => {
    if (!newTableName.trim()) return
    if (newTableColumns.length === 0) return
    const t = await engine.createSorTable(newTableName.trim(), newTableColumns)
    setNewTableName('')
    setNewTableColumns([])
    setShowNewTable(false)
    await loadTables()
    setActiveTableId(t.id)
  }

  // ---- Add column to existing table ----

  const handleAddColumnToTable = async () => {
    const name = addColumnName.trim()
    if (!name || !activeTableId) return
    await engine.addSorColumn(activeTableId, name)
    setAddColumnName('')
    setShowAddColumn(false)
    await loadTables()
  }

  // ---- Row operations ----

  const handleAddRow = async () => {
    if (!activeTableId) return
    const filtered = Object.fromEntries(Object.entries(newRowData).filter(([, v]) => v.trim()))
    if (Object.keys(filtered).length === 0) return
    await engine.addSorRow(activeTableId, filtered)
    setShowAddRow(false)
    setNewRowData({})
    loadRows()
  }

  const handleDeleteRow = async (rowId: string) => {
    await engine.deleteSorRow(activeTableId, rowId)
    loadRows()
  }

  const handleCellEdit = async (rowId: string, col: string) => {
    const row = rows.find((r) => r.id === rowId)
    if (!row) return
    const newData = { ...row.data, [col]: editCellValue }
    await engine.updateSorRow(activeTableId, rowId, newData)
    setEditingCell(null)
    setEditCellValue('')
    loadRows()
  }

  const startCellEdit = (rowId: string, col: string, currentValue: string) => {
    setEditingCell({ rowId, col })
    setEditCellValue(currentValue)
  }

  // ---- CSV Import ----

  const handleCsvFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = reader.result as string
      const lines = text.split(/\r?\n/).filter((l) => l.trim())
      if (lines.length < 2) return
      // Simple CSV parse (handles quoted fields)
      const parseLine = (line: string): string[] => {
        const result: string[] = []
        let current = ''
        let inQuotes = false
        for (let i = 0; i < line.length; i++) {
          const ch = line[i]
          if (ch === '"') { inQuotes = !inQuotes; continue }
          if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue }
          current += ch
        }
        result.push(current.trim())
        return result
      }
      const headers = parseLine(lines[0])
      const rows = lines.slice(1).map(parseLine)
      setCsvHeaders(headers)
      setCsvRows(rows)
      // Auto-map: match CSV headers to existing table columns by name
      const mapping: Record<string, string> = {}
      for (const h of headers) {
        const match = dataColumns.find((c) => c.toLowerCase() === h.toLowerCase())
        if (match) mapping[h] = match
        else mapping[h] = h // Default: create new column with same name
      }
      setCsvMapping(mapping)
      setCsvImportTarget(activeTable ? 'existing' : 'new')
      setCsvNewTableName('')
      setShowCsvImport(true)
    }
    reader.readAsText(file)
    e.target.value = '' // Reset for re-select
  }

  const handleCsvImport = async () => {
    setCsvImporting(true)
    try {
      let tableId = activeTableId

      if (csvImportTarget === 'new') {
        // Create new table with mapped column names
        const colNames = [...new Set(Object.values(csvMapping).filter((v) => v.trim()))]
        const newTable = await engine.createSorTable(
          csvNewTableName.trim() || 'Imported Data',
          colNames.map((n) => ({ name: n, colType: 'text' })),
        )
        tableId = newTable.id
      } else {
        // Add any new columns that don't exist yet
        const existingCols = new Set(dataColumns.map((c) => c.toLowerCase()))
        const newCols = [...new Set(Object.values(csvMapping).filter((v) => v.trim()))]
          .filter((c) => !existingCols.has(c.toLowerCase()))
        for (const col of newCols) {
          await engine.addSorColumn(tableId, col)
        }
      }

      // Add rows in batches of 10
      for (let i = 0; i < csvRows.length; i += 10) {
        const batch = csvRows.slice(i, i + 10)
        await Promise.all(batch.map((row) => {
          const data: Record<string, string> = {}
          csvHeaders.forEach((h, idx) => {
            const target = csvMapping[h]
            if (target && row[idx]) data[target] = row[idx]
          })
          return Object.keys(data).length > 0 ? engine.addSorRow(tableId, data) : Promise.resolve()
        }))
      }

      setShowCsvImport(false)
      setCsvHeaders([])
      setCsvRows([])
      setCsvMapping({})
      await loadTables()
      setActiveTableId(tableId)
      loadRows()
    } catch (err) {
      alert(`Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
    setCsvImporting(false)
  }

  const handleRunWorkflowOnRow = async (workflowId: string) => {
    if (!showWorkflowPicker || !activeTable) return
    const { rowData } = showWorkflowPicker
    await engine.startWorkflowRun(workflowId, {
      tableName: activeTable.name,
      tableId: activeTable.id,
      row: rowData,
    })
    setShowWorkflowPicker(null)
  }

  // ---- Permissions ----

  const handleTogglePermission = async (agentId: string, current: SorPermission | undefined) => {
    const canRead = true
    const canWrite = current?.canWrite ? false : true
    await engine.setSorPermission(activeTableId, agentId, canRead, canWrite)
    loadRows()
  }

  // ---- Derived ----

  const activeTable = tables.find((t) => t.id === activeTableId)
  const columnNames = activeTable?.columns.map((c) => c.name) ?? []
  const dataColumns = columnNames.length > 0 ? columnNames
    : rows.length > 0 ? Object.keys(rows[0].data) : []

  const filteredRows = searchQuery
    ? rows.filter((row) =>
        dataColumns.some((col) =>
          String(row.data[col] ?? '').toLowerCase().includes(searchQuery.toLowerCase())
        )
      )
    : rows

  // ---- Render ----

  return (
    <div>
      <div className="mb-2 text-sm text-text-muted">Home / Data Tables</div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-text-main">Data Tables</h1>
        <div className="flex gap-2">
          <input
            ref={csvFileRef}
            type="file"
            accept=".csv"
            onChange={handleCsvFileSelect}
            className="hidden"
          />
          <button
            onClick={() => csvFileRef.current?.click()}
            className="flex items-center gap-2 rounded-lg border border-border-subtle bg-white px-4 py-2 text-sm font-medium text-text-secondary hover:bg-light-surface-alt"
          >
            <span className="material-symbols-outlined text-[18px]">upload_file</span>
            Import CSV
          </button>
          {activeTable && (
            <button
              onClick={() => setShowAddColumn(true)}
              className="flex items-center gap-2 rounded-lg border border-border-subtle bg-white px-4 py-2 text-sm font-medium text-text-secondary hover:bg-light-surface-alt"
            >
              <span className="material-symbols-outlined text-[18px]">view_column</span>
              Add Field
            </button>
          )}
          <button
            onClick={() => { setShowAddRow(true); setNewRowData({}) }}
            disabled={!activeTable || dataColumns.length === 0}
            className="flex items-center gap-2 rounded-lg bg-forest-green px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            Add Row
          </button>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Main Table */}
        <div className="flex-1 min-w-0">
          {/* Table Tabs */}
          <div className="mb-4 flex flex-wrap gap-1 border-b border-border-subtle">
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
            <button
              onClick={() => { setShowNewTable(true); setNewTableName(''); setNewTableColumns([]); setNewColName('') }}
              className="px-4 py-2.5 text-sm text-text-muted hover:text-forest-green"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
            </button>
          </div>

          {/* New Table Creation Panel */}
          {showNewTable && (
            <div className="mb-6 rounded-xl border border-forest-green/30 bg-forest-green/5 p-5">
              <h3 className="text-sm font-bold text-text-main mb-3">Create New Table</h3>

              <div className="mb-4">
                <label className="block text-xs font-medium text-text-muted mb-1">Table Name</label>
                <input
                  type="text"
                  value={newTableName}
                  onChange={(e) => setNewTableName(e.target.value)}
                  placeholder="e.g. Contacts, Leads, Customers..."
                  className="w-full max-w-sm rounded-lg border border-border-subtle px-3 py-2 text-sm focus:border-forest-green focus:outline-none"
                  autoFocus
                />
              </div>

              <div className="mb-4">
                <label className="block text-xs font-medium text-text-muted mb-1">Fields</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {newTableColumns.map((col, i) => (
                    <span key={i} className="inline-flex items-center gap-1 rounded-full bg-white border border-border-subtle px-3 py-1 text-sm">
                      {col.name}
                      <button onClick={() => handleRemoveNewTableColumn(i)} className="text-text-muted hover:text-red-500">
                        <span className="material-symbols-outlined text-[14px]">close</span>
                      </button>
                    </span>
                  ))}
                  {newTableColumns.length === 0 && (
                    <span className="text-xs text-text-muted">Add at least one field to create the table.</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newColName}
                    onChange={(e) => setNewColName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddColumnToNewTable()}
                    placeholder="Field name (e.g. Name, Email, Phone...)"
                    className="w-64 rounded-lg border border-border-subtle px-3 py-2 text-sm focus:border-forest-green focus:outline-none"
                  />
                  <button
                    onClick={handleAddColumnToNewTable}
                    disabled={!newColName.trim()}
                    className="rounded-lg bg-white border border-border-subtle px-3 py-2 text-sm text-text-secondary hover:bg-light-surface-alt disabled:opacity-40"
                  >
                    Add Field
                  </button>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleCreateTable}
                  disabled={!newTableName.trim() || newTableColumns.length === 0}
                  className="rounded-lg bg-forest-green px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                >
                  Create Table
                </button>
                <button
                  onClick={() => setShowNewTable(false)}
                  className="rounded-lg border border-border-subtle px-4 py-2 text-sm text-text-secondary"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Add Column Modal */}
          {showAddColumn && activeTable && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-forest-green/30 bg-forest-green/5 px-4 py-3">
              <span className="text-sm text-text-secondary">New field for {activeTable.name}:</span>
              <input
                type="text"
                value={addColumnName}
                onChange={(e) => setAddColumnName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddColumnToTable()
                  if (e.key === 'Escape') { setShowAddColumn(false); setAddColumnName('') }
                }}
                placeholder="Field name..."
                className="w-48 rounded border border-border-subtle px-2 py-1.5 text-sm focus:border-forest-green focus:outline-none"
                autoFocus
              />
              <button onClick={handleAddColumnToTable} disabled={!addColumnName.trim()} className="text-forest-green hover:text-green-700 disabled:opacity-40">
                <span className="material-symbols-outlined text-[18px]">check</span>
              </button>
              <button onClick={() => { setShowAddColumn(false); setAddColumnName('') }} className="text-text-muted hover:text-text-main">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
          )}

          {tables.length === 0 && !showNewTable && (
            <div className="rounded-lg border border-border-subtle bg-white p-12 text-center">
              <span className="material-symbols-outlined mb-2 text-4xl text-text-muted">table_chart</span>
              <p className="text-sm text-text-muted mb-3">No data tables yet.</p>
              <button
                onClick={() => { setShowNewTable(true); setNewTableName(''); setNewTableColumns([]) }}
                className="rounded-lg bg-forest-green px-4 py-2 text-sm font-medium text-white"
              >
                Create Your First Table
              </button>
            </div>
          )}

          {activeTable && (
            <>
              {/* Search */}
              <div className="mb-4">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search records..."
                  className="w-full max-w-md rounded-lg border border-border-subtle px-4 py-2 text-sm focus:border-forest-green focus:outline-none"
                />
              </div>

              {/* No columns defined yet */}
              {dataColumns.length === 0 && (
                <div className="rounded-lg border border-border-subtle bg-white p-8 text-center">
                  <span className="material-symbols-outlined mb-2 text-3xl text-text-muted">view_column</span>
                  <p className="text-sm text-text-muted mb-3">This table has no fields yet. Add fields to start entering data.</p>
                  <button
                    onClick={() => setShowAddColumn(true)}
                    className="rounded-lg bg-forest-green px-4 py-2 text-sm font-medium text-white"
                  >
                    Add First Field
                  </button>
                </div>
              )}

              {/* Table */}
              {dataColumns.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-border-subtle bg-white">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border-subtle bg-light-surface-alt/50">
                        <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-text-muted w-10">
                          <input type="checkbox" className="rounded" />
                        </th>
                        {dataColumns.map((col) => (
                          <th key={col} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-text-muted">{col}</th>
                        ))}
                        <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-text-muted w-20">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {showAddRow && (
                        <tr className="border-b border-forest-green/20 bg-forest-green/5">
                          <td className="px-4 py-2" />
                          {dataColumns.map((col, i) => (
                            <td key={col} className="px-4 py-2">
                              <input
                                type="text"
                                placeholder={col}
                                value={newRowData[col] ?? ''}
                                onChange={(e) => setNewRowData({ ...newRowData, [col]: e.target.value })}
                                onKeyDown={(e) => e.key === 'Enter' && handleAddRow()}
                                className="w-full rounded border border-border-subtle px-2 py-1.5 text-sm focus:border-forest-green focus:outline-none"
                                autoFocus={i === 0}
                              />
                            </td>
                          ))}
                          <td className="px-4 py-2">
                            <div className="flex gap-1">
                              <button onClick={handleAddRow} className="text-forest-green hover:text-green-700">
                                <span className="material-symbols-outlined text-[16px]">check</span>
                              </button>
                              <button onClick={() => setShowAddRow(false)} className="text-text-muted hover:text-red-600">
                                <span className="material-symbols-outlined text-[16px]">close</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                      {filteredRows.map((row, i) => (
                        <tr key={row.id} className={`border-b border-border-subtle ${i % 2 === 1 ? 'bg-light-surface-alt/30' : ''} hover:bg-forest-green/5`}>
                          <td className="px-4 py-3"><input type="checkbox" className="rounded" /></td>
                          {dataColumns.map((col) => {
                            const val = String(row.data[col] ?? '')
                            const style = statusStyle[val]
                            const isEditing = editingCell?.rowId === row.id && editingCell?.col === col
                            return (
                              <td
                                key={col}
                                className="px-4 py-3 text-sm text-text-main cursor-pointer"
                                onDoubleClick={() => startCellEdit(row.id, col, val)}
                              >
                                {isEditing ? (
                                  <input
                                    ref={editInputRef}
                                    type="text"
                                    value={editCellValue}
                                    onChange={(e) => setEditCellValue(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleCellEdit(row.id, col)
                                      if (e.key === 'Escape') setEditingCell(null)
                                    }}
                                    onBlur={() => handleCellEdit(row.id, col)}
                                    className="w-full rounded border border-forest-green px-1.5 py-0.5 text-sm focus:outline-none"
                                  />
                                ) : style ? (
                                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${style}`}>{val}</span>
                                ) : val}
                              </td>
                            )
                          })}
                          <td className="px-4 py-3">
                            <div className="flex gap-1 relative">
                              {workflows.length > 0 && (
                                <button
                                  onClick={() => setShowWorkflowPicker({ rowId: row.id, rowData: row.data })}
                                  title="Run workflow on this row"
                                  className="text-text-muted hover:text-forest-green"
                                >
                                  <span className="material-symbols-outlined text-[16px]">play_circle</span>
                                </button>
                              )}
                              <button onClick={() => handleDeleteRow(row.id)} className="text-text-muted hover:text-red-600">
                                <span className="material-symbols-outlined text-[16px]">delete</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filteredRows.length === 0 && !showAddRow && (
                        <tr>
                          <td colSpan={dataColumns.length + 2} className="px-4 py-8 text-center text-sm text-text-muted">
                            {searchQuery ? 'No matching records.' : 'No rows yet. Click "Add Row" to start entering data.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  <div className="flex items-center justify-between border-t border-border-subtle px-4 py-3">
                    <span className="text-xs text-text-muted">
                      {searchQuery
                        ? `${filteredRows.length} of ${rows.length} record${rows.length !== 1 ? 's' : ''}`
                        : `${rows.length} record${rows.length !== 1 ? 's' : ''}`}
                    </span>
                    <span className="text-xs text-text-muted">{dataColumns.length} field{dataColumns.length !== 1 ? 's' : ''}</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Permissions Sidebar */}
        {showPermissions && activeTable && (
          <div className="w-72 shrink-0">
            <div className="rounded-lg border border-border-subtle bg-white p-4">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-bold text-text-main">Agent Access</h3>
                <button onClick={() => setShowPermissions(false)} className="text-text-muted hover:text-text-main">
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>
              <p className="mb-4 text-xs text-text-muted">
                Control which agents can read or modify <strong>{activeTable.name}</strong>.
              </p>

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

      {/* CSV Import Modal */}
      {showCsvImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowCsvImport(false)}>
          <div className="w-[560px] max-h-[80vh] overflow-y-auto rounded-xl border border-border-subtle bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-text-main mb-1">Import CSV</h3>
            <p className="text-xs text-text-muted mb-4">{csvRows.length} rows, {csvHeaders.length} columns detected</p>

            {/* Import target */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-text-muted mb-2">Import into</label>
              <div className="flex gap-2">
                {activeTable && (
                  <button
                    onClick={() => setCsvImportTarget('existing')}
                    className={`rounded-lg px-3 py-2 text-sm border transition-colors ${
                      csvImportTarget === 'existing' ? 'border-forest-green bg-forest-green/5 text-forest-green' : 'border-border-subtle text-text-secondary'
                    }`}
                  >
                    {activeTable.name} (current)
                  </button>
                )}
                <button
                  onClick={() => setCsvImportTarget('new')}
                  className={`rounded-lg px-3 py-2 text-sm border transition-colors ${
                    csvImportTarget === 'new' ? 'border-forest-green bg-forest-green/5 text-forest-green' : 'border-border-subtle text-text-secondary'
                  }`}
                >
                  New Table
                </button>
              </div>
              {csvImportTarget === 'new' && (
                <input
                  type="text"
                  value={csvNewTableName}
                  onChange={(e) => setCsvNewTableName(e.target.value)}
                  placeholder="Table name..."
                  className="mt-2 w-full rounded-lg border border-border-subtle px-3 py-2 text-sm focus:border-forest-green focus:outline-none"
                />
              )}
            </div>

            {/* Column mapping */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-text-muted mb-2">Column Mapping</label>
              <div className="space-y-2">
                {csvHeaders.map((h) => (
                  <div key={h} className="flex items-center gap-3">
                    <span className="w-36 truncate text-sm text-text-secondary" title={h}>{h}</span>
                    <span className="material-symbols-outlined text-[14px] text-text-muted">arrow_forward</span>
                    <input
                      type="text"
                      value={csvMapping[h] ?? ''}
                      onChange={(e) => setCsvMapping({ ...csvMapping, [h]: e.target.value })}
                      placeholder="Column name in table"
                      className="flex-1 rounded border border-border-subtle px-2 py-1.5 text-sm focus:border-forest-green focus:outline-none"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Preview */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-text-muted mb-2">Preview (first 3 rows)</label>
              <div className="overflow-x-auto rounded border border-border-subtle">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-light-surface-alt/50">
                      {csvHeaders.map((h) => (
                        <th key={h} className="px-2 py-1.5 text-left font-medium text-text-muted">{csvMapping[h] || h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvRows.slice(0, 3).map((row, i) => (
                      <tr key={i} className="border-t border-border-subtle">
                        {csvHeaders.map((_h, j) => (
                          <td key={j} className="px-2 py-1.5 text-text-secondary truncate max-w-[120px]">{row[j] ?? ''}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowCsvImport(false)}
                className="rounded-lg border border-border-subtle px-4 py-2 text-sm text-text-secondary hover:bg-light-surface-alt"
              >
                Cancel
              </button>
              <button
                onClick={handleCsvImport}
                disabled={csvImporting || (csvImportTarget === 'new' && !csvNewTableName.trim())}
                className="rounded-lg bg-forest-green px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                {csvImporting ? `Importing ${csvRows.length} rows...` : `Import ${csvRows.length} Rows`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Workflow Picker Modal */}
      {showWorkflowPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowWorkflowPicker(null)}>
          <div className="w-96 rounded-xl border border-border-subtle bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-text-main mb-1">Run Workflow on Row</h3>
            <p className="text-xs text-text-muted mb-4">
              The row data will be available as {'{{row.FieldName}}'} in workflow step descriptions.
            </p>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {workflows.map((wf) => (
                <button
                  key={wf.id}
                  onClick={() => handleRunWorkflowOnRow(wf.id)}
                  className="flex w-full items-center gap-3 rounded-lg border border-border-subtle px-4 py-3 text-left hover:border-forest-green/30 hover:bg-forest-green/5 transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px] text-forest-green">play_circle</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-main truncate">{wf.name}</p>
                    {wf.description && <p className="text-xs text-text-muted truncate">{wf.description}</p>}
                  </div>
                  <span className="rounded-full bg-light-surface-alt px-2 py-0.5 text-xs text-text-muted">{wf.triggerType}</span>
                </button>
              ))}
              {workflows.length === 0 && (
                <p className="text-sm text-text-muted text-center py-4">No workflows created yet.</p>
              )}
            </div>
            <button
              onClick={() => setShowWorkflowPicker(null)}
              className="mt-4 w-full rounded-lg border border-border-subtle py-2 text-sm text-text-secondary hover:bg-light-surface-alt"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
