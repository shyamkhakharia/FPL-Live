export type Projected = Record<number, {
  minutes: number;
  projected_total: number;
  goals_scored?: number;
  assists?: number;
  clean_sheets?: number;
  goals_conceded?: number;
  saves?: number;
  bonus?: number;
  bps?: number;
  yellow_cards?: number;
  red_cards?: number;
  penalties_missed?: number;
  penalties_saved?: number;
}>;

export function buildProjected(live: any): Projected {
  const map: Projected = {};
  for (const el of live.elements || []) {
    const s = el.stats || {};
    map[el.id] = {
      minutes: s.minutes || 0,
      projected_total: typeof s.total_points === 'number' ? s.total_points : 0,
      goals_scored: s.goals_scored || 0,
      assists: s.assists || 0,
      clean_sheets: s.clean_sheets || 0,
      goals_conceded: s.goals_conceded || 0,
      saves: s.saves || 0,
      bonus: s.bonus || 0,
      bps: s.bps || 0,
      yellow_cards: s.yellow_cards || 0,
      red_cards: s.red_cards || 0,
      penalties_missed: s.penalties_missed || 0,
      penalties_saved: s.penalties_saved || 0,
    };
  }
  return map;
}

export function pickEventBadges(p: any = {}): string[] {
  const out: string[] = [];
  if (p.goals_scored) out.push(`⚽ x${p.goals_scored}`);
  if (p.assists) out.push(`🅰️ x${p.assists}`);
  if (p.clean_sheets) out.push('🧼 CS');
  if (p.saves >= 3) out.push(`🧤 ${Math.floor(p.saves / 3)}SP`);
  if (p.bonus) out.push(`⭐ +${p.bonus}`);
  if (p.yellow_cards) out.push('🟨');
  if (p.red_cards) out.push('🟥');
  if (p.penalties_missed) out.push('❌ PK');
  if (p.penalties_saved) out.push('🧤 PKS');
  return out;
}
