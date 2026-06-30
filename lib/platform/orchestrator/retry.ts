import { platformConfig } from "../config";

/**
 * Exponential backoff dengan jitter untuk retry step.
 * attempt=1 → ~baseMs, attempt=2 → ~2x, capped at maxMs.
 */
export function computeRetryDelayMs(
  attempt: number,
  baseMs = platformConfig.retryBackoffBaseMs,
  maxMs = platformConfig.retryBackoffMaxMs
): number {
  const safeAttempt = Math.max(1, attempt);
  const exponential = Math.min(baseMs * 2 ** (safeAttempt - 1), maxMs);
  const jitter = Math.floor(exponential * 0.1 * Math.random());
  return exponential + jitter;
}

export function retryAfterDate(attempt: number, from = Date.now()): Date {
  return new Date(from + computeRetryDelayMs(attempt));
}
