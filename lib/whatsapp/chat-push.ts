import "server-only";

import { EventEmitter } from "node:events";

declare global {
  // eslint-disable-next-line no-var
  var __vandorWaChatEmitter: EventEmitter | undefined;
}

function getEmitter(): EventEmitter {
  if (!globalThis.__vandorWaChatEmitter) {
    globalThis.__vandorWaChatEmitter = new EventEmitter();
    globalThis.__vandorWaChatEmitter.setMaxListeners(200);
  }
  return globalThis.__vandorWaChatEmitter;
}

/** Broadcast that a chat has new messages (call after saving WA messages). */
export function emitChatUpdated(chatId: string): void {
  getEmitter().emit(`chat:${chatId}`, chatId);
  // Also broadcast a generic "any WA chat updated" event for sidebar refresh.
  getEmitter().emit("wa:any", chatId);
}

/** Subscribe to updates for a specific chat. Returns unsubscribe fn. */
export function onChatUpdated(
  chatId: string,
  listener: () => void
): () => void {
  const emitter = getEmitter();
  emitter.on(`chat:${chatId}`, listener);
  return () => emitter.off(`chat:${chatId}`, listener);
}

/** Subscribe to any WA chat update (for sidebar). Returns unsubscribe fn. */
export function onAnyWaChatUpdated(
  listener: (chatId: string) => void
): () => void {
  const emitter = getEmitter();
  emitter.on("wa:any", listener);
  return () => emitter.off("wa:any", listener);
}
