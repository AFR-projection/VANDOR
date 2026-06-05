"use client";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function SettingToggle({
  id,
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-border/40 bg-card/30 px-4 py-3">
      <div className="min-w-0 flex-1">
        <Label className="text-sm font-medium" htmlFor={id}>
          {label}
        </Label>
        {description && (
          <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      <button
        aria-checked={checked}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          checked ? "bg-primary" : "bg-muted"
        )}
        disabled={disabled}
        id={id}
        onClick={() => onCheckedChange(!checked)}
        role="switch"
        type="button"
      >
        <span
          className={cn(
            "pointer-events-none block size-5 rounded-full bg-background shadow-lg ring-0 transition-transform",
            checked ? "translate-x-5" : "translate-x-0"
          )}
        />
      </button>
    </div>
  );
}

export function SettingSlider({
  id,
  label,
  description,
  value,
  min,
  max,
  step,
  onChange,
}: {
  id: string;
  label: string;
  description?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="rounded-xl border border-border/40 bg-card/30 px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <Label className="text-sm font-medium" htmlFor={id}>
          {label}
        </Label>
        <span className="text-xs tabular-nums text-muted-foreground">
          {value}
        </span>
      </div>
      {description && (
        <p className="mb-2 text-[12px] text-muted-foreground">{description}</p>
      )}
      <input
        className="w-full accent-primary"
        id={id}
        max={max}
        min={min}
        onChange={(e) => onChange(Number(e.target.value))}
        step={step ?? 1}
        type="range"
        value={value}
      />
    </div>
  );
}
