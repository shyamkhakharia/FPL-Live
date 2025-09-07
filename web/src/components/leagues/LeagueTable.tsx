import { Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material'

export default function LeagueTable({ table = [], loading, mode }: any) {
  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Rank</TableCell>
            <TableCell>Manager</TableCell>
            <TableCell>Team</TableCell>
            <TableCell align="right">GW</TableCell>
            <TableCell align="right">Total</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {table.map((r:any) => (
            <TableRow key={r.entry} hover>
              <TableCell>{r.rank}</TableCell>
              <TableCell>{r.player_name}</TableCell>
              <TableCell>{r.entry_name}</TableCell>
              <TableCell align="right">{r.live_gw}</TableCell>
              <TableCell align="right">{r.total}</TableCell>
            </TableRow>
          ))}
          {!table.length && (
            <TableRow><TableCell colSpan={5}><Typography variant="body2" color="text.secondary">{loading? 'Loading…' : 'No data'}</Typography></TableCell></TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  )
}
