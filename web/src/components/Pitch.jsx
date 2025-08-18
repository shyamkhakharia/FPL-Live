import PlayerCard from './PlayerCard'

export default function Pitch({ team, elementsIndex }) {
  if (!team || !team.length) return null
  const starters = team.filter(s => s.position <= 11)
  const bench = team.filter(s => s.on_bench)

  const row = (players) => (
    <div className="grid grid-cols-4 gap-3">
      {players.map(p => <PlayerCard key={p.position} p={p} lookup={elementsIndex} />)}
    </div>
  )

  const gk = starters.filter(p => p.type === 'GK')
  const defs = starters.filter(p => p.type === 'DEF')
  const mids = starters.filter(p => p.type === 'MID')
  const fwds = starters.filter(p => p.type === 'FWD')

  return (
    <div className="rounded-2xl p-4 pitch bg-pitch/60 border border-white/10">
      <div className="space-y-4">
        {row(gk)}
        {row(defs)}
        {row(mids)}
        {row(fwds)}
      </div>
      <div className="mt-4">
        <div className="text-xs uppercase tracking-widest opacity-70 mb-2">Bench</div>
        <div className="grid grid-cols-4 gap-3">
          {bench.map(p => <PlayerCard key={p.position} p={p} lookup={elementsIndex} />)}
        </div>
      </div>
    </div>
  )
}
