import "server-only";

import { getUser } from "@/lib/db/queries";
import { getNumpadPinHash } from "@/lib/settings/secrets-queries";
import { getOwnerCredentials, verifyNumpadPin } from "./gate-edge";
import { verifyNumpadPinHash } from "./pin-hash";

export async function verifyNumpadPinForGate(pin: string): Promise<boolean> {
  const owner = getOwnerCredentials();
  if (owner && process.env.POSTGRES_URL) {
    const users = await getUser(owner.email);
    const userId = users.at(0)?.id;
    if (userId) {
      const hash = await getNumpadPinHash(userId);
      if (hash) {
        return verifyNumpadPinHash(pin, hash);
      }
    }
  }

  return verifyNumpadPin(pin);
}

export async function isPinConfiguredForGate(): Promise<boolean> {
  const owner = getOwnerCredentials();
  if (owner && process.env.POSTGRES_URL) {
    const users = await getUser(owner.email);
    const userId = users.at(0)?.id;
    if (userId) {
      const hash = await getNumpadPinHash(userId);
      if (hash) {
        return true;
      }
    }
  }
  return Boolean(process.env.VANDOR_NUMPAD_PIN?.trim());
}
