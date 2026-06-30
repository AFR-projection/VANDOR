import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resetFootballCacheForTests } from "./cache";
import { detectFootballNeed, inferFootballAction } from "./detect";
import { formatFixtures } from "./format";
import { resolveLeagueFromText } from "./leagues";
import type { FootballFixtureItem } from "./types";

describe("football detect", () => {
  it("detects premier league score query", () => {
    const d = detectFootballNeed("skor live premier league hari ini");
    assert.equal(d.needed, true);
    assert.equal(d.confidence, "high");
  });

  it("skips non-football sports", () => {
    const d = detectFootballNeed("skor NBA hari ini");
    assert.equal(d.needed, false);
  });

  it("infers live action", () => {
    assert.equal(inferFootballAction("skor live liga 1"), "live_scores");
    assert.equal(inferFootballAction("klasemen premier league"), "standings");
  });
});

describe("football leagues", () => {
  it("resolves premier league", () => {
    const league = resolveLeagueFromText("klasemen premier league");
    assert.ok(league);
    assert.equal(league.id, 39);
  });

  it("resolves liga indonesia", () => {
    const league = resolveLeagueFromText("jadwal persija liga 1");
    assert.ok(league);
    assert.equal(league.id, 274);
  });
});

describe("football format", () => {
  it("formats fixture list", () => {
    const fixtures: FootballFixtureItem[] = [
      {
        fixture: {
          id: 1,
          date: "2026-06-30T19:00:00+00:00",
          status: { long: "First Half", short: "1H", elapsed: 23 },
        },
        league: {
          id: 39,
          name: "Premier League",
          country: "England",
          season: 2025,
        },
        teams: {
          home: { id: 1, name: "Arsenal" },
          away: { id: 2, name: "Chelsea" },
        },
        goals: { home: 1, away: 0 },
        score: { fulltime: { home: null, away: null } },
      },
    ];
    const text = formatFixtures(fixtures);
    assert.match(text, /Arsenal vs Chelsea/);
    assert.match(text, /1-0/);
  });
});

describe("football cache", () => {
  it("clears for tests", () => {
    resetFootballCacheForTests();
    assert.ok(true);
  });
});
