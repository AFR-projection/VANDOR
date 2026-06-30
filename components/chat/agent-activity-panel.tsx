"use client";

import { CheckIcon, ChevronDownIcon, SparklesIcon, XIcon } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  deriveAgentActivityFromMessage,
  deriveInitialActivity,
} from "@/lib/agent-activity/derive";
import type {
  AgentActivityState,
  AgentStepStatus,
} from "@/lib/agent-activity/types";
import type { ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Shimmer } from "../ai-elements/shimmer";

function formatElapsed(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) {
    return `${sec}s`;
  }
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${min}m ${rem.toString().padStart(2, "0")}s`;
}

const StepNode = memo(function StepNode({
  status,
}: {
  status: AgentStepStatus;
}) {
  if (status === "completed") {
    return (
      <span className="relative z-10 flex size-[22px] shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 ring-1 ring-emerald-500/30 ring-inset dark:text-emerald-400">
        <CheckIcon aria-hidden className="size-3" strokeWidth={3} />
      </span>
    );
  }
  if (status === "running") {
    return (
      <span className="relative z-10 flex size-[22px] shrink-0 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/40 ring-inset">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/25 opacity-70" />
        <span className="relative size-2 rounded-full bg-primary shadow-[0_0_8px_var(--vandor-accent)]" />
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="relative z-10 flex size-[22px] shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive ring-1 ring-destructive/30 ring-inset">
        <XIcon aria-hidden className="size-3" strokeWidth={3} />
      </span>
    );
  }
  return (
    <span className="relative z-10 flex size-[22px] shrink-0 items-center justify-center rounded-full bg-muted/40 ring-1 ring-border/50 ring-inset">
      <span className="size-1.5 rounded-full bg-muted-foreground/40" />
    </span>
  );
});

function ProgressBar({ value, active }: { value: number; active: boolean }) {
  return (
    <div className="relative h-1 w-full overflow-hidden rounded-full bg-border/30">
      <motion.div
        animate={{ width: `${value}%` }}
        className={cn(
          "h-full rounded-full",
          active
            ? "bg-gradient-to-r from-primary/50 via-primary to-primary/70"
            : "bg-gradient-to-r from-emerald-500/70 to-emerald-400"
        )}
        initial={false}
        transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
      />
      {active && (
        <span
          aria-hidden
          className="progress-sweep absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-transparent via-white/30 to-transparent dark:via-white/25"
        />
      )}
    </div>
  );
}

type AgentActivityPanelProps = {
  message?: ChatMessage | null;
  isLoading: boolean;
  className?: string;
  compact?: boolean;
};

function useElapsed(startedAt: number | null, isActive: boolean): number {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startedAt || !isActive) {
      return;
    }
    const tick = () => setElapsed(Date.now() - startedAt);
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [startedAt, isActive]);

  return elapsed;
}

function AgentActivityPanelInner({
  activity,
  isLoading,
  className,
  compact = false,
}: {
  activity: AgentActivityState;
  isLoading: boolean;
  className?: string;
  compact?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const isActive = isLoading && activity.phase !== "complete";
  const [isOpen, setIsOpen] = useState(true);
  const hasAutoCollapsed = useRef(false);
  const elapsed = useElapsed(activity.startedAt, isActive);

  useEffect(() => {
    if (isActive) {
      setIsOpen(true);
      hasAutoCollapsed.current = false;
    }
  }, [isActive]);

  useEffect(() => {
    if (
      !isActive &&
      activity.phase === "complete" &&
      isOpen &&
      !hasAutoCollapsed.current
    ) {
      const timer = window.setTimeout(() => {
        setIsOpen(false);
        hasAutoCollapsed.current = true;
      }, 1400);
      return () => window.clearTimeout(timer);
    }
  }, [isActive, activity.phase, isOpen]);

  if (activity.phase === "idle" && !isLoading) {
    return null;
  }

  const showEvents = activity.events.length > 0;
  const showTraces = activity.thinkingTraces.length > 0;
  const stepCount = activity.steps.length;
  const completedCount = activity.steps.filter(
    (s) => s.status === "completed"
  ).length;

  return (
    <Collapsible
      className={cn("not-prose w-full", className)}
      onOpenChange={setIsOpen}
      open={isOpen}
    >
      <div
        className={cn(
          "group/agent relative overflow-hidden rounded-2xl border border-border/40",
          "bg-gradient-to-br from-card/85 via-card/55 to-muted/20",
          "shadow-[0_1px_0_rgba(255,255,255,0.05)_inset,0_10px_36px_-14px_rgba(0,0,0,0.22)]",
          "backdrop-blur-xl backdrop-saturate-150 transition-shadow duration-300",
          "hover:shadow-[0_1px_0_rgba(255,255,255,0.06)_inset,0_14px_42px_-14px_rgba(0,0,0,0.3)]",
          "dark:from-card/45 dark:via-card/25 dark:to-muted/10",
          "dark:shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_16px_48px_-18px_rgba(0,0,0,0.6)]",
          compact ? "max-w-md" : "max-w-[min(100%,560px)]"
        )}
        data-testid="agent-activity-panel"
      >
        {/* Ambient glow — animated only while active */}
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute -right-10 -top-10 size-36 rounded-full blur-3xl transition-opacity duration-500",
            isActive
              ? "bg-primary/[0.07] opacity-100 dark:bg-primary/[0.1]"
              : "bg-emerald-500/[0.05] opacity-70"
          )}
        />

        <CollapsibleTrigger
          className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-foreground/[0.025] sm:px-4 sm:py-3.5"
          type="button"
        >
          <span
            className={cn(
              "relative flex size-8 shrink-0 items-center justify-center rounded-xl border shadow-sm transition-colors duration-300",
              isActive
                ? "border-primary/30 bg-primary/[0.06]"
                : "border-emerald-500/30 bg-emerald-500/[0.07]"
            )}
          >
            {isActive ? (
              <>
                {!reduceMotion && (
                  <span className="absolute inline-flex size-full animate-ping rounded-xl bg-primary/15 opacity-60" />
                )}
                <SparklesIcon
                  aria-hidden
                  className="relative size-4 text-primary"
                />
              </>
            ) : (
              <CheckIcon
                aria-hidden
                className="size-4 text-emerald-600 dark:text-emerald-400"
                strokeWidth={2.5}
              />
            )}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {isActive ? (
                <Shimmer
                  as="span"
                  className="font-medium text-[13px] text-foreground/90 sm:text-sm"
                  duration={1.1}
                >
                  Agent sedang bekerja
                </Shimmer>
              ) : (
                <span className="font-medium text-[13px] text-foreground/90 sm:text-sm">
                  Agent selesai bekerja
                </span>
              )}
              {(isActive || elapsed > 0) && (
                <span className="shrink-0 rounded-md bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
                  {formatElapsed(elapsed)}
                </span>
              )}
              {stepCount > 0 && (
                <span className="ml-auto shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground/70">
                  {completedCount}/{stepCount}
                </span>
              )}
            </div>
            <div className="mt-0.5 h-4 overflow-hidden">
              <AnimatePresence initial={false} mode="wait">
                <motion.p
                  animate={{ opacity: 1, y: 0 }}
                  className="truncate text-[11px] text-muted-foreground sm:text-xs"
                  exit={{ opacity: 0, y: -6 }}
                  initial={{ opacity: 0, y: 6 }}
                  key={activity.liveStatus}
                  transition={{ duration: 0.18 }}
                >
                  {activity.liveStatus || "Menyiapkan…"}
                </motion.p>
              </AnimatePresence>
            </div>
          </div>

          <ChevronDownIcon
            aria-hidden
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
              isOpen ? "rotate-180" : "rotate-0"
            )}
          />
        </CollapsibleTrigger>

        <div className="px-3.5 pb-1 sm:px-4">
          <ProgressBar active={isActive} value={activity.progress} />
        </div>

        <CollapsibleContent>
          <div className="space-y-3.5 px-3.5 pb-3.5 pt-2.5 sm:px-4 sm:pb-4">
            {stepCount > 0 && (
              <section aria-label="Execution timeline">
                <p className="mb-2.5 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground/70">
                  Timeline
                </p>
                <ol className="relative">
                  <AnimatePresence initial={false}>
                    {activity.steps.map((step, index) => {
                      const isLast = index === stepCount - 1;
                      const connectorActive =
                        step.status === "completed" || step.status === "error";
                      return (
                        <motion.li
                          animate={{ opacity: 1, y: 0 }}
                          className="relative flex gap-3 pb-3 last:pb-0"
                          initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                          key={step.id}
                          transition={{
                            duration: 0.2,
                            ease: [0.32, 0.72, 0, 1],
                          }}
                        >
                          {!isLast && (
                            <span
                              aria-hidden
                              className={cn(
                                "absolute left-[10px] top-[22px] bottom-0 w-px",
                                connectorActive
                                  ? "bg-gradient-to-b from-emerald-500/50 to-border/30"
                                  : "bg-border/40"
                              )}
                            />
                          )}
                          <StepNode status={step.status} />
                          <span
                            className={cn(
                              "pt-[3px] text-[12px] leading-snug sm:text-[13px]",
                              step.status === "running" &&
                                "font-medium text-foreground",
                              step.status === "completed" &&
                                "text-muted-foreground",
                              step.status === "pending" &&
                                "text-muted-foreground/50",
                              step.status === "error" && "text-destructive"
                            )}
                          >
                            {step.label}
                          </span>
                        </motion.li>
                      );
                    })}
                  </AnimatePresence>
                </ol>
              </section>
            )}

            {showTraces && (
              <section aria-label="Thinking trace">
                <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground/70">
                  Aktivitas
                </p>
                <ul className="space-y-1">
                  {activity.thinkingTraces.map((trace) => (
                    <li
                      className="flex items-start gap-2 text-[11px] text-muted-foreground sm:text-xs"
                      key={trace}
                    >
                      <span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary/50" />
                      {trace}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {showEvents && (
              <section aria-label="Event log">
                <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground/70">
                  Event log
                </p>
                <div className="max-h-[124px] space-y-1 overflow-y-auto rounded-xl border border-border/25 bg-background/40 px-2.5 py-2 [scrollbar-width:thin]">
                  {activity.events.map((event) => (
                    <div
                      className="flex gap-2 text-[10px] leading-relaxed sm:text-[11px]"
                      key={event.id}
                    >
                      <span className="shrink-0 font-mono tabular-nums text-muted-foreground/50">
                        {new Date(event.at).toLocaleTimeString(undefined, {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </span>
                      <span
                        className={cn(
                          "min-w-0 text-muted-foreground",
                          event.level === "success" &&
                            "text-emerald-600/90 dark:text-emerald-400/90",
                          event.level === "warn" &&
                            "text-amber-600/90 dark:text-amber-400/90"
                        )}
                      >
                        {event.message}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export const AgentActivityPanel = memo(function AgentActivityPanel({
  message,
  isLoading,
  className,
  compact,
}: AgentActivityPanelProps) {
  const activity = useMemo(
    () =>
      message
        ? deriveAgentActivityFromMessage(message, isLoading)
        : deriveInitialActivity(),
    [message, isLoading]
  );

  return (
    <AgentActivityPanelInner
      activity={activity}
      className={className}
      compact={compact}
      isLoading={isLoading}
    />
  );
});

export const ThinkingActivityPanel = memo(function ThinkingActivityPanel() {
  const activity = useMemo(() => deriveInitialActivity(), []);

  return (
    <div className="group/message w-full" data-role="assistant">
      <AgentActivityPanelInner activity={activity} isLoading={true} />
    </div>
  );
});
