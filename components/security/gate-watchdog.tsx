"use client";

import { signOut } from "next-auth/react";
import { useEffect, useRef } from "react";

import { apiBasePath } from "@/lib/app-url";

const base = apiBasePath;

/** Poll session — perangkat lama cepat tahu kalau login terjadi di tempat lain. */
const POLL_INTERVAL = 20_000;
const FIRST_CHECK_DELAY = 8000;

type GateStatusPayload = {
  configured?: boolean;
  sessionRevoked?: boolean;
};

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
        await signOut({ redirect: false });
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

        // Hanya logout paksa jika sesi dicabut (login di perangkat lain), bukan saat cookie belum terbaca.
        if (data.sessionRevoked === true) {
          kicked.current = true;
          await revokeGate();
          window.location.href = `${base()}/gate?reason=revoked`;
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
