import "server-only";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { userSettings } from "@/lib/db/schema";
import { stripUndefinedSettingsPatch } from "./patch";
import {
  defaultUserSettings,
  mergeUserSettings,
  type UserSettings,
  userSettingsSchema,
} from "./types";

const client = postgres(process.env.POSTGRES_URL ?? "", { prepare: false });
const db = drizzle(client);

export async function getUserSettings(userId: string): Promise<UserSettings> {
  if (!process.env.POSTGRES_URL) {
    return defaultUserSettings;
  }

  try {
    const rows = await db
      .select({ settings: userSettings.settings })
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);

    const raw = rows.at(0)?.settings;
    if (!raw || typeof raw !== "object") {
      return defaultUserSettings;
    }

    const parsed = userSettingsSchema.safeParse(
      mergeUserSettings(raw as Partial<UserSettings>)
    );
    return parsed.success ? parsed.data : defaultUserSettings;
  } catch {
    return defaultUserSettings;
  }
}

export async function updateUserSettings(
  userId: string,
  patch: Partial<UserSettings>
): Promise<UserSettings> {
  const current = await getUserSettings(userId);
  const safePatch = stripUndefinedSettingsPatch(patch);
  const merged = mergeUserSettings({ ...current, ...safePatch });

  if (!process.env.POSTGRES_URL) {
    return merged;
  }

  const validated = userSettingsSchema.parse(merged);

  await db
    .insert(userSettings)
    .values({
      userId,
      settings: validated,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: {
        settings: validated,
        updatedAt: new Date(),
      },
    });

  return validated;
}
