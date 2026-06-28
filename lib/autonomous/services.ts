import { autonomousConfig } from "./config";
import { sqlClient } from "./db";
import { commandExists, execCommand } from "./shell-exec";

export type ServiceStatus = {
  name: string;
  kind: "systemd" | "pm2" | "docker" | "redis" | "postgres";
  healthy: boolean;
  state: string;
  detail?: string;
};

export async function checkSystemdService(
  unit: string
): Promise<ServiceStatus | null> {
  const res = await execCommand("systemctl", ["is-active", unit], {
    timeoutMs: 6000,
  });
  const combined = `${res.stdout}\n${res.stderr}`.trim();
  const state = (res.stdout || res.stderr).trim() || "unknown";

  if (
    combined.includes("could not be found") ||
    combined.includes("not-found") ||
    combined.includes("Failed to get unit")
  ) {
    return null;
  }

  return {
    name: unit,
    kind: "systemd",
    healthy: state === "active",
    state,
  };
}

export async function checkPm2(): Promise<ServiceStatus[]> {
  if (!(await commandExists("pm2"))) {
    return [];
  }
  const res = await execCommand("pm2", ["jlist"], { timeoutMs: 8000 });
  if (!res.ok) {
    return [];
  }
  try {
    const list = JSON.parse(res.stdout) as Array<{
      name: string;
      pm2_env?: { status?: string; restart_time?: number };
      monit?: { cpu?: number; memory?: number };
    }>;
    return list.map((p) => {
      const state = p.pm2_env?.status ?? "unknown";
      const memMb = p.monit?.memory
        ? Math.round(p.monit.memory / 1024 / 1024)
        : 0;
      return {
        name: p.name,
        kind: "pm2" as const,
        healthy: state === "online",
        state,
        detail: `cpu=${p.monit?.cpu ?? 0}% mem=${memMb}MB restarts=${p.pm2_env?.restart_time ?? 0}`,
      };
    });
  } catch {
    return [];
  }
}

export async function checkDocker(): Promise<ServiceStatus[]> {
  if (!(await commandExists("docker"))) {
    return [];
  }
  const res = await execCommand(
    "docker",
    ["ps", "-a", "--format", "{{.Names}}|{{.State}}|{{.Status}}"],
    { timeoutMs: 8000 }
  );
  if (!res.ok) {
    return [];
  }
  const wanted = new Set(autonomousConfig.dockerContainers);
  return res.stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [name, state, status] = line.split("|");
      return { name, state, status };
    })
    .filter((c) => wanted.size === 0 || wanted.has(c.name))
    .map((c) => ({
      name: c.name,
      kind: "docker" as const,
      healthy: c.state === "running",
      state: c.state,
      detail: c.status,
    }));
}

export async function checkRedis(): Promise<ServiceStatus | null> {
  if (!(await commandExists("redis-cli"))) {
    return null;
  }
  const res = await execCommand("redis-cli", ["ping"], { timeoutMs: 5000 });
  const pong = res.stdout.trim().toUpperCase() === "PONG";
  return {
    name: "redis",
    kind: "redis",
    healthy: pong,
    state: pong ? "PONG" : "no-response",
  };
}

export async function checkPostgres(): Promise<ServiceStatus> {
  try {
    const started = Date.now();
    await sqlClient`SELECT 1`;
    return {
      name: "postgres",
      kind: "postgres",
      healthy: true,
      state: "reachable",
      detail: `${Date.now() - started}ms`,
    };
  } catch (error) {
    return {
      name: "postgres",
      kind: "postgres",
      healthy: false,
      state: "unreachable",
      detail: error instanceof Error ? error.message.slice(0, 200) : "error",
    };
  }
}

/** Kumpulkan status seluruh service yang dipantau (paralel). */
export async function collectServiceHealth(): Promise<ServiceStatus[]> {
  const tasks: Promise<ServiceStatus | ServiceStatus[] | null>[] = [
    ...autonomousConfig.monitoredServices.map((unit) =>
      checkSystemdService(unit)
    ),
    checkPm2(),
    checkDocker(),
    checkRedis(),
    checkPostgres(),
  ];

  const results = await Promise.all(tasks);
  const flat: ServiceStatus[] = [];
  for (const r of results) {
    if (r == null) {
      continue;
    }
    if (Array.isArray(r)) {
      flat.push(...r.filter((s): s is ServiceStatus => s != null));
    } else {
      flat.push(r);
    }
  }

  const pm2Names = new Set(autonomousConfig.pm2Processes);
  return flat.filter((svc) => {
    if (svc.kind !== "pm2") {
      return true;
    }
    if (pm2Names.size === 0) {
      return true;
    }
    return pm2Names.has(svc.name);
  });
}
