/**
 * Verify Cloudflare R2 connectivity for vault encrypted blobs.
 * Usage: npx tsx scripts/verify-vault-r2.ts
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { AwsClient } from "aws4fetch";
import { config } from "dotenv";

config({ path: ".env.local" });

const REQUIRED = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
  "AUTH_SECRET",
  "POSTGRES_URL",
] as const;

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function ok(msg: string) {
  console.log(`OK: ${msg}`);
}

function encryptSample(plaintext: Buffer) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) fail("AUTH_SECRET missing");
  const key = createHash("sha256").update(secret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext, iv, tag };
}

function decryptSample(ciphertext: Buffer, iv: Buffer, tag: Buffer): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) fail("AUTH_SECRET missing");
  const key = createHash("sha256").update(secret).digest();
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

async function main() {
  console.log("=== VANDOR Vault R2 verification ===\n");

  for (const name of REQUIRED) {
    if (!process.env[name]?.trim()) {
      fail(`${name} not set in .env.local`);
    }
  }
  ok("All required env vars present");

  const accountId = process.env.R2_ACCOUNT_ID!.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID!.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY!.trim();
  const bucket = process.env.R2_BUCKET_NAME!.trim();

  ok(`Bucket: ${bucket} (account configured)`);

  const client = new AwsClient({ accessKeyId, secretAccessKey });
  const testKey = `vault/__healthcheck__/${Date.now()}.enc`;
  const endpoint = `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${testKey}`;

  const sample = Buffer.from("vandor-vault-r2-healthcheck", "utf8");
  const { ciphertext, iv, tag } = encryptSample(sample);

  const putRes = await client.fetch(endpoint, {
    method: "PUT",
    body: new Uint8Array(ciphertext),
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(ciphertext.byteLength),
    },
  });

  if (!putRes.ok) {
    const body = await putRes.text().catch(() => "");
    fail(`R2 PUT ${putRes.status}: ${body.slice(0, 300)}`);
  }
  ok(`R2 upload (${ciphertext.byteLength} bytes encrypted blob)`);

  const getRes = await client.fetch(endpoint, { method: "GET" });
  if (!getRes.ok) {
    fail(`R2 GET ${getRes.status}`);
  }
  const fetched = Buffer.from(await getRes.arrayBuffer());
  if (!fetched.equals(ciphertext)) {
    fail("R2 GET returned different bytes than uploaded");
  }
  ok("R2 download matches upload");

  const decrypted = decryptSample(fetched, iv, tag);
  if (!decrypted.equals(sample)) {
    fail("AES-256-GCM decrypt mismatch after R2 roundtrip");
  }
  ok("AES-256-GCM encrypt/decrypt roundtrip via R2");

  const delRes = await client.fetch(endpoint, { method: "DELETE" });
  if (!delRes.ok && delRes.status !== 404) {
    fail(`R2 DELETE ${delRes.status}`);
  }
  ok("R2 cleanup delete succeeded");

  // Check existing vault rows backend mix
  const postgres = (await import("postgres")).default;
  const sql = postgres(process.env.POSTGRES_URL!, { prepare: false });
  try {
    const rows = await sql<{ storageBackend: string; count: number }[]>`
      SELECT "storageBackend", count(*)::int AS count
      FROM "VaultFile"
      GROUP BY "storageBackend"
    `;
    if (rows.length === 0) {
      ok("No vault files in Neon yet — new uploads will use R2");
    } else {
      console.log("\nVault files by backend in Neon:");
      for (const row of rows) {
        console.log(`  - ${row.storageBackend}: ${row.count} file(s)`);
      }
      const localCount =
        rows.find((r) => r.storageBackend === "local")?.count ?? 0;
      if (localCount > 0) {
        console.warn(
          `\nWARN: ${localCount} file(s) still on local disk (uploaded before R2). They remain readable; new uploads use R2.`
        );
      }
    }
  } finally {
    await sql.end();
  }

  console.log("\n=== All checks passed — vault R2 is ready ===");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
