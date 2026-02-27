import { useState } from 'react'

// Source of Record — placeholder with mock data until SoR engine endpoints are built
const MOCK_TABLES = [
  { id: '1', name: 'Cincinnati Leads', count: 142 },
  { id: '2', name: 'Cleaning Jobs', count: 89 },
  { id: '3', name: 'Inventory', count: 34 },
]

const MOCK_ROWS = [
  { id: '#00142', name: 'Alice Smith', email: 'alice.smith@techcorp.com', company: 'TechCorp Inc.', status: 'Qualified' },
  { id: '#00143', name: 'Bob Porter', email: 'bporter@logistics.net', company: 'Logistics Net', status: 'New' },
  { id: '#00144', name: 'Clara Lane', email: 'clara.lane@design.io', company: 'Design IO', status: 'Contacted' },
  { id: '#00145', name: 'David Kim', email: 'd.kim@startuplab.co', company: 'Startup Lab', status: 'Qualified' },
  { id: '#00146', name: 'Elena Perez', email: 'elena@fintech.org', company: 'Fintech Org', status: 'New' },
]

const MOCK_AGENTS = [
  { name: 'Outbound Sales Bot', access: 'Read & Write' },
  { name: 'Support Assistant', access: 'Read Only' },
  { name: 'Data Cleaner', access: 'Read & Write' },
  { name: 'Analytics Engine', access: 'Read Only' },
]

const statusStyle: Record<string, string> = {
  Qualified: 'bg-green-50 text-green-700',
  New: 'bg-blue-50 text-blue-700',
  Contacted: 'bg-amber-50 text-amber-700',
}

export function DataTablesPage() {
  const [activeTable, setActiveTable] = useState('1')
  const [showPermissions, setShowPermissions] = useState(true)

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
            {MOCK_TABLES.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTable(t.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                  activeTable === t.id
                    ? 'border-b-2 border-forest-green text-forest-green'
                    : 'text-text-muted hover:text-text-main'
                }`}
              >
                {t.name}
                <span className="rounded-full bg-light-surface-alt px-2 py-0.5 text-xs">{t.count}</span>
              </button>
            ))}
            <button className="px-4 py-2.5 text-sm text-text-muted hover:text-forest-green">
              <span className="material-symbols-outlined text-[18px]">add</span>
            </button>
          </div>

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
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-text-muted">ID</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-text-muted">Contact Name</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-text-muted">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-text-muted">Company</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-text-muted">Status</th>
                </tr>
              </thead>
              <tbody>
                {MOCK_ROWS.map((row, i) => (
                  <tr key={row.id} className={`border-b border-border-subtle ${i % 2 === 1 ? 'bg-light-surface-alt/30' : ''} hover:bg-forest-green/5 cursor-pointer`}>
                    <td className="px-4 py-3"><input type="checkbox" className="rounded" /></td>
                    <td className="px-4 py-3 font-mono text-sm text-text-muted">{row.id}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-forest-green/10 text-xs font-bold text-forest-green">
                          {row.name.split(' ').map(n => n[0]).join('')}
                        </div>
                        <span className="text-sm font-medium text-text-main">{row.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-text-muted">{row.email}</td>
                    <td className="px-4 py-3 text-sm text-text-muted">{row.company}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusStyle[row.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center justify-between border-t border-border-subtle px-4 py-3">
              <span className="text-xs text-text-muted">Showing 1 to 5 of 142 results</span>
              <div className="flex gap-2">
                <button className="rounded border border-border-subtle px-3 py-1 text-xs text-text-muted">&lt;</button>
                <button className="rounded border border-border-subtle px-3 py-1 text-xs text-text-muted">&gt;</button>
              </div>
            </div>
          </div>
        </div>

        {/* Permissions Sidebar */}
        {showPermissions && (
          <div className="w-72 shrink-0">
            <div className="rounded-lg border border-border-subtle bg-white p-4">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-bold text-text-main">Table Permissions</h3>
                <button onClick={() => setShowPermissions(false)} className="text-text-muted hover:text-text-main">
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>
              <p className="mb-4 text-xs text-text-muted">
                {MOCK_TABLES.find((t) => t.id === activeTable)?.name} — Manage which AI agents can read or modify this dataset.
              </p>

              <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-text-muted">Active Agents</h4>
              <div className="space-y-3">
                {MOCK_AGENTS.map((agent) => (
                  <div key={agent.name} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-text-main">{agent.name}</p>
                      <p className="text-xs text-text-muted">{agent.access}</p>
                    </div>
                    <div className={`h-5 w-10 rounded-full ${agent.access.includes('Write') ? 'bg-forest-green' : 'bg-gray-300'} relative`}>
                      <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${agent.access.includes('Write') ? 'left-5' : 'left-0.5'}`} />
                    </div>
                  </div>
                ))}
              </div>

              <button className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-border-subtle px-3 py-2 text-sm text-text-secondary hover:bg-light-surface-alt">
                <span className="material-symbols-outlined text-[16px]">person_add</span>
                Grant New Access
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
