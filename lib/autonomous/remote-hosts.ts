import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { autonomousConfig } from "./config";
import { emitEvent } from "./events";
import { enqueueTask } from "./tasks";

const execFileAsync = promisify(execFile);

export type RemoteHost = {
  name: string;
  host: string;
  user: string;
  port?: number;
};

function parseRemoteHostsEnv(): RemoteHost[] {
  const raw = process.env.VANDOR_AGENT_REMOTE_HOSTS;
  if (!raw?.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter(
        (h): h is RemoteHost =>
          typeof h === "object" &&
          h !== null &&
          typeof (h as RemoteHost).name === "string" &&
          typeof (h as RemoteHost).host === "string" &&
          typeof (h as RemoteHost).user === "string"
      )
      .slice(0, 10);
  } catch {
    return [];
  }
}

export function getRemoteHosts(): RemoteHost[] {
  return parseRemoteHostsEnv();
}

/** SSH health check read-only (uptime + load). */
export async function checkRemoteHost(
  host: RemoteHost
): Promise<{ ok: boolean; detail: string }> {
  const port = host.port ?? 22;
  const cmd = [
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=8",
    "-o",
    "StrictHostKeyChecking=accept-new",
    "-p",
    String(port),
    `${host.user}@${host.host}`,
    "uptime && free -m | head -2",
  ];

  try {
    const { stdout } = await execFileAsync("ssh", cmd, {
      timeout: 15_000,
      maxBuffer: 64_000,
    });
    return { ok: true, detail: stdout.trim().slice(0, 400) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, detail: message.slice(0, 400) };
  }
}

/** Cek semua host remote dari env; emit event bila down. */
export async function runRemoteHealthChecks(): Promise<number> {
  const hosts = getRemoteHosts();
  if (hosts.length === 0) {
    return 0;
  }

  let down = 0;
  for (const host of hosts) {
    // biome-ignore lint/nursery/noAwaitInLoop: host terbatas
    const result = await checkRemoteHost(host);
    if (!result.ok) {
      down += 1;
      // biome-ignore lint/nursery/noAwaitInLoop: event berurutan
      await emitEvent({
        type: "remote-host-down",
        severity: "error",
        source: "remote",
        message: `Remote ${host.name} (${host.host}) tidak terjangkau`,
        payload: { host: host.name, detail: result.detail },
      });
    }
  }
  return down;
}

/** Enqueue health check remote jika inventory ada. */
export async function scheduleRemoteChecksIfConfigured(): Promise<void> {
  if (getRemoteHosts().length === 0) {
    return;
  }
  await enqueueTask({
    type: "remote_health",
    title: "Scheduled: remote SSH health",
    priority: 5,
    dedupe: true,
  });
}
