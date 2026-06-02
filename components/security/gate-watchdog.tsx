"use client";

import { useEffect, useRef } from "react";

const base = () => process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Realtime IP + gate check while the app is open */
const POLL_INTERVAL = 8_000;
const FIRST_CHECK_DELAY = 2_000;

type GateStatusPayload = {
  configured?: boolean;
  ipAllowed?: boolean;
  requiresPin?: boolean;
  ipMismatch?: boolean;
  sessionRevoked?: boolean;
};

/**
 * Polls /api/gate/status on an interval and when the tab regains focus.
 * If IP leaves the allowlist → /denied. If IP changes or gate invalid → /gate (PIN lagi).
 */
export function GateWatchdog() {
  const kicked = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function revokeGate() {
      try {
        await fetch(`${base()}/api/gate/revoke`, {
          method: "POST",
          credentials: "same-origin",
        });
      } catch {
        /* ignore */
      }
    }

    async function tick() {
      if (cancelled || kicked.current) return;
      try {
        const res = await fetch(`${base()}/api/gate/status`, {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!res.ok) return;
        const data = (await res.json()) as GateStatusPayload;
        if (!data.configured) return;

        if (data.ipAllowed === false) {
          kicked.current = true;
          window.location.href = `${base()}/denied`;
          return;
        }

        if (
          data.requiresPin === true ||
          data.ipMismatch === true ||
          data.sessionRevoked === true
        ) {
          kicked.current = true;
          await revokeGate();
          const reason = data.ipMismatch
            ? "ip_changed"
            : data.sessionRevoked
              ? "revoked"
              : "expired";
          window.location.href = `${base()}/gate?reason=${reason}`;
        }
      } catch {
        /* network blip */
      }
    }

    const firstId = setTimeout(tick, FIRST_CHECK_DELAY);
    const id = setInterval(tick, POLL_INTERVAL);
    const onFocus = () => {
      if (!kicked.current) tick();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && !kicked.current) {
        tick();
      }
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearTimeout(firstId);
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
