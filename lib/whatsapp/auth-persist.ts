import "server-only";

import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { userSecrets } from "@/lib/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/security/crypto";

type AuthFileMap = Record<string, string>;

const client = postgres(process.env.POSTGRES_URL ?? "", { prepare: false });
const db = drizzle(client);

async function readAuthBlob(userId: string): Promise<AuthFileMap | null> {
  const rows = await db
    .select({ whatsappAuthEnc: userSecrets.whatsappAuthEnc })
    .from(userSecrets)
    .where(eq(userSecrets.userId, userId))
    .limit(1);
  const enc = rows.at(0)?.whatsappAuthEnc;
  if (!enc) {
    return null;
  }
  const dec = decryptSecret(enc);
  if (!dec) {
    return null;
  }
  try {
    const parsed = JSON.parse(dec) as Record<string, unknown>;
    const out: AuthFileMap = {};
    for (const [name, value] of Object.entries(parsed)) {
      if (typeof value === "string" && name.length > 0) {
        out[name] = value;
      }
    }
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}

export async function hasPersistedWhatsappAuth(userId: string): Promise<boolean> {
  const blob = await readAuthBlob(userId);
  return Boolean(blob?.["creds.json"]);
}

/** Restore encrypted auth files into a writable directory for Baileys. */
export async function hydrateAuthDir(dir: string, userId: string): Promise<boolean> {
  await mkdir(dir, { recursive: true });
  const blob = await readAuthBlob(userId);
  if (!blob) {
    return false;
  }
  for (const [name, content] of Object.entries(blob)) {
    await writeFile(path.join(dir, name), content, "utf8");
  }
  return true;
}

/** Snapshot auth directory back into encrypted Postgres storage. */
export async function persistAuthDir(dir: string, userId: string): Promise<void> {
  const entries = await readdir(dir).catch(() => [] as string[]);
  const blob: AuthFileMap = {};

  for (const name of entries) {
    const filePath = path.join(dir, name);
    const info = await stat(filePath).catch(() => null);
    if (!info?.isFile()) {
      continue;
    }
    blob[name] = await readFile(filePath, "utf8");
  }

  if (Object.keys(blob).length === 0) {
    return;
  }

  const whatsappAuthEnc = encryptSecret(JSON.stringify(blob));
  await db
    .insert(userSecrets)
    .values({
      userId,
      whatsappAuthEnc,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: userSecrets.userId,
      set: {
        whatsappAuthEnc,
        updatedAt: new Date(),
      },
    });
}

export async function clearPersistedWhatsappAuth(userId: string): Promise<void> {
  await db
    .update(userSecrets)
    .set({ whatsappAuthEnc: null, updatedAt: new Date() })
    .where(eq(userSecrets.userId, userId));
}

export async function wipeAuthDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true }).catch(() => {
    // ignore
  });
}
