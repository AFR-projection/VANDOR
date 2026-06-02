import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({
  path: ".env.local",
});

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    // Neon: postgresql://...@ep-xxx.neon.tech/neondb?sslmode=require
    url: process.env.POSTGRES_URL ?? "",
  },
});
