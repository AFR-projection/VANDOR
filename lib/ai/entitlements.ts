import type { UserType } from "@/app/(auth)/auth";

type Entitlements = {
  maxMessagesPerHour: number;
};

/** Owner / personal VANDOR — effectively unlimited for solo use. */
const OWNER_LIMIT = Number(process.env.VANDOR_MAX_MESSAGES_PER_HOUR ?? "10000");

export const entitlementsByUserType: Record<UserType, Entitlements> = {
  guest: {
    maxMessagesPerHour: 30,
  },
  regular: {
    maxMessagesPerHour: OWNER_LIMIT,
  },
};

export function isMessageLimitDisabled(): boolean {
  return process.env.VANDOR_DISABLE_MESSAGE_LIMIT === "true";
}
