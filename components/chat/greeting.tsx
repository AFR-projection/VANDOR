"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { APP_NAME, APP_VERSION } from "@/lib/version";

const HOUR_GREETING = (hour: number): string => {
  if (hour < 5) return "Selamat malam";
  if (hour < 12) return "Selamat pagi";
  if (hour < 15) return "Selamat siang";
  if (hour < 19) return "Selamat sore";
  return "Selamat malam";
};

const SUBLINES = [
  "Asisten pribadi Anda — siap menerima perintah.",
  "Memory aktif. Agent tools online.",
  "Ketik perintah atau unggah file untuk memulai.",
  "Privasi terjaga. Fokus pada yang penting.",
];

const fadeUp = (delay: number) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { delay, duration: 0.65, ease: [0.22, 1, 0.36, 1] as const },
});

export const Greeting = () => {
  const [greeting, setGreeting] = useState("Halo");
  const [subline, setSubline] = useState(SUBLINES[0]);
  const [timeLabel, setTimeLabel] = useState("");

  useEffect(() => {
    const now = new Date();
    setGreeting(HOUR_GREETING(now.getHours()));
    setSubline(SUBLINES[Math.floor(Math.random() * SUBLINES.length)]);
    setTimeLabel(
      now.toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
      })
    );
  }, []);

  return (
    <div
      className="relative flex w-full max-w-2xl flex-col items-center px-6 text-center max-md:px-4"
      data-testid="chat-greeting"
      key="overview"
    >
      {/* Ambient depth */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-1/2 size-64 -translate-x-1/2 rounded-full opacity-60 blur-[100px]"
        style={{ background: "var(--vandor-accent-glow)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-8 right-0 size-32 rounded-full bg-foreground/[0.02] blur-3xl"
      />

      {/* Presence core */}
      <motion.div {...fadeUp(0.08)} className="relative mb-10">
        <div
          aria-hidden
          className="absolute inset-0 scale-150 rounded-full opacity-40 blur-2xl"
          style={{ background: "var(--vandor-accent-soft)" }}
        />
        <div className="relative flex size-[4.5rem] items-center justify-center rounded-full border border-white/[0.08] bg-gradient-to-b from-white/[0.07] to-white/[0.02] shadow-[0_0_48px_-8px_var(--vandor-accent-glow),inset_0_1px_0_rgba(255,255,255,0.12)]">
          <div className="size-7 animate-pulse rounded-full bg-gradient-to-br from-[var(--vandor-accent)] to-[var(--vandor-accent)]/30 shadow-[0_0_24px_var(--vandor-accent-glow)]" />
        </div>
      </motion.div>

      {/* Overline */}
      <motion.div
        {...fadeUp(0.16)}
        className="mb-5 font-mono text-[10px] uppercase tracking-[0.38em] text-muted-foreground/45"
      >
        {APP_NAME} · v{APP_VERSION}
      </motion.div>

      {/* Headline */}
      <motion.h1
        {...fadeUp(0.24)}
        className="font-display font-light tracking-tight text-foreground"
        data-testid="chat-greeting-headline"
      >
        <span className="block text-[2rem] leading-[1.08] text-muted-foreground/45 md:text-[2.75rem]">
          {greeting},
        </span>
        <span className="mt-1 block bg-gradient-to-br from-foreground via-foreground to-muted-foreground/70 bg-clip-text text-[2.75rem] leading-[1.02] text-transparent md:text-[4rem]">
          Boss.
        </span>
      </motion.h1>

      {/* Subline */}
      <motion.p
        {...fadeUp(0.34)}
        className="mt-5 max-w-md text-[15px] leading-relaxed text-muted-foreground/65 md:text-base"
      >
        {subline}
      </motion.p>

      {/* System rail — status only, not clickable prompts */}
      <motion.div
        {...fadeUp(0.44)}
        className="mt-10 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/40"
      >
        <span className="inline-flex items-center gap-2 rounded-full border border-border/30 bg-card/20 px-3 py-1.5 backdrop-blur-sm">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400/60 opacity-60" />
            <span className="relative inline-flex size-1.5 rounded-full bg-emerald-400/90" />
          </span>
          Online
        </span>
        <span className="hidden text-border/60 sm:inline">·</span>
        <span className="rounded-full border border-border/20 bg-transparent px-2 py-1">
          Memory sync
        </span>
        <span className="hidden text-border/60 sm:inline">·</span>
        <span className="rounded-full border border-border/20 bg-transparent px-2 py-1">
          {timeLabel || "—"}
        </span>
      </motion.div>

      {/* Hairline accent */}
      <motion.div
        animate={{ scaleX: 1, opacity: 1 }}
        className="mt-10 h-px w-24 origin-center bg-gradient-to-r from-transparent via-foreground/25 to-transparent"
        initial={{ scaleX: 0, opacity: 0 }}
        transition={{ delay: 0.55, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
};
