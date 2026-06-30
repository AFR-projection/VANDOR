import type {
  FootballFixtureItem,
  FootballLeagueSearch,
  FootballStandingLeague,
  FootballTeamSearch,
  FootballTopScorer,
} from "./types";

function fmtScore(home: number | null, away: number | null): string {
  if (home === null || away === null) {
    return "–";
  }
  return `${home}-${away}`;
}

export function formatFixtures(fixtures: FootballFixtureItem[]): string {
  if (fixtures.length === 0) {
    return "Tidak ada pertandingan ditemukan.";
  }

  const lines: string[] = [];
  for (const item of fixtures.slice(0, 25)) {
    const { fixture, league, teams, goals, score } = item;
    const status = fixture.status.short;
    const elapsed =
      fixture.status.elapsed === null ? "" : ` ${fixture.status.elapsed}'`;
    const liveTag =
      status === "1H" || status === "2H" || status === "HT" || status === "ET"
        ? " 🔴"
        : "";
    const resultScore =
      goals.home !== null && goals.away !== null
        ? fmtScore(goals.home, goals.away)
        : fmtScore(score.fulltime?.home ?? null, score.fulltime?.away ?? null);

    lines.push(
      `[${league.name}] ${teams.home.name} vs ${teams.away.name} — ${resultScore} (${status}${elapsed})${liveTag} — ${fixture.date.slice(0, 16).replace("T", " ")} UTC`
    );
  }

  if (fixtures.length > 25) {
    lines.push(`… +${fixtures.length - 25} pertandingan lainnya`);
  }

  return lines.join("\n");
}

export function formatStandings(standings: FootballStandingLeague[]): string {
  const block = standings.at(0)?.league.standings.at(0);
  if (!block || block.length === 0) {
    return "Klasemen tidak tersedia.";
  }

  const league = standings.at(0)?.league;
  const header = league
    ? `Klasemen ${league.name} (${league.country}, musim ${league.season})`
    : "Klasemen";

  const lines = [header, ""];
  for (const row of block.slice(0, 20)) {
    lines.push(
      `${row.rank}. ${row.team.name} — ${row.points} poin (${row.all.played}M ${row.all.win}W ${row.all.draw}D ${row.all.lose}L, GD ${row.goalsDiff})${row.form ? ` [${row.form}]` : ""}`
    );
  }
  return lines.join("\n");
}

export function formatTeams(teams: FootballTeamSearch[]): string {
  if (teams.length === 0) {
    return "Tim tidak ditemukan.";
  }
  return teams
    .slice(0, 10)
    .map((t) => {
      const venue = t.venue?.name
        ? ` — ${t.venue.name}${t.venue.city ? `, ${t.venue.city}` : ""}`
        : "";
      return `${t.team.name} (ID ${t.team.id}, ${t.team.country ?? "?"})${venue}`;
    })
    .join("\n");
}

export function formatLeagues(leagues: FootballLeagueSearch[]): string {
  if (leagues.length === 0) {
    return "Liga tidak ditemukan.";
  }
  return leagues
    .slice(0, 10)
    .map((l) => {
      const current = l.seasons.find((s) => s.current);
      return `${l.league.name} (ID ${l.league.id}, ${l.country.name}${current ? `, musim ${current.year}` : ""})`;
    })
    .join("\n");
}

export function formatTopScorers(scorers: FootballTopScorer[]): string {
  if (scorers.length === 0) {
    return "Data top skor tidak tersedia.";
  }
  return scorers
    .slice(0, 15)
    .map((s, i) => {
      const stat = s.statistics.at(0);
      const goals = stat?.goals.total ?? 0;
      const team = stat?.team.name ?? "?";
      return `${i + 1}. ${s.player.name} (${team}) — ${goals} gol`;
    })
    .join("\n");
}

export function formatMatchDetail(fixture: FootballFixtureItem): string {
  const { fixture: f, league, teams, goals, score } = fixture;
  const lines = [
    `${teams.home.name} vs ${teams.away.name}`,
    `Liga: ${league.name} (${league.country}) — ${league.round ?? ""}`,
    `Status: ${f.status.long}${f.status.elapsed === null ? "" : ` (${f.status.elapsed}')`}`,
    `Skor: ${fmtScore(goals.home, goals.away)}`,
  ];
  if (
    score.halftime?.home !== null &&
    score.halftime?.home !== undefined &&
    score.halftime?.away !== null &&
    score.halftime?.away !== undefined
  ) {
    lines.push(`HT: ${fmtScore(score.halftime.home, score.halftime.away)}`);
  }
  if (f.venue?.name) {
    lines.push(
      `Venue: ${f.venue.name}${f.venue.city ? `, ${f.venue.city}` : ""}`
    );
  }
  lines.push(`Tanggal: ${f.date}`);
  lines.push(`Fixture ID: ${f.id}`);
  return lines.join("\n");
}

export function buildFootballContextBlock(formatted: string): string {
  return [
    "## Data sepak bola (API-Football — real-time)",
    "Gunakan data ini sebagai sumber utama untuk pertanyaan olahraga/sepak bola.",
    "",
    formatted,
  ].join("\n");
}
