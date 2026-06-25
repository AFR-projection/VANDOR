"use client";

import { useEffect } from "react";

import { apiBasePath } from "@/lib/app-url";
const base = apiBasePath;

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
