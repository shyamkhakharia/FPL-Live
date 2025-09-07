export function makePlayStateBuilder(fixtures: any[], playersById: any) {
  const teamFinished = (teamId: number) => {
    for (const f of fixtures) {
      if (f.team_h === teamId || f.team_a === teamId) {
        if (!(f.finished || f.finished_provisional)) return false;
      }
    }
    return true;
  };

  return function playStateFor(elId: number, minutes: number) {
    const teamId = playersById[elId]?.team;
    const finishedAll = teamFinished(teamId);
    const teamFixtures = fixtures.filter(f => f.team_h === teamId || f.team_a === teamId);
    const finishedCount = teamFixtures.filter(f => f.finished || f.finished_provisional).length;
    const maxRegMinutes = finishedCount * 90;

    let status: 'unused'|'subbed_off'|'played_full'|'not_started'|'playing_or_off_unk';
    if (finishedAll) {
      if (minutes === 0) status = 'unused';
      else if (minutes < maxRegMinutes) status = 'subbed_off';
      else status = 'played_full';
    } else {
      status = minutes === 0 ? 'not_started' : 'playing_or_off_unk';
    }

    return { minutes, team_finished: finishedAll, status };
  }
}
