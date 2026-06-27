export type UptimeResult = {
  url: string;
  up: boolean;
  status: number | null;
  latencyMs: number | null;
  error?: string;
};

export async function checkUrl(
  url: string,
  timeoutMs = 10_000
): Promise<UptimeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "VANDOR-Autonomous/1.0" },
    });
    const latencyMs = Date.now() - started;
    return {
      url,
      up: res.status < 500,
      status: res.status,
      latencyMs,
    };
  } catch (error) {
    return {
      url,
      up: false,
      status: null,
      latencyMs: null,
      error: error instanceof Error ? error.message : "fetch failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

export function checkUrls(urls: string[]): Promise<UptimeResult[]> {
  return Promise.all(urls.map((u) => checkUrl(u)));
}
