import { Card, CardContent, Grid, Typography } from '@mui/material'

export default function SummaryCards({ summary, live }: any) {
  return (
    <Grid container spacing={2}>
      <Grid item xs={12} md={4}>
        <Card variant="outlined"><CardContent>
          <Typography variant="overline">Live GW</Typography>
          <Typography variant="h4">{live?.totals?.overall ?? '—'}</Typography>
        </CardContent></Card>
      </Grid>
      <Grid item xs={12} md={4}>
        <Card variant="outlined"><CardContent>
          <Typography variant="overline">Overall Rank</Typography>
          <Typography variant="h5">{summary?.overall_rank ?? '—'}</Typography>
        </CardContent></Card>
      </Grid>
      <Grid item xs={12} md={4}>
        <Card variant="outlined"><CardContent>
          <Typography variant="overline">Live vs Avg</Typography>
          <Typography variant="h5">{live?.diff_vs_average ?? '—'}</Typography>
        </CardContent></Card>
      </Grid>
    </Grid>
  )
}
