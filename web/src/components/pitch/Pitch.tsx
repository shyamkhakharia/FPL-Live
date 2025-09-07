import { Box, Grid, Typography } from '@mui/material'
import PlayerCard from './PlayerCard'

export default function Pitch({ team = [] as any[] }) {
  const starters = team.filter(p => !p.on_bench)
  const bench = team.filter(p => p.on_bench)
  const rows = {
    GK: starters.filter(p => p.type === 'GK'),
    DEF: starters.filter(p => p.type === 'DEF'),
    MID: starters.filter(p => p.type === 'MID'),
    FWD: starters.filter(p => p.type === 'FWD')
  }

  return (
    <Box>
      {(['GK','DEF','MID','FWD'] as const).map(line => (
        <Grid key={line} container spacing={2} justifyContent="center" sx={{ mb: 1 }}>
          {rows[line].map((p:any) => (
            <Grid key={p.element} item xs={12} sm={6} md={3} lg={3}><PlayerCard slot={p} /></Grid>
          ))}
        </Grid>
      ))}

      <Typography variant="overline" color="text.secondary">Bench</Typography>
      <Grid container spacing={2}>
        {bench.map((p:any) => (
          <Grid key={`b-${p.element}`} item xs={12} sm={6} md={3} lg={3}><PlayerCard slot={p} /></Grid>
        ))}
      </Grid>
    </Box>
  )
}
