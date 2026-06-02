/**
 * IP allowlist. Read from `VANDOR_ALLOWED_IPS` env (comma-separated). Supports:
 *  - Exact IPv4 / IPv6: "203.0.113.42", "2001:db8::1"
 *  - IPv4 CIDR:        "203.0.113.0/24"
 *  - Alias "localhost": expands to 127.0.0.1, ::1, "local"
 *
 * If the env var is empty/unset, no IP restriction is enforced (allow all).
 * Edge-runtime safe (no node:* imports).
 */

export function hasIpAllowlist(): boolean {
  return Boolean(process.env.VANDOR_ALLOWED_IPS?.trim());
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    const v = Number(part);
    if (v < 0 || v > 255) return null;
    n = n * 256 + v;
  }
  return n >>> 0;
}

function matchesCidrV4(ip: string, cidr: string): boolean {
  const slash = cidr.indexOf("/");
  if (slash === -1) return false;
  const base = cidr.slice(0, slash);
  const prefixStr = cidr.slice(slash + 1);
  const prefix = Number(prefixStr);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
  const ipInt = ipv4ToInt(ip);
  const baseInt = ipv4ToInt(base);
  if (ipInt === null || baseInt === null) return false;
  if (prefix === 0) return true;
  const mask = ((0xff_ff_ff_ff << (32 - prefix)) >>> 0) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

function expandToken(token: string): string[] {
  const lower = token.toLowerCase();
  if (lower === "localhost" || lower === "local") {
    return ["127.0.0.1", "::1", "local"];
  }
  return [token];
}

export function isIpAllowed(ip: string): boolean {
  const raw = process.env.VANDOR_ALLOWED_IPS;
  if (!raw) return true;
  const tokens = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (tokens.length === 0) return true;

  const normalizedIp = (ip ?? "").trim();
  if (!normalizedIp) return false;

  for (const token of tokens) {
    for (const value of expandToken(token)) {
      if (value === normalizedIp) return true;
      if (value.includes("/") && matchesCidrV4(normalizedIp, value)) return true;
    }
  }
  return false;
}
