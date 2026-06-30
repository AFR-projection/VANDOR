import "server-only";

import { resolveDeploymentOwnerUser } from "@/lib/whatsapp/deployment-owner";
import { migrateGuestVaultFilesToOwner } from "./migrate-ownership";

let migratePromise: Promise<void> | null = null;

async function ensureGuestVaultMerged(ownerUserId: string): Promise<void> {
  if (!migratePromise) {
    migratePromise = migrateGuestVaultFilesToOwner(ownerUserId)
      .then(() => {
        /* once per process */
      })
      .catch((error) => {
        migratePromise = null;
        console.error("[vault] guest merge failed:", error);
      });
  }
  await migratePromise;
}

/**
 * Stable vault owner for this VANDOR deployment.
 * When VANDOR_OWNER_EMAIL is set, all vault files live under that user —
 * guest sessions no longer get an empty berangkas.
 */
export async function resolveVaultUserId(
  sessionUserId: string
): Promise<string> {
  const owner = await resolveDeploymentOwnerUser();
  if (owner) {
    await ensureGuestVaultMerged(owner.id);
    return owner.id;
  }
  return sessionUserId;
}
