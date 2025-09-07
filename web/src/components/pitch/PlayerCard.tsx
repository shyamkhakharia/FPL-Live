import { Card, CardContent, Stack, Typography } from '@mui/material'
import PlayerStatusBadge from './PlayerStatusBadge'

export default function PlayerCard({ slot }: { slot:any }) {
  const { name, team_short, type, total, projected_points, is_captain, is_vice_captain, multiplier, events = [], on_bench, play_state, bps } = slot
  const points = typeof total === 'number' ? total : (projected_points ?? 0)
  const dim = play_state?.status === 'subbed_off'
  const ribbon = is_captain ? (multiplier === 3 ? 'TC' : 'C') : (is_vice_captain ? 'VC' : null)

  return (
    <Card variant="outlined" sx={{ opacity: dim ? 0.7 : 1, position: 'relative' }}>
      {ribbon && (
        <Typography variant="caption" sx={{ position: 'absolute', right: 8, top: 8, bgcolor: 'secondary.main', color: 'white', px: 0.8, py: 0.2, borderRadius: 1 }}>{ribbon}</Typography>
      )}
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2}>
          <Stack sx={{ minWidth: 0 }}>
            <Typography variant="subtitle2" noWrap>{name || '—'}</Typography>
            <Typography variant="caption" color="text.secondary">{team_short || '—'} · {type || '—'}</Typography>
          </Stack>
          <Typography variant="h6">{points}</Typography>
        </Stack>
        <Stack direction="row" spacing={1} mt={1} flexWrap="wrap" useFlexGap>
          <PlayerStatusBadge ps={play_state} onBench={on_bench} />
          {events.map((e:string, i:number) => (
            <Typography key={i} variant="caption" sx={{ border: 1, borderColor: 'divider', px: 0.8, py: 0.2, borderRadius: 1 }}>{e}</Typography>
          ))}
          {typeof bps === 'number' && (
            <Typography variant="caption" sx={{ border: 1, borderColor: 'divider', px: 0.8, py: 0.2, borderRadius: 1 }}>BPS: {bps}</Typography>
          )}
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>x{multiplier || 0} = {points} pts</Typography>
      </CardContent>
    </Card>
  )
}