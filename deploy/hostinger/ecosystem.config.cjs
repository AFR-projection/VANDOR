/** @type {import('pm2').StartOptions} */
const fs = require("node:fs");
const path = require("node:path");

const appDir = process.env.VANDOR_APP_DIR || "/var/www/vandor";

/** Parse .env.local → object (PM2 tidak auto-load file ini). */
function loadEnvLocal(dir) {
  const envPath = path.join(dir, ".env.local");
  const out = {};
  if (!fs.existsSync(envPath)) {
    return out;
  }
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const fileEnv = loadEnvLocal(appDir);

/** Env bersama — worker & web HARUS punya secret yang sama. */
const sharedEnv = {
  ...fileEnv,
  NODE_ENV: "production",
  PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
};

module.exports = {
  apps: [
    {
      name: "vandor",
      cwd: appDir,
      script: "node_modules/next/dist/bin/next",
      args: "start",
      interpreter: "none",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "1800M",
      kill_timeout: 10_000,
      env: {
        ...sharedEnv,
        PORT: fileEnv.PORT || "3000",
        VANDOR_PREFER_YTDLP: "1",
      },
      error_file: "/var/log/vandor-error.log",
      out_file: "/var/log/vandor-out.log",
      merge_logs: true,
      time: true,
    },
    {
      name: "vandor-agent",
      cwd: appDir,
      script: "node_modules/tsx/dist/cli.mjs",
      args: "lib/autonomous/worker.ts",
      interpreter: "node",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "600M",
      kill_timeout: 12_000,
      env: {
        ...sharedEnv,
      },
      error_file: "/var/log/vandor-agent-error.log",
      out_file: "/var/log/vandor-agent-out.log",
      merge_logs: true,
      time: true,
    },
  ],
};
