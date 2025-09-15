export function applyProvisionalBonus(
  projectedById: Record<number, any>,
  fixtures: any[],
  playersById: Record<number, any>
) {
  const byFixture: Record<number, Array<{ el: number; bps: number }>> = {};
  for (const key in projectedById) {
    const elId = Number(key);
    const teamId = playersById[elId]?.team;
    const fx = fixtures.find(f => f.team_h === teamId || f.team_a === teamId);
    if (!fx) continue;
    (byFixture[fx.id] ||= []).push({ el: elId, bps: projectedById[elId]?.bps || 0 });
  }
  for (const fidStr of Object.keys(byFixture)) {
    const fid = Number(fidStr);
    const fx = fixtures.find(f => f.id === fid);
    if (!fx) continue;
    if (fx.finished || fx.finished_provisional) continue; // final bonus already in totals
    const top = byFixture[fid].sort((a,b)=>b.bps-a.bps).slice(0,3);
    const bonus = [3,2,1];
    top.forEach((t, i) => {
      const inc = bonus[i] || 0;
      if (!projectedById[t.el]) projectedById[t.el] = { projected_total: 0 };
      projectedById[t.el].projected_total = (projectedById[t.el].projected_total || 0) + inc;
    });
  }
}
