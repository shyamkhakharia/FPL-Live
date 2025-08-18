export default function LeagueTable({ table, mode }) {
  if (!table) return null
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left border-b border-white/10">
            <th className="py-2 pr-3">#</th>
            <th className="py-2 pr-3">Manager</th>
            <th className="py-2 pr-3">Team</th>
            <th className="py-2 pr-3">Live GW</th>
            <th className="py-2 pr-3">Total</th>
            <th className="py-2 pr-3">Δ Avg</th>
          </tr>
        </thead>
        <tbody>
          {table.map((r, i) => (
            <tr key={r.entry} className="border-b border-white/5">
              <td className="py-2 pr-3">{r.live_rank || i+1}</td>
              <td className="py-2 pr-3">{r.player_name}</td>
              <td className="py-2 pr-3">{r.entry_name}</td>
              <td className="py-2 pr-3">{r.live_gw ?? r.event_total}</td>
              <td className="py-2 pr-3">{r.total}</td>
              <td className="py-2 pr-3">{r.diff_vs_avg ? Math.round(r.diff_vs_avg) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {mode === 'fast' && (
        <div className="mt-2 text-xs opacity-70">Performance mode: showing FPL snapshot (not fully live). Use “Full” for smaller leagues.</div>
      )}
    </div>
  )
}
