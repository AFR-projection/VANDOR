"use client";

import { motion } from "framer-motion";
import { PlusIcon } from "lucide-react";

export function RelatedQuestions({
  questions,
  onAsk,
}: {
  questions: string[];
  onAsk: (question: string) => void;
}) {
  if (questions.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 border-t border-border/30 pt-3">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        Tanyakan juga
      </p>
      <div className="flex flex-col gap-1.5">
        {questions.map((question, index) => (
          <motion.button
            animate={{ opacity: 1, x: 0 }}
            className="group flex w-full items-center justify-between gap-3 rounded-xl border border-border/40 bg-background/60 px-3.5 py-2.5 text-left text-[13px] text-foreground/90 transition-all hover:border-primary/30 hover:bg-primary/5"
            initial={{ opacity: 0, x: -8 }}
            key={question}
            onClick={() => onAsk(question)}
            transition={{
              delay: 0.05 * index,
              duration: 0.3,
              ease: [0.22, 1, 0.36, 1],
            }}
            type="button"
          >
            <span className="min-w-0 flex-1">{question}</span>
            <PlusIcon className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
          </motion.button>
        ))}
      </div>
    </div>
  );
}
