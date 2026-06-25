import "server-only";

import { getApiKeyValue } from "./queries";
import type {
  DatabaseSkillConfig,
  HttpApiSkillConfig,
  SkillExecutionContext,
  SkillExecutionResult,
} from "./types";

const READ_ONLY_SQL =
  /^\s*(SELECT|WITH|SHOW|DESCRIBE|EXPLAIN)\b/i;

function isReadOnlySql(sql: string): boolean {
  const trimmed = sql.trim();
  if (!READ_ONLY_SQL.test(trimmed)) {
    return false;
  }
  const forbidden =
    /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE)\b/i;
  return !forbidden.test(trimmed);
}

function extractTables(sql: string): string[] {
  const tables: string[] = [];
  const fromRe = /\bFROM\s+([a-zA-Z_][\w.]*)/gi;
  const joinRe = /\bJOIN\s+([a-zA-Z_][\w.]*)/gi;
  let m = fromRe.exec(sql);
  while (m) {
    tables.push(m[1].split(".").pop()?.toLowerCase() ?? m[1].toLowerCase());
    m = fromRe.exec(sql);
  }
  m = joinRe.exec(sql);
  while (m) {
    tables.push(m[1].split(".").pop()?.toLowerCase() ?? m[1].toLowerCase());
    m = joinRe.exec(sql);
  }
  return tables;
}

export async function executeHttpApiSkill(
  config: HttpApiSkillConfig,
  params: Record<string, unknown>,
  ctx: SkillExecutionContext
): Promise<SkillExecutionResult> {
  const started = Date.now();
  try {
    let url = config.endpoint;
    const headers: Record<string, string> = { ...(config.headers ?? {}) };
    const bodyParams: Record<string, unknown> = {};
    const queryParams = new URLSearchParams();

    for (const [key, def] of Object.entries(config.parameters ?? {})) {
      const value = params[key];
      if (value === undefined || value === null) {
        if (def.required) {
          return {
            ok: false,
            error: `Parameter '${key}' wajib diisi`,
            executionTimeMs: Date.now() - started,
          };
        }
        continue;
      }
      const placement = def.in ?? (config.method === "GET" ? "query" : "body");
      if (placement === "query") {
        queryParams.set(key, String(value));
      } else if (placement === "header") {
        headers[key] = String(value);
      } else if (placement === "path") {
        url = url.replace(`{${key}}`, encodeURIComponent(String(value)));
      } else {
        bodyParams[key] = value;
      }
    }

    if (config.auth && config.auth.type !== "none" && config.auth.apiKeyId) {
      const secret = await getApiKeyValue(ctx.userId, config.auth.apiKeyId);
      if (!secret) {
        return {
          ok: false,
          error: "API key tidak ditemukan",
          executionTimeMs: Date.now() - started,
        };
      }
      if (config.auth.type === "bearer") {
        headers.Authorization = `Bearer ${secret}`;
      } else if (config.auth.type === "basic") {
        headers.Authorization = `Basic ${Buffer.from(secret).toString("base64")}`;
      } else if (config.auth.type === "api_key") {
        const headerName = config.auth.headerName ?? "X-API-Key";
        headers[headerName] = secret;
      }
    }

    const qs = queryParams.toString();
    if (qs) {
      url += url.includes("?") ? `&${qs}` : `?${qs}`;
    }

    const init: RequestInit = {
      method: config.method,
      headers,
      signal: AbortSignal.timeout(30_000),
    };

    if (config.method !== "GET" && config.method !== "DELETE") {
      const body =
        Object.keys(bodyParams).length > 0
          ? bodyParams
          : (config.bodyTemplate ?? {});
      init.headers = {
        ...headers,
        "Content-Type": headers["Content-Type"] ?? "application/json",
      };
      init.body = JSON.stringify(body);
    }

    const res = await fetch(url, init);
    const text = await res.text();
    let data: unknown = text;
    try {
      data = JSON.parse(text);
    } catch {
      // keep text
    }

    if (!res.ok) {
      return {
        ok: false,
        error: `HTTP ${res.status}: ${text.slice(0, 500)}`,
        data,
        executionTimeMs: Date.now() - started,
      };
    }

    return { ok: true, data, executionTimeMs: Date.now() - started };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Request gagal",
      executionTimeMs: Date.now() - started,
    };
  }
}

export async function executeDatabaseSkill(
  config: DatabaseSkillConfig,
  params: Record<string, unknown>,
  ctx: SkillExecutionContext
): Promise<SkillExecutionResult> {
  const started = Date.now();
  const sql = String(params.query ?? "").trim();
  if (!sql) {
    return {
      ok: false,
      error: "Parameter 'query' wajib berisi SQL SELECT",
      executionTimeMs: Date.now() - started,
    };
  }

  if (config.readOnly !== false && !isReadOnlySql(sql)) {
    return {
      ok: false,
      error: "Hanya query read-only (SELECT/WITH/SHOW) yang diizinkan",
      executionTimeMs: Date.now() - started,
    };
  }

  if (config.allowedTables?.length) {
    const used = extractTables(sql);
    const allowed = new Set(config.allowedTables.map((t) => t.toLowerCase()));
    for (const t of used) {
      if (!allowed.has(t)) {
        return {
          ok: false,
          error: `Akses tabel '${t}' tidak diizinkan`,
          executionTimeMs: Date.now() - started,
        };
      }
    }
  }

  const connStr = await getApiKeyValue(ctx.userId, config.connectionApiKeyId);
  if (!connStr) {
    return {
      ok: false,
      error: "Connection string tidak ditemukan",
      executionTimeMs: Date.now() - started,
    };
  }

  const maxRows = config.maxRows ?? 100;

  try {
    if (config.engine === "postgresql") {
      const postgres = (await import("postgres")).default;
      const sqlClient = postgres(connStr, { prepare: false, max: 1 });
      try {
        const rows = await sqlClient.unsafe(`${sql} LIMIT ${maxRows}`);
        return {
          ok: true,
          data: { rows, rowCount: rows.length },
          executionTimeMs: Date.now() - started,
        };
      } finally {
        await sqlClient.end({ timeout: 5 });
      }
    }

    const mysql = await import("mysql2/promise");
    const conn = await mysql.createConnection(connStr);
    try {
      const [rows] = await conn.query(`${sql} LIMIT ${maxRows}`);
      return {
        ok: true,
        data: { rows, rowCount: Array.isArray(rows) ? rows.length : 0 },
        executionTimeMs: Date.now() - started,
      };
    } finally {
      await conn.end();
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Query gagal",
      executionTimeMs: Date.now() - started,
    };
  }
}
