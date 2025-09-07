export function applyAutosubs(
  starters: any[],
  bench: any[],
  playersById: any,
  formationGuard: boolean,
  surelyAbsent: (elId: number) => boolean
) {
  const usedBench = new Set<number>();
  const effective = starters.map(s => ({ ...s }));
  if (!formationGuard) return { effective, usedBench };

  // GK first
  const startGK = effective.find(p => playersById[p.element]?.element_type === 1);
  if (startGK && surelyAbsent(startGK.element)) {
    const benchGK = bench.find(p => playersById[p.element]?.element_type === 1);
    if (benchGK) { usedBench.add(benchGK.element); startGK.element = benchGK.element; }
  }

  // Outfield (3-2-1)
  const outfieldBench = bench.filter(p => playersById[p.element]?.element_type !== 1);
  const min = { DEF: 3, MID: 2, FWD: 1 } as const;
  const countFormation = () => {
    const c = { DEF:0, MID:0, FWD:0 } as Record<'DEF'|'MID'|'FWD', number>;
    for (const p of effective) {
      const et = playersById[p.element]?.element_type;
      if (et === 2) c.DEF++; else if (et === 3) c.MID++; else if (et === 4) c.FWD++;
    }
    return c;
  };

  for (const p of effective) {
    const et = playersById[p.element]?.element_type;
    if (et === 1 || !surelyAbsent(p.element)) continue;
    const formation = countFormation();
    for (const b of outfieldBench) {
      if (usedBench.has(b.element)) continue;
      const bet = playersById[b.element]?.element_type;
      const oldRole = et === 2 ? 'DEF' : et === 3 ? 'MID' : 'FWD';
      const newRole = bet === 2 ? 'DEF' : bet === 3 ? 'MID' : 'FWD';
      const next = { ...formation }; next[oldRole]--; next[newRole]++;
      if (next.DEF >= min.DEF && next.MID >= min.MID && next.FWD >= min.FWD) {
        usedBench.add(b.element); p.element = b.element; break;
      }
    }
  }

  return { effective, usedBench };
}
