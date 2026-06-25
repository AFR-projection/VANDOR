import "server-only";

import { resolveDeploymentOwnerUser } from "@/lib/whatsapp/deployment-owner";
import { migrateGuestSettingsToOwner } from "./migrate-guest-settings";

let migratePromise: Promise<void> | null = null;

async function ensureGuestSettingsMerged(ownerUserId: string): Promise<void> {
  if (!migratePromise) {
    migratePromise = migrateGuestSettingsToOwner(ownerUserId)
      .then(() => {
        /* once per process */
      })
      .catch((error) => {
        migratePromise = null;
        console.error("[settings] guest merge failed:", error);
      });
  }
  await migratePromise;
}

/**
 * Stable settings owner for this deployment (sama konsep dengan vault).
 */
export async function resolveSettingsUserId(
  sessionUserId: string
): Promise<string> {
  const owner = await resolveDeploymentOwnerUser();
  if (owner) {
    await ensureGuestSettingsMerged(owner.id);
    return owner.id;
  }
  return sessionUserId;
}
