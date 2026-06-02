import "server-only";

import { getOwnerCredentials } from "@/lib/security/gate";
import { createUser, getUser } from "./queries";

export async function ensureOwnerUser(): Promise<void> {
  const owner = getOwnerCredentials();
  if (!owner) {
    return;
  }

  const existing = await getUser(owner.email);
  if (existing.length > 0) {
    return;
  }

  await createUser(owner.email, owner.password);
}
