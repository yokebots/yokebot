import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router'
import * as engine from '@/lib/engine'

const TYPE_LABELS: Record<string, string> = {
  heartbeat_debit: 'AI Model Calls',
  media_debit: 'Media Generation',
  skill_debit: 'Skill Execution',
}

export function UsagePage() {
  const navigate = useNavigate()
  const [summary, setSummary] = useState<engine.UsageSummary | null>(null)
  const [transactions, setTransactions] = useState<engine.CreditTransaction[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      engine.getUsageSummary(),
      engine.getCreditTransactions(100),
    ]).then(([s, t]) => {
      setSummary(s)
      setTransactions(t)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4">
        <p className="text-text-muted">Loading usage data...</p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/settings/billing')} className="rounded p-1 text-text-muted hover:bg-light-surface-alt">
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>
        </button>
        <div>
          <h1 className="text-xl font-bold text-text-main">Credit Usage</h1>
          <p className="text-sm text-text-muted">
            {summary ? `${summary.totalSpent.toLocaleString()} credits spent across ${summary.totalTransactions.toLocaleString()} operations` : ''}
          </p>
        </div>
      </div>

      {/* Usage by Type */}
      {summary && summary.byType.length > 0 && (
        <div className="rounded-xl border border-border-subtle bg-white p-5">
          <h2 className="text-sm font-bold text-text-main mb-3">Usage by Category</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {summary.byType.map(t => (
              <div key={t.type} className="rounded-lg bg-light-surface-alt p-4">
                <p className="text-xs text-text-muted font-medium uppercase tracking-wider">
                  {TYPE_LABELS[t.type] ?? t.type.replace(/_/g, ' ')}
                </p>
                <p className="text-2xl font-bold text-text-main mt-1">{t.credits.toLocaleString()}</p>
                <p className="text-xs text-text-muted">{t.calls.toLocaleString()} calls</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Usage by Model */}
      {summary && summary.byModel.length > 0 && (
        <div className="rounded-xl border border-border-subtle bg-white p-5">
          <h2 className="text-sm font-bold text-text-main mb-3">Usage by Model / Skill</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle">
                <th className="text-left py-2 px-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Model</th>
                <th className="text-right py-2 px-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Credits</th>
                <th className="text-right py-2 px-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Calls</th>
                <th className="text-right py-2 px-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Avg / Call</th>
              </tr>
            </thead>
            <tbody>
              {summary.byModel.map(m => (
                <tr key={m.model} className="border-b border-border-subtle/50 hover:bg-light-surface-alt/50">
                  <td className="py-2 px-3 text-text-main font-medium">{m.model}</td>
                  <td className="py-2 px-3 text-right font-mono text-text-main">{m.credits.toLocaleString()}</td>
                  <td className="py-2 px-3 text-right text-text-muted">{m.calls.toLocaleString()}</td>
                  <td className="py-2 px-3 text-right text-text-muted">{(m.credits / m.calls).toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Recent Transactions */}
      <div className="rounded-xl border border-border-subtle bg-white p-5">
        <h2 className="text-sm font-bold text-text-main mb-3">Recent Transactions</h2>
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-border-subtle">
                <th className="text-left py-2 px-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Description</th>
                <th className="text-right py-2 px-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Credits</th>
                <th className="text-right py-2 px-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Balance</th>
                <th className="text-right py-2 px-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Date</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map(tx => (
                <tr key={tx.id} className="border-b border-border-subtle/50 hover:bg-light-surface-alt/50">
                  <td className="py-1.5 px-3 text-text-main truncate max-w-[300px]">{tx.description}</td>
                  <td className={`py-1.5 px-3 text-right font-mono ${tx.amount > 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {tx.amount > 0 ? '+' : ''}{tx.amount.toLocaleString()}
                  </td>
                  <td className="py-1.5 px-3 text-right font-mono text-text-muted">{tx.balanceAfter.toLocaleString()}</td>
                  <td className="py-1.5 px-3 text-right text-text-muted whitespace-nowrap">
                    {new Date(tx.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
