export type ApiFootballEnvelope<T> = {
  get: string;
  parameters: Record<string, string | number>;
  errors: string[] | Record<string, string>;
  results: number;
  paging?: { current: number; total: number };
  response: T;
};

export type FootballFixtureTeam = {
  id: number;
  name: string;
  logo?: string;
  winner?: boolean | null;
};

export type FootballFixtureScore = {
  halftime?: { home: number | null; away: number | null };
  fulltime?: { home: number | null; away: number | null };
  extratime?: { home: number | null; away: number | null };
  penalty?: { home: number | null; away: number | null };
};

export type FootballFixtureItem = {
  fixture: {
    id: number;
    date: string;
    status: {
      long: string;
      short: string;
      elapsed: number | null;
    };
    venue?: { name?: string; city?: string };
  };
  league: {
    id: number;
    name: string;
    country: string;
    season: number;
    round?: string;
    logo?: string;
  };
  teams: {
    home: FootballFixtureTeam;
    away: FootballFixtureTeam;
  };
  goals: { home: number | null; away: number | null };
  score: FootballFixtureScore;
};

export type FootballStandingRow = {
  rank: number;
  team: { id: number; name: string; logo?: string };
  points: number;
  goalsDiff: number;
  form?: string;
  all: { played: number; win: number; draw: number; lose: number };
};

export type FootballStandingLeague = {
  league: {
    id: number;
    name: string;
    country: string;
    season: number;
    standings: FootballStandingRow[][];
  };
};

export type FootballTeamSearch = {
  team: {
    id: number;
    name: string;
    code?: string;
    country?: string;
    logo?: string;
  };
  venue?: { name?: string; city?: string };
};

export type FootballLeagueSearch = {
  league: {
    id: number;
    name: string;
    type: string;
    logo?: string;
  };
  country: { name: string; code?: string; flag?: string };
  seasons: Array<{ year: number; current?: boolean }>;
};

export type FootballTopScorer = {
  player: { id: number; name: string; photo?: string };
  statistics: Array<{
    team: { id: number; name: string };
    goals: { total: number | null };
    games: { appearences: number | null };
  }>;
};

export type FootballToolAction =
  | "live_scores"
  | "fixtures_today"
  | "fixtures_by_date"
  | "standings"
  | "team_info"
  | "league_info"
  | "top_scorers"
  | "head_to_head"
  | "match_detail"
  | "smart_query";

export type FootballServiceResult = {
  ok: boolean;
  action: FootballToolAction;
  summary: string;
  data?: unknown;
  formatted: string;
  error?: string;
  cached?: boolean;
  provider: "api-football";
};
