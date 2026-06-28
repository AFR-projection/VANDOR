"use client";

import { DeleteIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

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
] as const;

function keyLabel(key: (typeof KEYS)[number]): string {
  if (key === "clear") {
    return "C";
  }
  if (key === "back") {
    return "⌫";
  }
  return key;
}

function NumpadKey({
  label,
  disabled,
  onPress,
  variant = "digit",
}: {
  label: React.ReactNode;
  disabled: boolean;
  onPress: () => void;
  variant?: "digit" | "action";
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.button
      className={cn(
        "relative flex h-[3.25rem] select-none items-center justify-center overflow-hidden rounded-2xl border text-lg font-medium tabular-nums transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
        variant === "action"
          ? "border-border/30 bg-muted/30 text-muted-foreground hover:bg-muted/50"
          : "border-border/40 bg-card/50 text-foreground backdrop-blur-md hover:border-primary/30 hover:bg-card/80",
        disabled && "pointer-events-none opacity-40"
      )}
      disabled={disabled}
      onClick={onPress}
      type="button"
      whileHover={reduceMotion || disabled ? undefined : { scale: 1.02 }}
      whileTap={reduceMotion || disabled ? undefined : { scale: 0.94 }}
    >
      <span className="relative z-10">{label}</span>
      {!reduceMotion && (
        <span className="pointer-events-none absolute inset-0 bg-gradient-to-b from-foreground/[0.06] to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
      )}
    </motion.button>
  );
}

export function GateNumpad({
  disabled,
  onKey,
}: {
  disabled: boolean;
  onKey: (key: string) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2.5">
      {KEYS.map((key) => (
        <NumpadKey
          disabled={disabled}
          key={key}
          label={
            key === "back" ? (
              <DeleteIcon aria-hidden className="size-5" />
            ) : (
              keyLabel(key)
            )
          }
          onPress={() => onKey(key)}
          variant={key === "clear" || key === "back" ? "action" : "digit"}
        />
      ))}
    </div>
  );
}
