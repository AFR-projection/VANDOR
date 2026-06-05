import "server-only";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { userSecrets } from "@/lib/db/schema";
import {
  decryptSecret,
  encryptSecret,
  maskSecret,
} from "@/lib/security/crypto";
import { hashNumpadPin } from "@/lib/security/pin-hash";

const client = postgres(process.env.POSTGRES_URL ?? "", { prepare: false });
const db = drizzle(client);

export type SecretsPublicView = {
  openrouter: {
    configured: boolean;
    masked: string | null;
    source: "database" | "env" | "none";
  };
  tavily: {
    configured: boolean;
    masked: string | null;
    source: "database" | "env" | "none";
  };
  pin: {
    configured: boolean;
    source: "database" | "env" | "none";
  };
};

async function getRow(userId: string) {
  const rows = await db
    .select()
    .from(userSecrets)
    .where(eq(userSecrets.userId, userId))
    .limit(1);
  return rows.at(0) ?? null;
}

export async function getOpenRouterApiKey(
  userId: string
): Promise<string | null> {
  const row = await getRow(userId);
  if (row?.openrouterApiKeyEnc) {
    const dec = decryptSecret(row.openrouterApiKeyEnc);
    if (dec) {
      return dec;
    }
  }
  return process.env.OPENROUTER_API_KEY?.trim() || null;
}

export async function getTavilyApiKey(userId: string): Promise<string | null> {
  const row = await getRow(userId);
  if (row?.tavilyApiKeyEnc) {
    const dec = decryptSecret(row.tavilyApiKeyEnc);
    if (dec) {
      return dec;
    }
  }
  return process.env.TAVILY_API_KEY?.trim() || null;
}

export async function getNumpadPinHash(userId: string): Promise<string | null> {
  const row = await getRow(userId);
  return row?.numpadPinHash ?? null;
}

export async function getSecretsPublicView(
  userId: string
): Promise<SecretsPublicView> {
  const row = await getRow(userId);
  const envOr = process.env.OPENROUTER_API_KEY?.trim();
  const envTavily = process.env.TAVILY_API_KEY?.trim();
  const envPin = process.env.VANDOR_NUMPAD_PIN?.trim();

  let orSource: SecretsPublicView["openrouter"]["source"] = "none";
  let orMasked: string | null = null;
  if (row?.openrouterApiKeyEnc) {
    const dec = decryptSecret(row.openrouterApiKeyEnc);
    if (dec) {
      orSource = "database";
      orMasked = maskSecret(dec);
    }
  } else if (envOr) {
    orSource = "env";
    orMasked = maskSecret(envOr);
  }

  let tavSource: SecretsPublicView["tavily"]["source"] = "none";
  let tavMasked: string | null = null;
  if (row?.tavilyApiKeyEnc) {
    const dec = decryptSecret(row.tavilyApiKeyEnc);
    if (dec) {
      tavSource = "database";
      tavMasked = maskSecret(dec);
    }
  } else if (envTavily) {
    tavSource = "env";
    tavMasked = maskSecret(envTavily);
  }

  let pinSource: SecretsPublicView["pin"]["source"] = "none";
  if (row?.numpadPinHash) {
    pinSource = "database";
  } else if (envPin) {
    pinSource = "env";
  }

  return {
    openrouter: {
      configured: orSource !== "none",
      masked: orMasked,
      source: orSource,
    },
    tavily: {
      configured: tavSource !== "none",
      masked: tavMasked,
      source: tavSource,
    },
    pin: {
      configured: pinSource !== "none",
      source: pinSource,
    },
  };
}

export async function updateUserSecrets({
  userId,
  openrouterApiKey,
  tavilyApiKey,
  clearOpenrouter,
  clearTavily,
  newPin,
}: {
  userId: string;
  openrouterApiKey?: string;
  tavilyApiKey?: string;
  clearOpenrouter?: boolean;
  clearTavily?: boolean;
  newPin?: string;
}): Promise<void> {
  const existing = await getRow(userId);

  const openrouterApiKeyEnc = clearOpenrouter
    ? null
    : openrouterApiKey?.trim()
      ? encryptSecret(openrouterApiKey.trim())
      : (existing?.openrouterApiKeyEnc ?? null);

  const tavilyApiKeyEnc = clearTavily
    ? null
    : tavilyApiKey?.trim()
      ? encryptSecret(tavilyApiKey.trim())
      : (existing?.tavilyApiKeyEnc ?? null);

  const numpadPinHash = newPin
    ? hashNumpadPin(newPin)
    : (existing?.numpadPinHash ?? null);

  await db
    .insert(userSecrets)
    .values({
      userId,
      openrouterApiKeyEnc,
      tavilyApiKeyEnc,
      numpadPinHash,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: userSecrets.userId,
      set: {
        openrouterApiKeyEnc,
        tavilyApiKeyEnc,
        numpadPinHash,
        updatedAt: new Date(),
      },
    });
}
