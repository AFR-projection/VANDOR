"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

const HOUR_GREETING = (hour: number): string => {
  if (hour < 5) return "Selamat malam";
  if (hour < 12) return "Selamat pagi";
  if (hour < 15) return "Selamat siang";
  if (hour < 19) return "Selamat sore";
  return "Selamat malam";
};

const SUBLINES = [
  "Ada yang bisa saya bantu hari ini?",
  "Mau kerjakan apa?",
  "Siap menerima perintah.",
  "Apa rencana hari ini, Boss?",
];

export const Greeting = () => {
  const [greeting, setGreeting] = useState("Halo");
  const [subline, setSubline] = useState(SUBLINES[1]);

  useEffect(() => {
    const now = new Date();
    setGreeting(HOUR_GREETING(now.getHours()));
    setSubline(SUBLINES[Math.floor(Math.random() * SUBLINES.length)]);
  }, []);

  return (
    <div
      className="pointer-events-auto flex flex-col items-start gap-3 px-6 max-md:px-4"
      key="overview"
    >
      {/* Tiny overline */}
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground/60"
        initial={{ opacity: 0, y: 8 }}
        transition={{ delay: 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        VANDOR · v3.2
      </motion.div>

      {/* Main display headline */}
      <motion.h1
        animate={{ opacity: 1, y: 0 }}
        className="font-display font-light tracking-tight text-foreground text-3xl leading-[1.05] md:text-5xl"
        data-testid="chat-greeting-headline"
        initial={{ opacity: 0, y: 12 }}
        transition={{ delay: 0.18, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <span className="text-muted-foreground/55">{greeting},</span>{" "}
        <span className="text-foreground">Boss.</span>
      </motion.h1>

      {/* Subline */}
      <motion.p
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md font-display text-base text-muted-foreground/75 md:text-lg"
        initial={{ opacity: 0, y: 8 }}
        transition={{ delay: 0.32, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        {subline}
      </motion.p>

      {/* Decorative subtle hairline */}
      <motion.div
        animate={{ width: "min(280px, 60vw)", opacity: 0.4 }}
        className="mt-3 h-px bg-gradient-to-r from-foreground/30 via-foreground/10 to-transparent"
        initial={{ width: 0, opacity: 0 }}
        transition={{ delay: 0.5, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
};
