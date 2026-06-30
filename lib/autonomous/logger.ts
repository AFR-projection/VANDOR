type LogLevel = "debug" | "info" | "warn" | "error";

function ts(): string {
  return new Date().toISOString();
}

function emit(level: LogLevel, scope: string, msg: string, extra?: unknown) {
  const prefix = `[${ts()}] [agent:${scope}] ${level.toUpperCase()}`;
  if (extra === undefined) {
    console.log(`${prefix} ${msg}`);
    return;
  }
  console.log(`${prefix} ${msg}`, extra);
}

/** Logger ringan untuk worker (output ke stdout → PM2 logs). */
export function createLogger(scope: string) {
  return {
    debug: (msg: string, extra?: unknown) => {
      if (process.env.VANDOR_AGENT_DEBUG === "true") {
        emit("debug", scope, msg, extra);
      }
    },
    info: (msg: string, extra?: unknown) => emit("info", scope, msg, extra),
    warn: (msg: string, extra?: unknown) => emit("warn", scope, msg, extra),
    error: (msg: string, extra?: unknown) => emit("error", scope, msg, extra),
  };
}

export type Logger = ReturnType<typeof createLogger>;
