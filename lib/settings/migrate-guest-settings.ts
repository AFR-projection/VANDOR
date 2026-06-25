import "server-only";

import postgres from "postgres";
import { defaultUserSettings } from "./types";

const client = postgres(process.env.POSTGRES_URL ?? "", { prepare: false });

function hasCustomPersona(settings: unknown): boolean {
  if (!settings || typeof settings !== "object") {
    return false;
  }
  const persona = (settings as { persona?: { styles?: unknown[] } }).persona;
  return Array.isArray(persona?.styles) && persona.styles.length > 0;
}

/**
 * Gabungkan UserSettings & UserSecrets dari akun guest ke deployment owner
 * supaya pengaturan tidak hilang saat sesi guest ↔ owner berganti.
 */
export async function migrateGuestSettingsToOwner(
  ownerUserId: string
): Promise<void> {
  if (!process.env.POSTGRES_URL) {
    return;
  }

  try {
    const guestRows = await client<
      { userId: string; settings: unknown; updatedAt: Date }[]
    >`
      SELECT us."userId", us.settings, us."updatedAt"
      FROM "UserSettings" us
      INNER JOIN "User" u ON u.id = us."userId"
      WHERE u.email LIKE 'guest-%'
        AND us."userId" <> ${ownerUserId}::uuid
      ORDER BY us."updatedAt" DESC
    `;

    if (guestRows.length === 0) {
      return;
    }

    const ownerRows = await client<{ settings: unknown }[]>`
      SELECT settings FROM "UserSettings" WHERE "userId" = ${ownerUserId}::uuid LIMIT 1
    `;
    const ownerSettings = ownerRows.at(0)?.settings;
    const ownerHasCustomPersona = hasCustomPersona(ownerSettings);

    for (const guest of guestRows) {
      if (!hasCustomPersona(guest.settings) && !ownerHasCustomPersona) {
        continue;
      }

      if (!ownerRows.length) {
        await client`
          UPDATE "UserSettings"
          SET "userId" = ${ownerUserId}::uuid, "updatedAt" = now()
          WHERE "userId" = ${guest.userId}::uuid
        `;
        break;
      }

      if (!ownerHasCustomPersona && hasCustomPersona(guest.settings)) {
        const guestPersona = (guest.settings as { persona?: unknown }).persona;
        const merged = {
          ...(typeof ownerSettings === "object" && ownerSettings
            ? ownerSettings
            : defaultUserSettings),
          persona: guestPersona,
        };
        await client`
          UPDATE "UserSettings"
          SET settings = ${JSON.stringify(merged)}::json, "updatedAt" = now()
          WHERE "userId" = ${ownerUserId}::uuid
        `;
        await client`
          DELETE FROM "UserSettings" WHERE "userId" = ${guest.userId}::uuid
        `;
        break;
      }
    }

    await client`
      UPDATE "UserSecrets" sec
      SET "userId" = ${ownerUserId}::uuid, "updatedAt" = now()
      FROM "User" u
      WHERE sec."userId" = u.id
        AND u.email LIKE 'guest-%'
        AND sec."userId" <> ${ownerUserId}::uuid
        AND NOT EXISTS (
          SELECT 1 FROM "UserSecrets" WHERE "userId" = ${ownerUserId}::uuid
        )
    `;
  } catch (error) {
    console.error("[settings] migrateGuestSettingsToOwner failed:", error);
  }
}
