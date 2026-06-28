/** Evaluasi cron 5-field sederhana (menit jam dom bulan dow). */

function matchField(field: string, value: number): boolean {
  if (field === "*") {
    return true;
  }
  if (field.startsWith("*/")) {
    const step = Number.parseInt(field.slice(2), 10);
    return Number.isFinite(step) && step > 0 && value % step === 0;
  }
  if (field.includes(",")) {
    return field.split(",").some((part) => {
      const n = Number.parseInt(part.trim(), 10);
      return Number.isFinite(n) && n === value;
    });
  }
  const exact = Number.parseInt(field, 10);
  return Number.isFinite(exact) && exact === value;
}

/**
 * Apakah ekspresi cron due pada `now`?
 * Minimal sekali per menit (debounce via lastRunAt).
 */
export function isCronDue(
  expression: string,
  lastRunAt: Date | null,
  now = new Date()
): boolean {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    return false;
  }

  const [min, hour, dom, month, dow] = parts;
  const m = now.getMinutes();
  const h = now.getHours();
  const d = now.getDate();
  const mo = now.getMonth() + 1;
  const w = now.getDay();

  if (
    !matchField(min, m) ||
    !matchField(hour, h) ||
    !matchField(dom, d) ||
    !matchField(month, mo) ||
    !matchField(dow, w)
  ) {
    return false;
  }

  if (!lastRunAt) {
    return true;
  }
  return now.getTime() - lastRunAt.getTime() >= 55_000;
}
