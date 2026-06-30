const FOOTBALL_PATTERNS: RegExp[] = [
  /\b(sepak\s*bola|football|soccer)\b/i,
  /\b(liga|premier\s*league|la\s*liga|serie\s*a|bundesliga|ligue\s*1|champions\s*league|europa\s*league|liga\s*1|isl)\b/i,
  /\b(skor|score|hasil\s*pertandingan|live\s*score|klasemen|standings?|papan\s*klasemen)\b/i,
  /\b(pertandingan|match|fixture|jadwal\s*(bola|sepak\s*bola)?)\b/i,
  /\b(tim|team|klub|club)\s+\w+/i,
  /\b(top\s*scorer|pencetak\s*gol|artilador)\b/i,
  /\b(head\s*to\s*head|h2h|rekor\s*head\s*to\s*head)\b/i,
  /\b(manchester|barcelona|real\s*madrid|liverpool|arsenal|chelsea|juventus|milan|inter|bayern|psg|persija|persib|arema)\b/i,
  /\b(piala\s*dunia|world\s*cup|copa\s*america|euro\s*\d{4})\b/i,
  /\b(bola\s*malam\s*ini|jadwal\s*bola|siapa\s*yang\s*menang)\b/i,
];

const NON_FOOTBALL = [
  /\b(american\s*football|nfl|rugby|basket|nba|voli|badminton|f1|motogp)\b/i,
];

export type FootballDetection = {
  needed: boolean;
  reason: string;
  confidence: "high" | "medium" | "low";
};

export function detectFootballNeed(text: string): FootballDetection {
  const trimmed = text.trim();
  if (trimmed.length < 3) {
    return { needed: false, reason: "too_short", confidence: "low" };
  }

  for (const pattern of NON_FOOTBALL) {
    if (pattern.test(trimmed)) {
      return { needed: false, reason: "other_sport", confidence: "low" };
    }
  }

  let hits = 0;
  let matched = "";
  for (const pattern of FOOTBALL_PATTERNS) {
    if (pattern.test(trimmed)) {
      hits++;
      matched = pattern.source;
    }
  }

  if (hits >= 2) {
    return { needed: true, reason: matched || "multi_match", confidence: "high" };
  }
  if (hits === 1) {
    return { needed: true, reason: matched || "single_match", confidence: "medium" };
  }

  return { needed: false, reason: "no_match", confidence: "low" };
}

export function inferFootballAction(text: string):
  | "live_scores"
  | "standings"
  | "fixtures_today"
  | "top_scorers"
  | "team_info"
  | "smart_query" {
  const lower = text.toLowerCase();

  if (/\b(live|langsung|sedang\s*berlangsung|skor\s*live)\b/.test(lower)) {
    return "live_scores";
  }
  if (/\b(klasemen|standings?|papan\s*klasemen|peringkat)\b/.test(lower)) {
    return "standings";
  }
  if (/\b(top\s*scorer|pencetak\s*gol|artilador|top\s*gol)\b/.test(lower)) {
    return "top_scorers";
  }
  if (/\b(tim|team|klub|club)\b/.test(lower) && !/\b(vs|versus|melawan)\b/.test(lower)) {
    return "team_info";
  }
  if (/\b(hari\s*ini|today|jadwal|pertandingan|fixture|skor|hasil)\b/.test(lower)) {
    return "fixtures_today";
  }
  return "smart_query";
}

export function extractTeamSearchQuery(text: string): string | null {
  const patterns = [
    /\b(?:tim|team|klub|club)\s+(.+?)(?:\?|$)/i,
    /\b(?:info|cari|search)\s+(?:tim|team)?\s*(.+?)(?:\?|$)/i,
    /\b(manchester\s+\w+|real\s+madrid|barcelona|liverpool|arsenal|chelsea|juventus|inter\s+milan|ac\s+milan|bayern|dortmund|persija|persib|arema)\b/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1]) {
      return m[1].trim().slice(0, 80);
    }
    if (m?.[0]) {
      return m[0].trim().slice(0, 80);
    }
  }
  return null;
}
