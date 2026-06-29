import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";

config({ path: ".env.local" });

function connectionString(): string {
  return process.env.POSTGRES_URL ?? "";
}

let sqlClient: ReturnType<typeof postgres> | null = null;
let drizzleDb: ReturnType<typeof drizzle<typeof schema>> | null = null;

function createDb() {
  const url = connectionString();
  if (!url) {
    throw new Error(
      "POSTGRES_URL belum di-set — platform V2 butuh koneksi Neon Postgres."
    );
  }
  sqlClient = postgres(url, {
    max: 4,
    connect_timeout: 30,
    idle_timeout: 30,
    ssl: url.includes("sslmode=disable") ? false : "require",
    prepare: false,
  });
  drizzleDb = drizzle(sqlClient, { schema });
  return drizzleDb;
}

/** Lazy DB client — aman dipanggil dari API route & worker standalone. */
export function getPlatformDb() {
  if (drizzleDb) {
    return drizzleDb;
  }
  return createDb();
}

export { schema };
