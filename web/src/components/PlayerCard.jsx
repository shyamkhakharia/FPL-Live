export default function PlayerCard({ p, lookup }) {
  const info = lookup?.[p.element] || {}
  const name = info.web_name || p.name || `#${p.element}`
  const chip = p.is_captain ? (p.multiplier === 3 ? 'TC' : 'C') : p.is_vice_captain ? 'VC' : ''
  const badge = chip ? (
    <span className="absolute -top-2 -right-2 text-[10px] bg-purple-700 px-1 py-0.5 rounded">
      {chip}
    </span>
  ) : null

  const pos = p.type
  const band = p.on_bench ? 'border-slate-500' : pos === 'GK' ? 'border-amber-500' : pos === 'DEF' ? 'border-cyan-400' : pos === 'MID' ? 'border-emerald-400' : 'border-pink-400'

  return (
    <div className={`relative p-2 rounded-xl border ${band} bg-slate-900/50 backdrop-blur-sm`}>
      {badge}
      <div className="text-sm font-medium truncate">{name}</div>
      <div className="text-xs opacity-70">{p.team_short} · {pos}</div>
      <div className="mt-1 text-sm">{p.events?.join(' · ')}</div>
      <div className="mt-1 text-xs opacity-70">x{p.multiplier} = <span className="font-semibold">{p.total}</span> pts</div>
    </div>
  )
}
