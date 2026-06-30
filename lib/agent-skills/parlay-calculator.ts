export type ParlayLegStatus = "W" | "WH" | "LH" | "D";

export type ParlayLegInput = {
  label?: string;
  odds: number;
  status: ParlayLegStatus | "DRAW" | "VOID" | "PUSH";
};

export type ParlayCalcInput = {
  ticketId?: string;
  betAmount: number;
  legs: ParlayLegInput[];
};

export type ParlayLegResult = {
  index: number;
  label: string;
  originalOdds: number;
  status: string;
  convertedOdds: number | null;
  line: string;
};

export type ParlayCalcResult = {
  ticketId: string | null;
  betAmount: number;
  legs: ParlayLegResult[];
  actualOddsFull: number;
  actualOddsDisplay: number;
  returnAmount: number;
  returnAmountDisplay: number;
  returnFormatted: string;
  betFormatted: string;
  memberMessage: string;
  penjelasan: string;
};

function normalizeStatus(raw: string): ParlayLegStatus | "D" {
  const s = raw.trim().toUpperCase();
  if (s === "W" || s === "WIN") return "W";
  if (s === "WH" || s === "WIN HALF" || s === "WIN_HALF") return "WH";
  if (s === "LH" || s === "LOSE HALF" || s === "LOSE_HALF") return "LH";
  if (s === "D" || s === "DRAW" || s === "VOID" || s === "PUSH") return "D";
  return "W";
}

export function convertParlayOdds(
  odds: number,
  status: ParlayLegInput["status"]
): { converted: number | null; norm: ParlayLegStatus | "D" } {
  const norm = normalizeStatus(status);
  if (norm === "W") return { converted: odds, norm };
  if (norm === "WH") return { converted: (odds - 1) / 2 + 1, norm };
  if (norm === "LH") return { converted: 0.5, norm };
  return { converted: null, norm: "D" };
}

/** Konversi odds ke nilai settlement (3 desimal) */
function convertOddsPrecise(
  odds: number,
  status: ParlayLegInput["status"]
): { converted: number | null; norm: ParlayLegStatus | "D" } {
  const norm = normalizeStatus(status);
  if (norm === "W") {
    return { converted: truncateDecimals(odds, 3), norm };
  }
  if (norm === "WH") {
    const base = truncateDecimals(odds, 3);
    return { converted: truncateDecimals((base - 1) / 2 + 1, 3), norm };
  }
  if (norm === "LH") {
    return { converted: 0.5, norm };
  }
  return { converted: null, norm: "D" };
}

/** Perkalian odds tampilan (3 desimal), bulatkan actual odds ke 3 desimal */
function multiplyOddsForSettlement(factors: number[]): number {
  if (factors.length === 0) {
    return 1;
  }
  let product = 1;
  for (const f of factors) {
    product *= truncateDecimals(f, 3);
  }
  return product;
}

export function truncateDecimals(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  const stabilized = Number.parseFloat(value.toPrecision(14));
  return Math.trunc(stabilized * factor) / factor;
}

/** Actual odds tampilan — bulatkan 3 desimal (sesuai settlement provider) */
export function roundOddsDisplay(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Odds asli — selalu 3 desimal (1.890) */
export function formatOddsOriginal(odds: number): string {
  return truncateDecimals(odds, 3).toFixed(3);
}

/** Odds hasil konversi di baris per pilihan */
export function formatOddsConverted(
  odds: number,
  norm: ParlayLegStatus | "D"
): string {
  if (norm === "LH") {
    return "0.5";
  }
  return formatOddsOriginal(odds);
}

/** Odds dalam baris perkalian */
export function formatOddsMultiply(odds: number): string {
  return formatOddsOriginal(odds);
}

export function formatBetCs(amount: number): string {
  const whole = Math.abs(amount - Math.round(amount)) < 1e-9;
  if (whole) {
    return `Rp${Math.round(amount)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
  }
  const truncated = truncateDecimals(amount, 3);
  const [intPart, decPart] = truncated.toFixed(3).split(".");
  return `Rp${intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${decPart}`;
}

export function formatReturnCs(amount: number): string {
  const truncated = truncateDecimals(amount, 1);
  const [intPart, decPart] = truncated.toFixed(1).split(".");
  return `Rp${intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${decPart}`;
}

function formatLegLine(
  originalOdds: number,
  norm: ParlayLegStatus | "D",
  converted: number | null
): string {
  const oddsStr = formatOddsOriginal(originalOdds);
  if (norm === "D") {
    return `Odds ${oddsStr} → DRAW (tidak dihitung)`;
  }
  if (norm === "W") {
    return `Odds ${oddsStr} → WIN = ${formatOddsOriginal(originalOdds)}`;
  }
  if (norm === "WH") {
    return `Odds ${oddsStr} → WIN HALF (WH) = ${formatOddsConverted(converted ?? 0, "WH")}`;
  }
  return `Odds ${oddsStr} → LOSE HALF (LH) = ${formatOddsConverted(0.5, "LH")}`;
}

function buildPenjelasan(legs: ParlayLegResult[]): string {
  const wh = legs.filter((l) => l.status === "WH").length;
  const lh = legs.filter((l) => l.status === "LH").length;
  const draw = legs.filter((l) => l.status === "D").length;
  const win = legs.filter((l) => l.status === "W").length;

  const parts: string[] = [];
  if (win > 0) parts.push(`${win} pilihan WIN`);
  if (wh > 0) parts.push(`${wh} pilihan WH`);
  if (lh > 0) parts.push(`${lh} pilihan LH`);
  if (draw > 0) parts.push(`${draw} pilihan Draw`);

  if (parts.length === 0) {
    return "Tidak ada pilihan valid pada tiket ini bosku.";
  }

  const detail = parts.join(", ");
  let tail =
    " sehingga actual odds menyesuaikan sesuai aturan handicap yang berlaku bosku.";
  if (draw > 0 && wh === 0 && lh === 0 && win > 0) {
    tail =
      " — pilihan Draw tidak ikut perkalian odds sehingga actual odds lebih rendah dari odds awal tiket bosku.";
  } else if (lh > 0 || wh > 0) {
    tail =
      " sehingga actual odds menyesuaikan (WH/LH/Draw) sesuai aturan provider bosku.";
  }

  return `Terdapat ${detail}${tail}`;
}

export function calculateMixParlay(input: ParlayCalcInput): ParlayCalcResult {
  if (!input.legs.length) {
    throw new Error("Minimal 1 pilihan parlay");
  }
  if (input.betAmount <= 0) {
    throw new Error("Bet amount harus lebih dari 0");
  }

  const legResults: ParlayLegResult[] = [];
  const multiplyParts: number[] = [];

  for (let i = 0; i < input.legs.length; i++) {
    const leg = input.legs[i];
    if (leg.odds <= 0) {
      throw new Error(`Odds pilihan ${i + 1} tidak valid`);
    }
    const { converted, norm } = convertOddsPrecise(leg.odds, leg.status);
    const line = formatLegLine(leg.odds, norm, converted);
    legResults.push({
      index: i + 1,
      label: leg.label ?? `Pilihan ${i + 1}`,
      originalOdds: leg.odds,
      status: norm,
      convertedOdds: converted,
      line,
    });
    if (converted !== null) {
      multiplyParts.push(converted);
    }
  }

  const actualOddsFull = multiplyOddsForSettlement(multiplyParts);
  const actualOddsDisplay = roundOddsDisplay(actualOddsFull);
  const returnAmount = input.betAmount * actualOddsFull;
  const returnAmountDisplay = input.betAmount * actualOddsDisplay;

  const multiplyLine =
    multiplyParts.length > 0
      ? multiplyParts.map((o) => formatOddsMultiply(o)).join(" × ")
      : "—";

  const penjelasan = buildPenjelasan(legResults);
  const betInt = Math.round(input.betAmount);
  const betShow =
    Math.abs(input.betAmount - betInt) < 1e-9
      ? String(betInt)
      : String(input.betAmount);

  const ticketBlock = input.ticketId?.trim()
    ? `${input.ticketId.trim()}\n\n`
    : "";

  const memberMessage = `${ticketBlock}NO | ODDS AWAL  | WIN LOSE 

${legResults.map((l) => l.line).join("\n")}

Perhitungan Actual Odds:
${multiplyLine} = ${actualOddsDisplay.toFixed(3)}

Bet : ${formatBetCs(input.betAmount)}
Actual odds : ${actualOddsDisplay.toFixed(3)}

${betShow} × ${actualOddsDisplay.toFixed(3)} = ${formatReturnCs(returnAmountDisplay)}

Penjelasan : ${penjelasan}`;

  return {
    ticketId: input.ticketId?.trim() ?? null,
    betAmount: input.betAmount,
    legs: legResults,
    actualOddsFull,
    actualOddsDisplay,
    returnAmount,
    returnAmountDisplay,
    returnFormatted: formatReturnCs(returnAmountDisplay),
    betFormatted: formatBetCs(input.betAmount),
    memberMessage,
    penjelasan,
  };
}
