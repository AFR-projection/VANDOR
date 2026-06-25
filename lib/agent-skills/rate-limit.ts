import "server-only";

const buckets = new Map<string, { count: number; resetAt: number }>();

export async function checkSkillRateLimit(input: {
  userId: string;
  skillSlug: string;
  limitPerHour: number;
}): Promise<{ allowed: boolean; remaining: number }> {
  const key = `skill:${input.userId}:${input.skillSlug}`;
  const now = Date.now();
  const hourMs = 60 * 60 * 1000;
  const entry = buckets.get(key);

  if (!entry || now >= entry.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + hourMs });
    return { allowed: true, remaining: input.limitPerHour - 1 };
  }

  if (entry.count >= input.limitPerHour) {
    return { allowed: false, remaining: 0 };
  }

  entry.count += 1;
  return { allowed: true, remaining: input.limitPerHour - entry.count };
}
