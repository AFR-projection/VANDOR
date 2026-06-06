/** Max tool-call steps (model round-trips). Hard cap for agent loop. */
export const V4_MAX_AGENT_STEPS = 4;

/** Target active tools per request. */
export const V4_MAX_ACTIVE_TOOLS = 5;

/** Long-term memory block cap (~900–1100 tokens). */
export const V4_MAX_MEMORY_CONTEXT_CHARS = 4500;

/** Memories injected after scoring. */
export const V4_MAX_MEMORY_ITEMS = 8;

/** Recent chat messages sent to the model (plus summary in system). */
export const V4_MAX_CHAT_MESSAGES = 10;
