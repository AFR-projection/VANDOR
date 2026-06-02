import { ShieldXIcon } from "lucide-react";
import { DeniedIpDisplay } from "@/components/denied-ip-display";

export default function DeniedPage() {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-background px-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(circle at 50% 0%, oklch(0.55 0.18 25 / 0.18), transparent 55%)",
        }}
      />
      <div className="relative z-10 w-full max-w-sm text-center">
        <div className="mb-5 inline-flex size-14 items-center justify-center rounded-2xl border border-destructive/40 bg-destructive/5 ring-1 ring-destructive/20">
          <ShieldXIcon className="size-6 text-destructive" />
        </div>
        <h1 className="font-semibold text-2xl tracking-tight">Akses ditolak</h1>
        <p className="mt-3 text-[13px] text-muted-foreground leading-relaxed">
          IP perangkat ini tidak terdaftar untuk mengakses VANDOR.
        </p>

        <DeniedIpDisplay />

        <p className="mt-6 text-[11px] text-muted-foreground/70 leading-relaxed">
          Hubungi owner untuk menambahkan IP ini ke{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-[10.5px]">
            VANDOR_ALLOWED_IPS
          </code>
          .
        </p>
      </div>
    </div>
  );
}
