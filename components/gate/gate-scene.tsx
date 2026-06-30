"use client";

import { motion, useReducedMotion } from "motion/react";

export function GateScene() {
  const reduceMotion = useReducedMotion();

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <div className="absolute inset-0 bg-background" />

      <div
        className="absolute inset-0 opacity-[0.35] dark:opacity-[0.22]"
        style={{
          backgroundImage:
            "linear-gradient(to right, oklch(0.5 0 0 / 0.06) 1px, transparent 1px), linear-gradient(to bottom, oklch(0.5 0 0 / 0.06) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage:
            "radial-gradient(ellipse 80% 70% at 50% 40%, black 20%, transparent 75%)",
        }}
      />

      {!reduceMotion && (
        <>
          <motion.div
            animate={{
              x: [0, 40, -20, 0],
              y: [0, -30, 20, 0],
              scale: [1, 1.08, 0.95, 1],
            }}
            className="absolute -left-[20%] top-[5%] size-[55vmin] rounded-full bg-primary/20 blur-[100px]"
            transition={{
              duration: 18,
              repeat: Number.POSITIVE_INFINITY,
              ease: "easeInOut",
            }}
          />
          <motion.div
            animate={{
              x: [0, -35, 25, 0],
              y: [0, 25, -15, 0],
              scale: [1, 0.92, 1.05, 1],
            }}
            className="absolute -right-[15%] bottom-[10%] size-[45vmin] rounded-full bg-violet-500/15 blur-[90px]"
            transition={{
              duration: 22,
              repeat: Number.POSITIVE_INFINITY,
              ease: "easeInOut",
            }}
          />
          <motion.div
            animate={{ opacity: [0.15, 0.35, 0.15] }}
            className="absolute left-1/2 top-[18%] size-[30vmin] -translate-x-1/2 rounded-full bg-cyan-400/10 blur-[70px]"
            transition={{
              duration: 8,
              repeat: Number.POSITIVE_INFINITY,
              ease: "easeInOut",
            }}
          />
        </>
      )}

      <div
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent"
        style={{ opacity: 0.6 }}
      />

      {!reduceMotion && (
        <motion.div
          animate={{ y: ["-100%", "200%"] }}
          className="absolute inset-x-0 h-24 bg-gradient-to-b from-primary/0 via-primary/8 to-primary/0"
          transition={{
            duration: 9,
            repeat: Number.POSITIVE_INFINITY,
            ease: "linear",
          }}
        />
      )}
    </div>
  );
}
