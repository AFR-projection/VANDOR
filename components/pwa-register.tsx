"use client";

import { useEffect } from "react";

const base = () => process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }
    const path = `${base()}/sw.js`;
    navigator.serviceWorker.register(path).catch(() => {
      /* optional offline shell */
    });
  }, []);

  return null;
}
