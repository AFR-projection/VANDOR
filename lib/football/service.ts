import "server-only";

import { footballApiGet } from "./client";
import {
  FOOTBALL_CACHE_TTL_MS,
  getApiFootballApiKey,
  isApiFootballConfigured,
} from "./config";
import {
  extractTeamSearchQuery,
  inferFootballAction,
} from "./detect";
import {
  formatFixtures,
  formatLeagues,
  formatMatchDetail,
  formatStandings,
  formatTeams,
  formatTopScorers,
} from "./format";
import { currentSeasonYear, resolveLeagueFromText } from "./leagues";
import type {
  FootballFixtureItem,
  FootballLeagueSearch,
  FootballServiceResult,
  FootballStandingLeague,
  FootballTeamSearch,
  FootballToolAction,
  FootballTopScorer,
} from "./types";

function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function okResult(
  action: FootballToolAction,
  summary: string,
  formatted: string,
  data: unknown,
  cached: boolean
): FootballServiceResult {
  return {
    ok: true,
    action,
    summary,
    formatted,
    data,
    cached,
    provider: "api-football",
  };
}

function failResult(
  action: FootballToolAction,
  error: string
): FootballServiceResult {
  return {
    ok: false,
    action,
    summary: error,
    formatted: error,
    error,
    provider: "api-football",
  };
}

async function resolveLeagueId(
  leagueName: string | undefined,
  queryText: string,
  apiKey: string
): Promise<{ id: number; name: string; season: number } | null> {
  const fromText = resolveLeagueFromText(queryText);
  if (fromText) {
    return { ...fromText, season: currentSeasonYear() };
  }

  const searchName = leagueName?.trim();
  if (!searchName) {
    return null;
  }

  const { data } = await footballApiGet<FootballLeagueSearch[]>(
    "/leagues",
    { search: searchName, current: "true" },
    { apiKey, cacheTtlMs: FOOTBALL_CACHE_TTL_MS.teams }
  );

  const first = data.response.at(0);
  if (!first) {
    return null;
  }

  const current = first.seasons.find((s) => s.current);
  return {
    id: first.league.id,
    name: first.league.name,
    season: current?.year ?? currentSeasonYear(),
  };
}

export async function runFootballLiveScores(
  userId: string | null
): Promise<FootballServiceResult> {
  const apiKey = await getApiFootballApiKey(userId);
  if (!isApiFootballConfigured(apiKey)) {
    return failResult(
      "live_scores",
      "API-Football belum dikonfigurasi. Tambahkan API key di Settings → Integrations (Cuaca, Olahraga & WhatsApp)."
    );
  }

  const { data, cached } = await footballApiGet<FootballFixtureItem[]>(
    "/fixtures",
    { live: "all" },
    { apiKey, cacheTtlMs: FOOTBALL_CACHE_TTL_MS.live }
  );

  const formatted = formatFixtures(data.response);
  return okResult(
    "live_scores",
    `${data.results} pertandingan live`,
    formatted,
    data.response,
    cached
  );
}

export async function runFootballFixturesByDate(
  userId: string | null,
  date?: string,
  leagueId?: number,
  teamId?: number
): Promise<FootballServiceResult> {
  const apiKey = await getApiFootballApiKey(userId);
  if (!isApiFootballConfigured(apiKey)) {
    return failResult(
      "fixtures_by_date",
      "API-Football belum dikonfigurasi."
    );
  }

  const params: Record<string, string | number | undefined> = {
    date: date ?? todayUtcDate(),
    league: leagueId,
    team: teamId,
    timezone: "UTC",
  };

  const { data, cached } = await footballApiGet<FootballFixtureItem[]>(
    "/fixtures",
    params,
    { apiKey, cacheTtlMs: FOOTBALL_CACHE_TTL_MS.fixtures }
  );

  const formatted = formatFixtures(data.response);
  return okResult(
    "fixtures_by_date",
    `${data.results} pertandingan pada ${params.date}`,
    formatted,
    data.response,
    cached
  );
}

export async function runFootballStandings(
  userId: string | null,
  leagueId?: number,
  leagueName?: string,
  queryText = "",
  season?: number
): Promise<FootballServiceResult> {
  const apiKey = await getApiFootballApiKey(userId);
  if (!isApiFootballConfigured(apiKey)) {
    return failResult("standings", "API-Football belum dikonfigurasi.");
  }

  let resolvedId = leagueId;
  let resolvedName = leagueName ?? "liga";
  let resolvedSeason = season ?? currentSeasonYear();

  if (!resolvedId) {
    const resolved = await resolveLeagueId(leagueName, queryText, apiKey);
    if (!resolved) {
      return failResult(
        "standings",
        "Liga tidak dikenali. Sebutkan nama liga (mis. Premier League, Liga 1) atau berikan leagueId."
      );
    }
    resolvedId = resolved.id;
    resolvedName = resolved.name;
    resolvedSeason = resolved.season;
  }

  const { data, cached } = await footballApiGet<FootballStandingLeague[]>(
    "/standings",
    { league: resolvedId, season: resolvedSeason },
    { apiKey, cacheTtlMs: FOOTBALL_CACHE_TTL_MS.standings }
  );

  const formatted = formatStandings(data.response);
  return okResult(
    "standings",
    `Klasemen ${resolvedName} musim ${resolvedSeason}`,
    formatted,
    data.response,
    cached
  );
}

export async function runFootballTeamSearch(
  userId: string | null,
  query: string
): Promise<FootballServiceResult> {
  const apiKey = await getApiFootballApiKey(userId);
  if (!isApiFootballConfigured(apiKey)) {
    return failResult("team_info", "API-Football belum dikonfigurasi.");
  }

  const { data, cached } = await footballApiGet<FootballTeamSearch[]>(
    "/teams",
    { search: query.slice(0, 80) },
    { apiKey, cacheTtlMs: FOOTBALL_CACHE_TTL_MS.teams }
  );

  const formatted = formatTeams(data.response);
  return okResult(
    "team_info",
    `${data.results} tim untuk "${query}"`,
    formatted,
    data.response,
    cached
  );
}

export async function runFootballTopScorers(
  userId: string | null,
  leagueId?: number,
  leagueName?: string,
  queryText = "",
  season?: number
): Promise<FootballServiceResult> {
  const apiKey = await getApiFootballApiKey(userId);
  if (!isApiFootballConfigured(apiKey)) {
    return failResult("top_scorers", "API-Football belum dikonfigurasi.");
  }

  let resolvedId = leagueId;
  let resolvedName = leagueName ?? "liga";
  let resolvedSeason = season ?? currentSeasonYear();

  if (!resolvedId) {
    const resolved = await resolveLeagueId(leagueName, queryText, apiKey);
    if (!resolved) {
      return failResult("top_scorers", "Liga tidak dikenali untuk top skor.");
    }
    resolvedId = resolved.id;
    resolvedName = resolved.name;
    resolvedSeason = resolved.season;
  }

  const { data, cached } = await footballApiGet<FootballTopScorer[]>(
    "/players/topscorers",
    { league: resolvedId, season: resolvedSeason },
    { apiKey, cacheTtlMs: FOOTBALL_CACHE_TTL_MS.standings }
  );

  const formatted = formatTopScorers(data.response);
  return okResult(
    "top_scorers",
    `Top skor ${resolvedName} musim ${resolvedSeason}`,
    formatted,
    data.response,
    cached
  );
}

export async function runFootballMatchDetail(
  userId: string | null,
  fixtureId: number
): Promise<FootballServiceResult> {
  const apiKey = await getApiFootballApiKey(userId);
  if (!isApiFootballConfigured(apiKey)) {
    return failResult("match_detail", "API-Football belum dikonfigurasi.");
  }

  const { data, cached } = await footballApiGet<FootballFixtureItem[]>(
    "/fixtures",
    { id: fixtureId },
    { apiKey, cacheTtlMs: FOOTBALL_CACHE_TTL_MS.fixtures }
  );

  const match = data.response.at(0);
  if (!match) {
    return failResult("match_detail", `Pertandingan ID ${fixtureId} tidak ditemukan.`);
  }

  const formatted = formatMatchDetail(match);
  return okResult(
    "match_detail",
    `Detail pertandingan ${fixtureId}`,
    formatted,
    match,
    cached
  );
}

export async function runFootballSmartQuery(
  userId: string | null,
  queryText: string
): Promise<FootballServiceResult> {
  const action = inferFootballAction(queryText);

  switch (action) {
    case "live_scores":
      return runFootballLiveScores(userId);
    case "standings":
      return runFootballStandings(userId, undefined, undefined, queryText);
    case "top_scorers":
      return runFootballTopScorers(userId, undefined, undefined, queryText);
    case "team_info": {
      const teamQuery = extractTeamSearchQuery(queryText) ?? queryText.slice(0, 60);
      return runFootballTeamSearch(userId, teamQuery);
    }
    case "fixtures_today":
    default:
      return runFootballFixturesByDate(userId);
  }
}

export async function runFootballTool(input: {
  userId: string | null;
  action: FootballToolAction;
  query?: string;
  date?: string;
  leagueId?: number;
  leagueName?: string;
  teamId?: number;
  teamName?: string;
  fixtureId?: number;
  season?: number;
}): Promise<FootballServiceResult> {
  const {
    userId,
    action,
    query,
    date,
    leagueId,
    leagueName,
    teamId,
    teamName,
    fixtureId,
    season,
  } = input;

  try {
    switch (action) {
      case "live_scores":
        return runFootballLiveScores(userId);
      case "fixtures_today":
        return runFootballFixturesByDate(userId, todayUtcDate(), leagueId, teamId);
      case "fixtures_by_date":
        return runFootballFixturesByDate(userId, date, leagueId, teamId);
      case "standings":
        return runFootballStandings(
          userId,
          leagueId,
          leagueName,
          query ?? "",
          season
        );
      case "team_info":
        return runFootballTeamSearch(
          userId,
          teamName ?? query ?? "team"
        );
      case "league_info": {
        const apiKey = await getApiFootballApiKey(userId);
        if (!isApiFootballConfigured(apiKey)) {
          return failResult("league_info", "API-Football belum dikonfigurasi.");
        }
        const { data, cached } = await footballApiGet<FootballLeagueSearch[]>(
          "/leagues",
          { search: (leagueName ?? query ?? "").slice(0, 80), current: "true" },
          { apiKey, cacheTtlMs: FOOTBALL_CACHE_TTL_MS.teams }
        );
        return okResult(
          "league_info",
          `${data.results} liga ditemukan`,
          formatLeagues(data.response),
          data.response,
          cached
        );
      }
      case "top_scorers":
        return runFootballTopScorers(
          userId,
          leagueId,
          leagueName,
          query ?? "",
          season
        );
      case "match_detail":
        if (!fixtureId) {
          return failResult("match_detail", "fixtureId wajib untuk match_detail.");
        }
        return runFootballMatchDetail(userId, fixtureId);
      case "head_to_head": {
        const apiKey = await getApiFootballApiKey(userId);
        if (!isApiFootballConfigured(apiKey)) {
          return failResult("head_to_head", "API-Football belum dikonfigurasi.");
        }
        if (!teamId) {
          const teamQ = teamName ?? extractTeamSearchQuery(query ?? "");
          if (!teamQ) {
            return failResult("head_to_head", "Butuh teamId atau teamName.");
          }
          return runFootballTeamSearch(userId, teamQ);
        }
        const { data, cached } = await footballApiGet<FootballFixtureItem[]>(
          "/fixtures",
          { team: teamId, last: 10 },
          { apiKey, cacheTtlMs: FOOTBALL_CACHE_TTL_MS.fixtures }
        );
        return okResult(
          "head_to_head",
          `10 pertandingan terakhir tim ${teamId}`,
          formatFixtures(data.response),
          data.response,
          cached
        );
      }
      case "smart_query":
      default:
        return runFootballSmartQuery(userId, query ?? "");
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Gagal memanggil API-Football.";
    return failResult(action, message);
  }
}

export async function preloadFootballContext(
  userId: string | null,
  queryText: string
): Promise<FootballServiceResult | null> {
  const apiKey = await getApiFootballApiKey(userId);
  if (!isApiFootballConfigured(apiKey)) {
    return null;
  }

  return runFootballSmartQuery(userId, queryText);
}
