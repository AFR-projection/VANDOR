import { eq } from "drizzle-orm";
import { agentRule } from "@/lib/db/schema";
import { db } from "./db";
import type { RiskLevel } from "./types";

export type Decision = "allow" | "deny" | "require_approval";

export type RuleVerdict = {
  decision: Decision;
  risk: RiskLevel;
  reason: string;
};

/** Pola destruktif — SELALU ditolak, tidak peduli mode. */
const HARD_DENY: RegExp[] = [
  /\brm\s+-[a-z]*r[a-z]*f|\brm\s+-[a-z]*f[a-z]*r/i,
  /\bmkfs\b/i,
  /\bdd\b\s+if=/i,
  /\b(shutdown|reboot|halt|poweroff|init\s+0|init\s+6)\b/i,
  /:\(\)\s*\{.*\}\s*;/, // fork bomb
  />\s*\/dev\/(sd|nvme|xvd)/i,
  /\bmkswap\b|\bwipefs\b|\bfdisk\b|\bparted\b/i,
  /\b(userdel|deluser|passwd|usermod)\b/i,
  /\bchmod\s+-R\s+777\s+\//i,
  /\bchown\s+-R\b.*\s+\/(\s|$)/i,
  /\b(iptables|ufw)\b.*\b(flush|-F|deny|reject)\b/i,
  /\b(truncate|shred)\b/i,
  /\bgit\s+(push|reset\s+--hard\s+origin)/i,
  /\b(curl|wget)\b.*\|\s*(sh|bash)\b/i, // pipe-to-shell
];

/** Binary + subcommand yang dianggap read-only (aman, auto). */
const READONLY: Record<string, RegExp | true> = {
  df: true,
  free: true,
  uptime: true,
  vmstat: true,
  iostat: true,
  mpstat: true,
  nproc: true,
  uname: true,
  hostname: true,
  whoami: true,
  date: true,
  ls: true,
  cat: true,
  tail: true,
  head: true,
  stat: true,
  du: true,
  ps: true,
  who: true,
  pgrep: true,
  ip: /\b(addr|link|route|-s)\b/,
  ss: true,
  netstat: true,
  systemctl: /\b(is-active|is-enabled|status|list-units|list-timers|show)\b/,
  service: /\bstatus\b/,
  docker: /\b(ps|logs|inspect|stats|images|version|top|df)\b/,
  pm2: /\b(list|jlist|status|describe|logs|info|prettylist)\b/,
  nginx: /-t\b|-T\b|-v\b/,
  redis: true,
  "redis-cli": /\b(ping|info|dbsize|memory)\b/,
  git: /\b(status|log|diff|rev-parse|remote|branch|show|fetch\s+--dry-run)\b/,
  journalctl: true,
  dmesg: true,
};

/** Binary mutasi → butuh approval (mode konservatif). */
const MUTATING: Record<string, RiskLevel> = {
  systemctl: "dangerous",
  service: "dangerous",
  pm2: "moderate",
  docker: "dangerous",
  git: "moderate",
  npm: "moderate",
  pnpm: "moderate",
  yarn: "moderate",
  certbot: "dangerous",
  apt: "dangerous",
  "apt-get": "dangerous",
  nginx: "dangerous",
  kill: "moderate",
  pkill: "dangerous",
};

function firstToken(command: string): string {
  return command.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
}

/** Klasifikasi satu baris perintah shell. */
export function classifyCommand(command: string): RuleVerdict {
  const cmd = command.trim();
  if (!cmd) {
    return { decision: "deny", risk: "safe", reason: "Perintah kosong" };
  }

  for (const re of HARD_DENY) {
    if (re.test(cmd)) {
      return {
        decision: "deny",
        risk: "dangerous",
        reason: `Diblokir oleh rule keamanan (pola destruktif: ${re.source.slice(0, 40)})`,
      };
    }
  }

  const bin = firstToken(cmd);

  const ro = READONLY[bin];
  if (ro === true || (ro instanceof RegExp && ro.test(cmd))) {
    return { decision: "allow", risk: "safe", reason: "Perintah read-only" };
  }

  const mut = MUTATING[bin];
  if (mut) {
    return {
      decision: "require_approval",
      risk: mut,
      reason: `Perintah mutasi '${bin}' — butuh persetujuan`,
    };
  }

  return {
    decision: "require_approval",
    risk: "moderate",
    reason: `Perintah tak dikenal '${bin}' — butuh persetujuan`,
  };
}

/**
 * Terapkan rule DB (AgentRule) di atas hasil klasifikasi statis.
 * Rule dengan prioritas lebih rendah (angka kecil) dievaluasi lebih dulu.
 */
export async function applyDbRules(
  command: string,
  base: RuleVerdict
): Promise<RuleVerdict> {
  let rules: Array<typeof agentRule.$inferSelect>;
  try {
    rules = await db
      .select()
      .from(agentRule)
      .where(eq(agentRule.enabled, true));
  } catch {
    return base;
  }

  const sorted = rules.sort((a, b) => a.priority - b.priority);
  for (const rule of sorted) {
    let re: RegExp;
    try {
      re = new RegExp(rule.pattern, "i");
    } catch {
      continue;
    }
    if (!re.test(command)) {
      continue;
    }
    if (rule.kind === "deny") {
      return {
        decision: "deny",
        risk: rule.riskLevel,
        reason: `Rule '${rule.name}': deny`,
      };
    }
    if (rule.kind === "allow") {
      return {
        decision: "allow",
        risk: rule.riskLevel,
        reason: `Rule '${rule.name}': allow`,
      };
    }
    return {
      decision: "require_approval",
      risk: rule.riskLevel,
      reason: `Rule '${rule.name}': perlu approval`,
    };
  }
  return base;
}

/** Verdict final: klasifikasi statis + rule DB. */
export async function evaluateCommand(command: string): Promise<RuleVerdict> {
  const base = classifyCommand(command);
  if (base.decision === "deny") {
    return base;
  }
  return applyDbRules(command, base);
}

/**
 * Verdict untuk aksi non-shell berdasarkan mode & risiko.
 * Mode konservatif: hanya `safe` yang auto, sisanya butuh approval.
 */
export function evaluateActionByMode(
  risk: RiskLevel,
  _autonomous: boolean
): Decision {
  // Postur konservatif: hanya aksi `safe` yang otomatis; selebihnya approval.
  return risk === "safe" ? "allow" : "require_approval";
}
