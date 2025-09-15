import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Box,
  useTheme,
  useMediaQuery,
} from '@mui/material'

function RankArrow({ d }: { d: number }) {
  if (d === 0) {
    return (
      <Box component="span"
        sx={{ display:'inline-flex', alignItems:'center', mr:1, opacity:.8, color:'#9ca3af', fontSize:'0.8rem', lineHeight:1 }}
        aria-label="no change">–</Box>
    )
  }
  const up = d > 0
  const color = up ? '#16a34a' : '#dc2626'
  const label = up ? 'up' : 'down'
  return (
    <Box component="span" sx={{ display:'inline-flex', alignItems:'center', mr:1, opacity:.8 }} aria-label={`rank ${label}`}>
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
        {up ? <path d="M5 2l3.5 4H1.5L5 2z" fill={color}/> : <path d="M5 8L1.5 4h7L5 8z" fill={color}/>}
      </svg>
    </Box>
  )
}

function ManagerTeam({ player, team }: { player: string; team: string }) {
  return (
    <Box sx={{ minWidth:0 }}>
      <Typography variant="body2" sx={{ fontWeight:700, lineHeight:1.15 }} noWrap title={player}>
        {player}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ lineHeight:1.1 }} noWrap title={team}>
        {team}
      </Typography>
    </Box>
  )
}

function PointsStack({ gw, total, compact=false }: { gw:number; total:number; compact?:boolean }) {
  return (
    <Box
      sx={{
        display:'flex',
        flexDirection:'column',
        alignItems:'flex-end',
        whiteSpace:'normal',        // <-- allow stacking on mobile
        minWidth:56,
        lineHeight:1.1,
      }}
    >
      <Typography variant={compact ? 'caption' : 'body2'} title={`GW: ${gw}`}>{gw}</Typography>
      <Typography variant="caption" color="text.secondary" title={`Total: ${total}`}>{total}</Typography>
    </Box>
  )
}

export default function LeagueTable({
  table = [],
  loading,
  mode = 'fast',
  official_ready = false,
  onRowClick,
}: any) {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))
  const showDelta = mode === 'live' || official_ready === true

  return (
    <TableContainer component={Paper} variant="outlined" sx={{ overflowX:'hidden' }}>
      <Table
        size="small"
        sx={{
          '& th, & td': {
            py: isMobile ? 0.6 : 1,
            px: isMobile ? 1 : 1.5,
            whiteSpace:'nowrap', // general; we override in the points cell
          },
        }}
      >
        <TableHead>
          <TableRow>
            <TableCell sx={{ width:56 }}>Rank</TableCell>
            <TableCell>Manager / Team</TableCell>
            {!isMobile && <TableCell align="right">GW</TableCell>}
            {!isMobile && <TableCell align="right">Total</TableCell>}
            {isMobile && <TableCell align="right">GW / Tot</TableCell>}
          </TableRow>
        </TableHead>

        <TableBody>
          {table.map((r:any) => {
            const delta = Number(r.rank_delta) || 0
            return (
              <TableRow
                key={r.entry}
                hover
                onClick={() => onRowClick?.(r.entry)}
                sx={{ cursor: onRowClick ? 'pointer' : 'default' }}
              >
                <TableCell>{r.rank}</TableCell>

                <TableCell sx={{ maxWidth: isMobile ? 200 : 'unset' }}>
                  <Box sx={{ display:'flex', alignItems:'center', minWidth:0 }}>
                    {showDelta && <RankArrow d={delta} />}
                    <ManagerTeam player={r.player_name} team={r.entry_name} />
                  </Box>
                </TableCell>

                {!isMobile && <TableCell align="right">{r.live_gw}</TableCell>}
                {!isMobile && <TableCell align="right">{r.total}</TableCell>}
                {isMobile && (
                  <TableCell align="right" sx={{ whiteSpace:'normal', p:0.5 }}>
                    <PointsStack gw={r.live_gw} total={r.total} compact />
                  </TableCell>
                )}
              </TableRow>
            )
          })}

          {!table.length && (
            <TableRow>
              <TableCell colSpan={isMobile ? 3 : 4}>
                <Typography variant="body2" color="text.secondary">
                  {loading ? 'Loading…' : 'No data'}
                </Typography>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  )
}