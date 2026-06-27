import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";

config({ path: ".env.local" });

const connectionString = process.env.POSTGRES_URL ?? "";

if (!connectionString) {
  throw new Error(
    "POSTGRES_URL belum di-set — worker autonomous butuh koneksi Neon Postgres."
  );
}

/**
 * Koneksi khusus worker otonom. Sengaja terpisah dari client request
 * Next.js dan TIDAK mengimpor modul `server-only`, agar bisa berjalan
 * di proses tsx standalone (PM2: vandor-agent).
 */
export const sqlClient = postgres(connectionString, {
  max: 4,
  connect_timeout: 30,
  idle_timeout: 30,
  ssl: connectionString.includes("sslmode=disable") ? false : "require",
  prepare: false,
});

export const db = drizzle(sqlClient, { schema });

export { schema };
