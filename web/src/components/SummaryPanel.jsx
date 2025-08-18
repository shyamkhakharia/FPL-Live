export default function SummaryPanel({ summary, live }) {
  if (!summary) return null
  const trend = live?.live_trend || 'flat'
  const arrow = trend === 'up' ? '▲' : trend === 'down' ? '▼' : '■'
  const arrowColor = trend === 'up' ? 'text-positive' : trend === 'down' ? 'text-negative' : 'text-slate-400'
  const transferCost = summary?.picks?.entry_history?.event_transfers_cost ?? summary?.event_transfers_cost

  return (
    <div className="grid md:grid-cols-4 gap-3">
      <div className="p-4 rounded-2xl bg-slate-900/60">
        <div className="text-sm opacity-70">Overall Rank</div>
        <div className="text-2xl font-semibold">{summary.overall_rank?.toLocaleString?.() ?? '—'}</div>
      </div>
      <div className="p-4 rounded-2xl bg-slate-900/60">
        <div className="text-sm opacity-70">Live GW</div>
        <div className="text-2xl font-semibold">{live?.totals?.overall ?? '—'}</div>
      </div>
      <div className="p-4 rounded-2xl bg-slate-900/60">
        <div className="text-sm opacity-70">Vs Avg</div>
        <div className={`text-2xl font-semibold ${arrowColor}`}>{arrow} {live?.diff_vs_average ?? '—'}</div>
      </div>
      <div className="p-4 rounded-2xl bg-slate-900/60">
        <div className="text-sm opacity-70">Transfer Costs</div>
        <div className="text-2xl font-semibold">{transferCost ? `-${transferCost}` : 0}</div>
      </div>
    </div>
  )
}
