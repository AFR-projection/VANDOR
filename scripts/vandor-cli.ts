#!/usr/bin/env npx tsx
/**
 * VANDOR Agent CLI — terminal nyata di VPS.
 *
 * Usage:
 *   npm run agent:cli -- status
 *   npm run agent:cli -- scan
 *   npm run agent:cli -- scan --build
 *   npm run agent:cli -- exec "pm2 jlist"
 *   npm run agent:cli -- fix
 *   npm run agent:cli -- tick
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

import { analyzeCodeScan } from "../lib/autonomous/coding-agent/analyze";
import { runCodeScan } from "../lib/autonomous/coding-agent/scan";
import {
  runCliCommand,
  runStatusSnapshot,
} from "../lib/autonomous/cli/runner";
import { runTick } from "../lib/autonomous/loop";
import { listTerminalLogs } from "../lib/autonomous/terminal-log";

const args = process.argv.slice(2);
const command = args[0] ?? "help";
const echo = !args.includes("--quiet");

function printHelp(): void {
  process.stdout.write(`
VANDOR Agent CLI — akses terminal nyata ke VPS

  status          Snapshot PM2, git, disk, ping
  scan            TypeScript + linter (+ --build untuk npm run build)
  fix             Analisis error scan terakhir (LLM)
  exec "<cmd>"    Jalankan perintah shell (log ke DB)
  logs            Tampilkan 50 baris terminal log terakhir
  tick            Satu siklus OODA worker
  help            Bantuan

Contoh di VPS:
  cd /var/www/vandor && npm run agent:cli -- status
  cd /var/www/vandor && npm run agent:cli -- scan --build

`);
}

async function main(): Promise<void> {
  switch (command) {
    case "help":
    case "-h":
    case "--help": {
      printHelp();
      break;
    }
    case "status": {
      process.stdout.write("=== VANDOR Status Snapshot ===\n");
      const res = await runStatusSnapshot({ echo: true });
      process.stdout.write(
        `\nSession: ${res.sessionId} | ok=${res.ok}\n`
      );
      break;
    }
    case "scan": {
      const fullBuild = args.includes("--build");
      process.stdout.write(
        `=== Code Scan ${fullBuild ? "(+ build)" : ""} ===\n`
      );
      const scan = await runCodeScan({ echo, fullBuild });
      process.stdout.write(`\n${scan.summary}\n`);
      process.stdout.write(`Session: ${scan.sessionId}\n`);
      if (!scan.ok) {
        process.exitCode = 1;
      }
      break;
    }
    case "fix": {
      process.stdout.write("=== Coding Agent — Analisis ===\n");
      const scan = await runCodeScan({ echo: false, fullBuild: false });
      const analysis = await analyzeCodeScan(scan);
      process.stdout.write(`\n${analysis.diagnosis}\n\n`);
      if (analysis.suggestedCommands.length > 0) {
        process.stdout.write("Perintah yang disarankan (butuh approval):\n");
        for (const [i, cmd] of analysis.suggestedCommands.entries()) {
          process.stdout.write(`  ${i + 1}. ${cmd}\n`);
        }
      }
      break;
    }
    case "exec": {
      const cmd = args[1];
      if (!cmd) {
        process.stderr.write('Usage: agent:cli exec "pm2 jlist"\n');
        process.exitCode = 1;
        break;
      }
      const res = await runCliCommand(cmd, { echo: true });
      process.stdout.write(`\nSession: ${res.sessionId} exit=${res.exitCode}\n`);
      if (!res.ok) {
        process.exitCode = 1;
      }
      break;
    }
    case "logs": {
      const rows = await listTerminalLogs({ limit: 50 });
      const chronological = [...rows].reverse();
      for (const row of chronological) {
        const prefix =
          row.level === "cmd"
            ? "$"
            : row.level === "stderr" || row.level === "error"
              ? "!"
              : " ";
        process.stdout.write(
          `${prefix} [${row.stream}] ${row.line.slice(0, 200)}\n`
        );
      }
      break;
    }
    case "tick": {
      process.stdout.write("=== OODA Tick ===\n");
      await runTick();
      process.stdout.write("Tick selesai.\n");
      break;
    }
    default: {
      process.stderr.write(`Perintah tidak dikenal: ${command}\n`);
      printHelp();
      process.exitCode = 1;
    }
  }
}

main().catch((error) => {
  process.stderr.write(
    `Fatal: ${error instanceof Error ? error.message : String(error)}\n`
  );
  process.exit(1);
});
