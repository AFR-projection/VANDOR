import "server-only";

import type { UIMessageStreamWriter } from "ai";
import type { ChatMessage } from "@/lib/types";
import type { AgentActivityUpdate } from "./types";

type DataStreamWriter = UIMessageStreamWriter<ChatMessage>;

function stamp<T extends AgentActivityUpdate>(update: T): T {
  return { ...update, at: update.at ?? Date.now() };
}

export function writeAgentActivity(
  dataStream: DataStreamWriter,
  update: AgentActivityUpdate
): void {
  dataStream.write({
    type: "data-agent-activity",
    data: stamp(update),
  });
}

export function agentStatus(dataStream: DataStreamWriter, label: string): void {
  writeAgentActivity(dataStream, { kind: "status", label });
}

export function agentStepStart(
  dataStream: DataStreamWriter,
  id: string,
  label: string
): void {
  writeAgentActivity(dataStream, { kind: "step-start", id, label });
}

export function agentStepComplete(
  dataStream: DataStreamWriter,
  id: string
): void {
  writeAgentActivity(dataStream, { kind: "step-complete", id });
}

export function agentEvent(
  dataStream: DataStreamWriter,
  message: string,
  level: "info" | "success" | "warn" = "info"
): void {
  writeAgentActivity(dataStream, {
    kind: "event",
    message,
    level,
  });
}

export function agentTrace(
  dataStream: DataStreamWriter,
  message: string
): void {
  writeAgentActivity(dataStream, { kind: "trace", message });
}

export function agentProgress(
  dataStream: DataStreamWriter,
  value: number
): void {
  writeAgentActivity(dataStream, { kind: "progress", value });
}

export function agentDone(dataStream: DataStreamWriter): void {
  writeAgentActivity(dataStream, { kind: "done" });
}
