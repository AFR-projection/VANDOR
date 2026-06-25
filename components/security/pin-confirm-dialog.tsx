"use client";

import { LockKeyholeIcon, ShieldCheckIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiBasePath } from "@/lib/app-url";
import { cn } from "@/lib/utils";

const PIN_LENGTH = 4;
const KEYS = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "clear",
  "0",
  "back",
];

export type PinConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  onConfirmed: () => void | Promise<void>;
};

export function PinConfirmDialog({
  open,
  onOpenChange,
  title = "Konfirmasi PIN",
  description = "Masukkan PIN yang sama saat login VANDOR untuk mengakses berangkas.",
  onConfirmed,
}: PinConfirmDialogProps) {
  const submitInFlight = useRef(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);

  const reset = useCallback(() => {
    setPin("");
    setError(null);
    setLoading(false);
    submitInFlight.current = false;
  }, []);

  useEffect(() => {
    if (!open) {
      reset();
    }
  }, [open, reset]);

  const submit = useCallback(
    async (value: string) => {
      if (value.length !== PIN_LENGTH || submitInFlight.current) {
        return;
      }
      submitInFlight.current = true;
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`${apiBasePath()}/api/gate/confirm-pin`, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pin: value, scope: "vault" }),
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          setError(data.error ?? "PIN ditolak");
          setShake(true);
          setPin("");
          submitInFlight.current = false;
          setLoading(false);
          setTimeout(() => setShake(false), 450);
          return;
        }

        await onConfirmed();
        onOpenChange(false);
        reset();
      } catch {
        setError("Koneksi gagal — coba lagi");
        setShake(true);
        submitInFlight.current = false;
        setLoading(false);
        setTimeout(() => setShake(false), 450);
      }
    },
    [onConfirmed, onOpenChange, reset]
  );

  useEffect(() => {
    if (
      pin.length === PIN_LENGTH &&
      !loading &&
      open &&
      !submitInFlight.current
    ) {
      void submit(pin);
    }
  }, [pin, submit, loading, open]);

  const onKey = (key: string) => {
    if (loading) return;
    if (key === "clear") {
      setPin("");
      setError(null);
      return;
    }
    if (key === "back") {
      setPin((p) => p.slice(0, -1));
      setError(null);
      return;
    }
    if (pin.length < PIN_LENGTH) {
      setPin((p) => p + key);
      setError(null);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-xs gap-0 overflow-hidden p-0 sm:max-w-sm">
        <div className="border-b border-emerald-500/20 bg-gradient-to-br from-emerald-950/90 to-slate-950/90 px-5 py-4">
          <DialogHeader className="space-y-2 text-left">
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-500/15 ring-1 ring-emerald-500/25">
                <LockKeyholeIcon className="size-4 text-emerald-400" />
              </div>
              <div>
                <DialogTitle className="text-sm font-semibold text-emerald-100">
                  {title}
                </DialogTitle>
                <DialogDescription className="mt-0.5 text-[11px] text-emerald-300/60">
                  {description}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div
            className={cn(
              "flex justify-center gap-2.5 transition-transform",
              shake && "animate-[shake_0.45s_ease-in-out]"
            )}
          >
            {Array.from({ length: PIN_LENGTH }).map((_, i) => (
              <div
                className={cn(
                  "size-3 rounded-full border-2 transition-all",
                  i < pin.length
                    ? "scale-110 border-emerald-400 bg-emerald-400"
                    : "border-muted-foreground/30 bg-transparent"
                )}
                key={`dot-${i}`}
              />
            ))}
          </div>

          {error && (
            <p className="text-center text-xs text-destructive">{error}</p>
          )}

          <div className="grid grid-cols-3 gap-2">
            {KEYS.map((key) => (
              <Button
                className={cn(
                  "h-12 text-base font-medium",
                  key === "clear" || key === "back"
                    ? "text-muted-foreground"
                    : ""
                )}
                disabled={loading}
                key={key}
                onClick={() => onKey(key)}
                type="button"
                variant={key === "clear" || key === "back" ? "ghost" : "outline"}
              >
                {key === "clear" ? "C" : key === "back" ? "⌫" : key}
              </Button>
            ))}
          </div>

          {loading && (
            <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
              <ShieldCheckIcon className="size-3.5 text-emerald-500" />
              Memverifikasi…
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Trigger browser file download from URL (with credentials). */
export async function triggerFileDownload(
  url: string,
  filename: string,
  opts?: { requestPin?: () => Promise<boolean> }
): Promise<boolean> {
  let res = await fetch(url, { credentials: "same-origin" });

  if (res.status === 401 && opts?.requestPin) {
    const data = await res.clone().json().catch(() => ({}));
    if (data.reason === "vault_pin_required" || data.requiresPin) {
      const ok = await opts.requestPin();
      if (!ok) return false;
      res = await fetch(url, { credentials: "same-origin" });
    }
  }

  if (!res.ok) {
    return false;
  }

  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
  return true;
}

/** Direct download for social media blob URLs. */
export async function triggerMediaDownload(
  url: string,
  filename: string
): Promise<boolean> {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) {
      window.open(url, "_blank", "noopener,noreferrer");
      return true;
    }
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
    return true;
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
    return true;
  }
}
