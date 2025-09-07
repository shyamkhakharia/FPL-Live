import { Chip } from '@mui/material'

export default function PlayerStatusBadge({ ps, onBench }: { ps:any, onBench?:boolean }) {
  if (!ps) return null
  const m = ps.minutes ?? 0
  let label = m > 0 ? `⏱ ${m}’` : 'DNP'
  if (ps.team_finished) {
    if (ps.status === 'subbed_off') label += ' • OFF'
    if (ps.status === 'played_full') label += ' • FT'
    if (ps.status === 'unused') label = 'Unused'
  }
  if (onBench && m > 0) label += ' • ⬆'
  return <Chip size="small" label={label} variant="outlined" sx={{ borderColor: 'divider' }} />
}
