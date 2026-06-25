import "server-only";

import postgres from "postgres";

const client = postgres(process.env.POSTGRES_URL ?? "", { prepare: false });

/**
 * Move vault metadata from ephemeral guest accounts to the deployment owner.
 * Blob keys (r2Key) are unchanged — only DB ownership is updated.
 */
export async function migrateGuestVaultFilesToOwner(
  ownerUserId: string
): Promise<number> {
  if (!process.env.POSTGRES_URL) {
    return 0;
  }

  try {
    const moved = await client<{ count: number }[]>`
      WITH updated AS (
        UPDATE "VaultFile" vf
        SET "userId" = ${ownerUserId}::uuid,
            "updatedAt" = now()
        FROM "User" u
        WHERE vf."userId" = u.id
          AND u.email LIKE 'guest-%'
          AND vf."userId" <> ${ownerUserId}::uuid
        RETURNING vf.id
      )
      SELECT count(*)::int AS count FROM updated
    `;

    const count = moved.at(0)?.count ?? 0;
    if (count > 0) {
      console.info(
        `[vault] Migrated ${count} file(s) from guest account(s) to owner ${ownerUserId}`
      );

      await client`
        UPDATE "VaultAuditLog" val
        SET "userId" = ${ownerUserId}::uuid
        FROM "User" u
        WHERE val."userId" = u.id
          AND u.email LIKE 'guest-%'
          AND val."userId" <> ${ownerUserId}::uuid
      `;
    }

    return count;
  } catch (error) {
    console.error("[vault] migrateGuestVaultFilesToOwner failed:", error);
    return 0;
  }
}
