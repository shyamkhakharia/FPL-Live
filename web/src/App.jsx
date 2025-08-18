import { useEffect, useMemo, useState } from 'react'
import { getBootstrap, getManager, getLiveManager, getLeague } from './lib/api'
import useAutoRefresh from './lib/useAutoRefresh'
import Pitch from './components/Pitch'
import SummaryPanel from './components/SummaryPanel'
import LeagueTable from './components/LeagueTable'

export default function App() {
  const [bootstrap, setBootstrap] = useState(null)
  const [managerId, setManagerId] = useState(localStorage.getItem('managerId') || '')
  const [inputId, setInputId] = useState(managerId)
  const [summary, setSummary] = useState(null)
  const [live, setLive] = useState(null)
  const [autosubs, setAutosubs] = useState(localStorage.getItem('autosubs') || 'on')
  const [tab, setTab] = useState('team')
  const [leagues, setLeagues] = useState([])
  const [selectedLeague, setSelectedLeague] = useState(null)
  const [leagueData, setLeagueData] = useState(null)
  const [mode, setMode] = useState('auto') // 'auto' | 'full' | 'fast'
  const [loading, setLoading] = useState(false)
  const [leagueLoading, setLeagueLoading] = useState(false)

  useEffect(() => { (async () => setBootstrap(await getBootstrap()))() }, [])

  const elementsIndex = useMemo(() => {
    const idx = {}
    bootstrap?.bootstrap?.elements?.forEach(e => idx[e.id] = e)
    return idx
  }, [bootstrap])

  async function loadManager(id) {
    setLoading(true)
    try {
      const base = await getManager(id)
      setSummary({ ...base.summary, picks: base.picks })
      setLeagues(base.leagues.classic)
      const l = await getLiveManager(id, autosubs)
      setLive(l)
    } finally {
      setLoading(false)
    }
  }

  async function refreshLive() {
    if (!managerId) return
    try {
      const l = await getLiveManager(managerId, autosubs)
      setLive(l)
    } catch {}
  }

  useAutoRefresh(refreshLive, 30000, [managerId, autosubs])

  const onSubmit = async (e) => {
    e.preventDefault()
    if (!inputId) return
    localStorage.setItem('managerId', inputId)
    setManagerId(inputId)
    await loadManager(inputId)
  }

  useEffect(() => { if (managerId) loadManager(managerId) }, []) // initial load

  async function loadLeague(lid) {
    setLeagueLoading(true)
    try {
      setSelectedLeague(lid)
      setLeagueData(await getLeague(lid, mode))
    } finally {
      setLeagueLoading(false)
    }
  }

  useEffect(() => { if (selectedLeague) loadLeague(selectedLeague) }, [mode])

  function onToggleAutosubs(next) {
    const val = next ? 'on' : 'off'
    setAutosubs(val)
    localStorage.setItem('autosubs', val)
    if (managerId) refreshLive()
  }

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">FPL-Live</h1>
        <form onSubmit={onSubmit} className="flex items-center gap-2">
          <input
            value={inputId}
            onChange={e=>setInputId(e.target.value)}
            placeholder="Enter FPL Manager ID"
            inputMode="numeric"
            className="px-3 py-2 rounded-xl bg-slate-800 border border-white/10 outline-none"
          />
          <button className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50" disabled={!inputId || loading}>
            {loading ? 'Loading…' : 'Load'}
          </button>
        </form>
      </header>

      <nav className="flex flex-col md:flex-row gap-2 items-start md:items-center">
        <div className="flex gap-2">
          <button onClick={()=>setTab('team')} className={`px-3 py-2 rounded-xl ${tab==='team'?'bg-slate-800':'bg-slate-900'}`}>My Team</button>
          <button onClick={()=>setTab('leagues')} className={`px-3 py-2 rounded-xl ${tab==='leagues'?'bg-slate-800':'bg-slate-900'}`}>Leagues</button>
        </div>
        <div className="md:ml-auto flex items-center gap-3">
          <label className="text-sm opacity-80">Auto-subs projection</label>
          <button
            onClick={()=>onToggleAutosubs(autosubs==='off')}
            className={`text-xs px-2 py-1 rounded-lg border ${autosubs==='on'?'bg-emerald-600/20 border-emerald-600/50':'bg-slate-800 border-white/10'}`}
            title="Toggle projected formation-aware autosubs"
          >
            {autosubs === 'on' ? 'On' : 'Off'}
          </button>
          {tab === 'leagues' && (
            <>
              <div className="h-4 w-px bg-white/10" />
              <span className="text-sm opacity-80">League mode</span>
              {['auto','full','fast'].map(m => (
                <button key={m}
                  onClick={()=>setMode(m)}
                  className={`text-xs px-2 py-1 rounded-lg border ${mode===m?'bg-sky-600/20 border-sky-600/50':'bg-slate-800 border-white/10'}`}
                  title={m==='full'?'Live compute for every member (best for ≤75)':
                         m==='fast'?'Snapshot from FPL (instant, not fully live)':
                         'Auto pick based on league size'}
                >
                  {m}
                </button>
              ))}
            </>
          )}
        </div>
      </nav>

      {tab === 'team' && (
        <section className="space-y-4">
          <SummaryPanel summary={summary} live={live} />
          <div className="flex items-center justify-between">
            <div className="text-sm opacity-70">
              {summary ? `${summary.player_first_name} ${summary.player_last_name} — ${summary.name}` : '—'}
            </div>
            <div className="text-sm opacity-70">
              Live Avg: {live?.live_average ?? '—'} · Diff: {live?.diff_vs_average ?? '—'}
            </div>
          </div>
          <Pitch team={live?.team} elementsIndex={elementsIndex} />
        </section>
      )}

      {tab === 'leagues' && (
        <section className="grid md:grid-cols-4 gap-4">
          <aside className="md:col-span-1 space-y-2">
            <div className="text-sm opacity-70">Your Leagues</div>
            {(leagues || []).map(l => (
              <button key={l.id}
                onClick={()=>loadLeague(l.id)}
                className={`w-full text-left px-3 py-2 rounded-xl border ${selectedLeague===l.id?'border-sky-600 bg-sky-900/20':'border-white/10 bg-slate-900/60'}`}>
                <div className="font-medium truncate">{l.name}</div>
                <div className="text-xs opacity-70">Rank: {l.entry_rank} / {selectedLeague===l.id ? (leagueData?.totalMembers ?? '—') : '—'}</div>
              </button>
            ))}
          </aside>
          <main className="md:col-span-3 space-y-3">
            {!selectedLeague && <div className="opacity-70">Select a league to view the live table.</div>}
            {selectedLeague && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-lg font-semibold">{leagueData?.league?.name || 'League'}</div>
                  <div className="text-xs opacity-70">
                    Mode: {leagueData?.mode || mode}{leagueLoading?' — Loading…':''}
                  </div>
                </div>
                <LeagueTable table={leagueData?.table} mode={leagueData?.mode} />
              </div>
            )}
          </main>
        </section>
      )}
    </div>
  )
}
