"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

const PIN_LENGTH = 4;

export function GatePinDisplay({
  filled,
  shake,
  success,
  locked,
}: {
  filled: number;
  shake: boolean;
  success: boolean;
  locked: boolean;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <div
      className={cn(
        "mb-8 flex justify-center gap-3",
        shake && !reduceMotion && "animate-[vandor-shake_0.45s_ease]"
      )}
    >
      {Array.from({ length: PIN_LENGTH }).map((_, i) => {
        const active = i < filled;
        return (
          <motion.div
            animate={
              success && active
                ? { scale: [1, 1.15, 1], borderColor: "var(--primary)" }
                : active
                  ? { scale: 1.02 }
                  : { scale: 1 }
            }
            className={cn(
              "relative flex size-12 items-center justify-center rounded-xl border-2 transition-colors duration-200",
              locked
                ? "border-destructive/30 bg-destructive/5"
                : success && active
                  ? "border-primary bg-primary/15"
                  : active
                    ? "border-primary/70 bg-primary/10"
                    : "border-border/50 bg-card/40 backdrop-blur-sm"
            )}
            key={i}
            transition={{ duration: 0.25 }}
          >
            {active && (
              <motion.span
                animate={success ? { scale: [0, 1.2, 1] } : { scale: 1 }}
                className={cn(
                  "size-2.5 rounded-full",
                  success ? "bg-primary" : "bg-foreground"
                )}
                initial={reduceMotion ? false : { scale: 0 }}
                layoutId={reduceMotion ? undefined : `pin-dot-${i}`}
              />
            )}
            {active && !reduceMotion && !success && (
              <span className="absolute inset-0 rounded-xl ring-2 ring-primary/20 ring-inset" />
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
