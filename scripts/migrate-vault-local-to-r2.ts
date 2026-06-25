/**
 * Move vault blobs from local disk to R2 (metadata row updated in Neon).
 * Usage: npx tsx scripts/migrate-vault-local-to-r2.ts
 */
import { config } from "dotenv";
import { readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { AwsClient } from "aws4fetch";

config({ path: ".env.local" });

const LOCAL_VAULT_DIR = path.join(process.cwd(), "data", "vault");

function localPath(key: string): string {
  return path.join(LOCAL_VAULT_DIR, key.replace(/\//g, path.sep));
}

async function putR2(key: string, data: Buffer): Promise<void> {
  const accountId = process.env.R2_ACCOUNT_ID!.trim();
  const bucket = process.env.R2_BUCKET_NAME!.trim();
  const client = new AwsClient({
    accessKeyId: process.env.R2_ACCESS_KEY_ID!.trim(),
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!.trim(),
  });
  const endpoint = `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key}`;
  const res = await client.fetch(endpoint, {
    method: "PUT",
    body: new Uint8Array(data),
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(data.byteLength),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`R2 PUT failed (${res.status}): ${text.slice(0, 200)}`);
  }
}

async function main() {
  if (!process.env.POSTGRES_URL) {
    throw new Error("POSTGRES_URL required");
  }
  for (const key of [
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET_NAME",
  ]) {
    if (!process.env[key]?.trim()) {
      throw new Error(`${key} not set`);
    }
  }

  const postgres = (await import("postgres")).default;
  const sql = postgres(process.env.POSTGRES_URL, { prepare: false });

  try {
    const rows = await sql<
      {
        id: string;
        r2Key: string;
        fileName: string;
      }[]
    >`
      SELECT id, "r2Key", "fileName"
      FROM "VaultFile"
      WHERE "storageBackend" = 'local'
    `;

    if (rows.length === 0) {
      console.log("No local vault files to migrate.");
      return;
    }

    console.log(`Migrating ${rows.length} file(s) to R2...`);

    for (const row of rows) {
      const full = localPath(row.r2Key);
      const data = await readFile(full);
      await putR2(row.r2Key, data);
      await sql`
        UPDATE "VaultFile"
        SET "storageBackend" = 'r2', "updatedAt" = now()
        WHERE id = ${row.id}::uuid
      `;
      try {
        await unlink(full);
      } catch {
        /* already gone */
      }
      console.log(`  OK: ${row.fileName} (${row.id})`);
    }

    console.log("Migration complete.");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
