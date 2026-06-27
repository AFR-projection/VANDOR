#!/usr/bin/env bash
# Test koneksi VPS → Neon Postgres
set -euo pipefail
cd "${VANDOR_APP_DIR:-/var/www/vandor}"

if [[ ! -f .env.local ]]; then
  echo "ERROR: .env.local tidak ada"
  exit 1
fi

node <<'NODE'
import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });

const url = process.env.POSTGRES_URL?.trim();
if (!url) {
  console.error("ERROR: POSTGRES_URL kosong di .env.local");
  process.exit(1);
}

let host = "?";
try {
  host = new URL(url).hostname;
} catch {
  console.error("ERROR: POSTGRES_URL bukan URL valid");
  process.exit(1);
}

console.log("Host Neon:", host);
console.log("Mencoba connect (timeout 30s)...");

const sql = postgres(url, {
  max: 1,
  connect_timeout: 30,
  ssl: "require",
  prepare: false,
});

try {
  const rows = await sql`SELECT 1 AS ok`;
  console.log("OK — database reachable:", rows[0]);
  await sql.end();
  process.exit(0);
} catch (err) {
  console.error("GAGAL —", err instanceof Error ? err.message : err);
  console.error("");
  console.error("Cek:");
  console.error("  1. Neon → Project → Settings → IP Allow → tambah IP VPS atau Allow all");
  console.error("  2. POSTGRES_URL harus dari Neon (pooler, ?sslmode=require)");
  console.error("  3. nc -zv", host, "5432");
  await sql.end({ timeout: 1 }).catch(() => {});
  process.exit(1);
}
NODE
