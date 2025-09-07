import { List, ListItemButton, ListItemText, Paper, Typography } from '@mui/material'

export default function LeagueSidebar({ leagues = [], selectedId, onSelect }: any) {
  return (
    <Paper variant="outlined" sx={{ p: 1 }}>
      <Typography variant="overline">Leagues</Typography>
      <List dense>
        {leagues.map((l:any) => (
          <ListItemButton key={l.id} selected={selectedId === l.id} onClick={() => onSelect(l.id)}>
            <ListItemText primary={l.name} secondary={`Members ${l.entry_count ?? ''}`} />
          </ListItemButton>
        ))}
      </List>
    </Paper>
  )
}
