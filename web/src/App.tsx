import { useEffect, useState } from "react";
import {
  Grid,
  Paper,
  Stack,
  TextField,
  Button,
  ToggleButton,
  ToggleButtonGroup,
  Tabs,
  Tab,
  Box,
} from "@mui/material";
import AppShell from "./components/layout/AppShell";
import { api } from "./api/client";
import SummaryCards from "./components/cards/SummaryCards";
import Pitch from "./components/pitch/Pitch";
import LeagueSidebar from "./components/leagues/LeagueSidebar";
import LeagueTable from "./components/leagues/LeagueTable";

export default function App() {
  const [managerId, setManagerId] = useState(
    localStorage.getItem("managerId") || ""
  );
  const [inputId, setInputId] = useState(managerId);
  const [autosubs, setAutosubs] = useState(
    localStorage.getItem("autosubs") || "on"
  );
  const [tab, setTab] = useState<"team" | "leagues">("team");

  const [summary, setSummary] = useState<any>(null);
  const [live, setLive] = useState<any>(null);
  const [leagues, setLeagues] = useState<any[]>([]);
  const [selectedLeague, setSelectedLeague] = useState<string | null>(null);
  const [leagueData, setLeagueData] = useState<any>(null);
  const [leagueLoading, setLeagueLoading] = useState(false);

  async function loadManager(id: string) {
    const base = await api.manager(id);
    setSummary(base.summary);
    setLeagues(base.leagues?.classic || []);
    const l = await api.live(id, autosubs);
    setLive(l);
  }

  async function refreshLive() {
    if (!managerId) return;
    try {
      setLive(await api.live(managerId, autosubs));
    } catch {}
  }

  useEffect(() => {
    if (managerId) loadManager(managerId);
  }, []);
  useEffect(() => {
    const t = setInterval(refreshLive, 30000);
    return () => clearInterval(t);
  }, [managerId, autosubs]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputId) return;
    localStorage.setItem("managerId", inputId);
    setManagerId(inputId);
    await loadManager(inputId);
  };

  async function loadLeague(lid: string) {
    setSelectedLeague(lid);
    setLeagueLoading(true);
    try {
      setLeagueData(await api.league(lid, "auto", 1, autosubs));
    } finally {
      setLeagueLoading(false);
    }
  }

  return (
    <AppShell>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        alignItems={{ xs: "stretch", sm: "center" }}
        sx={{ mb: 2 }}
      >
        <form onSubmit={onSubmit} style={{ display: "flex", gap: 8 }}>
          <TextField
            size="small"
            label="FPL Manager ID"
            value={inputId}
            onChange={(e) => setInputId(e.target.value)}
          />
          <Button variant="contained" type="submit" disabled={!inputId}>
            {summary ? "Reload" : "Load"}
          </Button>
        </form>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={autosubs}
          onChange={(_, v) => {
            if (!v) return;
            setAutosubs(v);
            localStorage.setItem("autosubs", v);
            refreshLive();
          }}
        >
          <ToggleButton value="on">Autosubs On</ToggleButton>
          <ToggleButton value="off">Autosubs Off</ToggleButton>
        </ToggleButtonGroup>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ ml: "auto" }}>
          <Tab label="My Team" value="team" />
          <Tab label="Leagues" value="leagues" />
        </Tabs>
      </Stack>

      {tab === "team" && (
        <Stack spacing={2}>
          <SummaryCards summary={summary} live={live} />
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Pitch team={live?.team || []} />
          </Paper>
        </Stack>
      )}

      {tab === "leagues" && (
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <LeagueSidebar
              leagues={leagues}
              selectedId={selectedLeague}
              onSelect={loadLeague}
            />
          </Grid>
          <Grid item xs={12} md={8}>
            <Box sx={{ mb: 1, fontSize: 12, color: "text.secondary" }}>
              {(() => {
                const m = leagueData?.mode;
                const official = leagueData?.official_ready;
                const total = leagueData?.totalMembers ?? 0;
                const tooBig = leagueData?.too_big_for_live;
                const limit = leagueData?.live_limit;

                const label =
                  m === "live" ? "Live standings" : "Official standings";

                return (
                  <>
                    {label}
                    {typeof total === "number" && total > 0
                      ? ` · Members: ${total}`
                      : null}
                    {tooBig && limit ? (
                      <span>
                        {" "}
                        · This league exceeds our live processing limit ({limit}
                        ). Showing official standings.
                      </span>
                    ) : null}
                    {m !== "live" && official
                      ? " · Finalised for this GW"
                      : null}
                  </>
                );
              })()}
            </Box>
            <LeagueTable
              table={leagueData?.table}
              loading={leagueLoading}
              mode={leagueData?.mode}
              official_ready={leagueData?.official_ready}
              onRowClick={(entry: number) => {
                /* optional: navigate to that entry if desired */
              }}
            />
          </Grid>
        </Grid>
      )}
    </AppShell>
  );
}
