"use client";

import { DownloadIcon, Loader2Icon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useVaultPinUnlock } from "@/hooks/use-vault-pin-unlock";
import { cn } from "@/lib/utils";

type VaultDownloadButtonProps = {
  url: string;
  filename: string;
  className?: string;
  size?: "sm" | "default";
  variant?: "default" | "secondary" | "outline" | "ghost";
  label?: string;
  iconOnly?: boolean;
};

export function VaultDownloadButton({
  url,
  filename,
  className,
  size = "sm",
  variant = "secondary",
  label = "Unduh",
  iconOnly = false,
}: VaultDownloadButtonProps) {
  const { downloadVaultFile, PinDialog } = useVaultPinUnlock();
  const [loading, setLoading] = useState(false);

  const onClick = async () => {
    setLoading(true);
    try {
      await downloadVaultFile(url, filename);
    } finally {
      setLoading(false);
    }
  };

  if (iconOnly) {
    return (
      <>
        <button
          className={cn(
            "rounded-lg p-1.5 text-muted-foreground hover:bg-background hover:text-foreground",
            className
          )}
          disabled={loading}
          onClick={() => void onClick()}
          title={label}
          type="button"
        >
          {loading ? (
            <Loader2Icon className="size-3.5 animate-spin" />
          ) : (
            <DownloadIcon className="size-3.5" />
          )}
        </button>
        {PinDialog}
      </>
    );
  }

  return (
    <>
      <Button
        className={className}
        disabled={loading}
        onClick={() => void onClick()}
        size={size}
        type="button"
        variant={variant}
      >
        {loading ? (
          <Loader2Icon className="size-3.5 animate-spin" />
        ) : (
          <DownloadIcon className="size-3.5" />
        )}
        {!iconOnly && <span className="ml-1.5">{label}</span>}
      </Button>
      {PinDialog}
    </>
  );
}
