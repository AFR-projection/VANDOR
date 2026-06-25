import "server-only";

import { ensureOwnerUser } from "@/lib/db/ensure-owner";
import { getUser } from "@/lib/db/queries";
import { getOwnerCredentials } from "@/lib/security/gate";

/** VANDOR deployment owner — same identity the WhatsApp bot uses for DB lookups. */
export async function resolveDeploymentOwnerUser(): Promise<{
  id: string;
  email: string;
} | null> {
  const owner = getOwnerCredentials();
  if (!owner) {
    return null;
  }
  await ensureOwnerUser();
  const [ownerUser] = await getUser(owner.email);
  return ownerUser ?? null;
}
