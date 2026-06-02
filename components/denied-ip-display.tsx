"use client";

import { useEffect, useState } from "react";

const base = () => process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function DeniedIpDisplay() {
  const [ip, setIp] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${base()}/api/whoami`)
      .then((r) => r.json())
      .then((data: { ip?: string }) => setIp(data.ip ?? "unknown"))
      .catch(() => setIp("unknown"));
  }, []);

  return (
    <div className="mt-6 rounded-xl border border-border/50 bg-card/60 p-4 text-left">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
        IP kamu
      </p>
      <p className="mt-1.5 font-mono text-base font-medium tabular-nums">
        {ip ?? "…"}
      </p>
    </div>
  );
}
