#!/usr/bin/env node
/**
 * Paste Netscape cookies.txt → satu baris YOUTUBE_COOKIE untuk .env.local / Vercel.
 *
 * Usage:
 *   1. Paste export extension ke cookies/youtube.txt
 *   2. node scripts/youtube-cookie-to-env.mjs
 *   3. Copy output ke .env.local atau Vercel
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const defaultFile = path.join(process.cwd(), "cookies", "youtube.txt");
const inputPath = process.argv[2] ? path.resolve(process.argv[2]) : defaultFile;

if (!existsSync(inputPath)) {
  console.error(`File tidak ada: ${inputPath}`);
  console.error("");
  console.error("Langkah:");
  console.error("  1. Buat folder cookies/ (sudah ada)");
  console.error("  2. Paste isi Get cookies.txt LOCALLY ke cookies/youtube.txt");
  console.error("  3. Jalankan lagi: node scripts/youtube-cookie-to-env.mjs");
  process.exit(1);
}

function normalizeYoutubeCookie(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  if (
    trimmed.includes("# Netscape HTTP Cookie File") ||
    trimmed.includes("\t.youtube.com\t")
  ) {
    const pairs = [];
    for (const line of trimmed.split("\n")) {
      if (!line.trim() || line.startsWith("#")) continue;
      const parts = line.split("\t");
      if (parts.length >= 7) {
        const name = parts[5]?.trim();
        const value = parts[6]?.trim();
        if (name && value) pairs.push(`${name}=${value}`);
      }
    }
    return pairs.join("; ");
  }

  return trimmed;
}

const raw = readFileSync(inputPath, "utf8");
const header = normalizeYoutubeCookie(raw);

if (!header || header.length < 20) {
  console.error("Cookie kosong atau format tidak dikenali.");
  process.exit(1);
}

console.log("# ── Copy ke .env.local (pilih salah satu) ──");
console.log("");
console.log("# Opsi A — file (disarankan local):");
console.log("YOUTUBE_COOKIE_FILE=cookies/youtube.txt");
console.log("");
console.log("# Opsi B — satu baris (untuk Vercel Environment Variables):");
console.log(`YOUTUBE_COOKIE=${JSON.stringify(header)}`);
console.log("");
console.log(`# Panjang: ${header.length} karakter, ~${header.split(";").length} cookie`);
