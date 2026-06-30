/** Liga populer — resolve nama user → league id + season default. */
export const POPULAR_LEAGUES: Record<
  string,
  { id: number; name: string; country: string; defaultSeason?: number }
> = {
  "premier league": { id: 39, name: "Premier League", country: "England" },
  epl: { id: 39, name: "Premier League", country: "England" },
  "la liga": { id: 140, name: "La Liga", country: "Spain" },
  "serie a": { id: 135, name: "Serie A", country: "Italy" },
  bundesliga: { id: 78, name: "Bundesliga", country: "Germany" },
  "ligue 1": { id: 61, name: "Ligue 1", country: "France" },
  "champions league": { id: 2, name: "UEFA Champions League", country: "World" },
  ucl: { id: 2, name: "UEFA Champions League", country: "World" },
  "europa league": { id: 3, name: "UEFA Europa League", country: "World" },
  "liga 1": { id: 274, name: "Liga 1", country: "Indonesia" },
  "liga indonesia": { id: 274, name: "Liga 1", country: "Indonesia" },
  "indonesia super league": {
    id: 274,
    name: "Liga 1",
    country: "Indonesia",
  },
  isl: { id: 274, name: "Liga 1", country: "Indonesia" },
  "world cup": { id: 1, name: "World Cup", country: "World" },
  "copa america": { id: 9, name: "Copa America", country: "World" },
  "euro championship": { id: 4, name: "Euro Championship", country: "World" },
};

export function resolveLeagueFromText(text: string): {
  id: number;
  name: string;
} | null {
  const lower = text.toLowerCase();
  for (const [key, league] of Object.entries(POPULAR_LEAGUES)) {
    if (lower.includes(key)) {
      return { id: league.id, name: league.name };
    }
  }
  return null;
}

export function currentSeasonYear(): number {
  const now = new Date();
  const month = now.getUTCMonth();
  const year = now.getUTCFullYear();
  // Musim Eropa: Jul–Jun
  return month >= 6 ? year : year - 1;
}
