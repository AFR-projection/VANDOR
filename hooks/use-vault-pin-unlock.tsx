"use client";

import { useCallback, useRef, useState } from "react";
import {
  PinConfirmDialog,
  triggerFileDownload,
} from "@/components/security/pin-confirm-dialog";

export function useVaultPinUnlock() {
  const [pinOpen, setPinOpen] = useState(false);
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);

  const requestPin = useCallback((): Promise<boolean> => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setPinOpen(true);
    });
  }, []);

  const handleConfirmed = useCallback(() => {
    resolveRef.current?.(true);
    resolveRef.current = null;
  }, []);

  const handleOpenChange = useCallback((open: boolean) => {
    setPinOpen(open);
    if (!open && resolveRef.current) {
      resolveRef.current(false);
      resolveRef.current = null;
    }
  }, []);

  const downloadVaultFile = useCallback(
    async (url: string, filename: string) => {
      return triggerFileDownload(url, filename, { requestPin });
    },
    [requestPin]
  );

  const PinDialog = (
    <PinConfirmDialog
      description="Masukkan PIN login VANDOR untuk mengunduh atau melihat file berangkas."
      onConfirmed={handleConfirmed}
      onOpenChange={handleOpenChange}
      open={pinOpen}
      title="Konfirmasi PIN Berangkas"
    />
  );

  return { requestPin, downloadVaultFile, PinDialog };
}
