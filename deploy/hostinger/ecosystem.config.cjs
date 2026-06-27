/** @type {import('pm2').StartOptions} */
const appDir = process.env.VANDOR_APP_DIR || "/var/www/vandor";

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
        NODE_ENV: "production",
        PORT: "3000",
        PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
        VANDOR_PREFER_YTDLP: "1",
      },
      error_file: "/var/log/vandor-error.log",
      out_file: "/var/log/vandor-out.log",
      merge_logs: true,
      time: true,
    },
    {
      // Otak otonom 24/7 (VANDOR Autonomous — Fase 0).
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
        NODE_ENV: "production",
        PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
      },
      error_file: "/var/log/vandor-agent-error.log",
      out_file: "/var/log/vandor-agent-out.log",
      merge_logs: true,
      time: true,
    },
  ],
};
