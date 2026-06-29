import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isPlatformChatWorkflowEnabled,
  shouldRouteToPlatformWorkflow,
} from "./routing";

describe("platform chat routing (phase 2)", () => {
  it("fast-path intents skip workflow", () => {
    const prev = process.env.PLATFORM_V2_ENABLED;
    const prevChat = process.env.PLATFORM_V2_CHAT_WORKFLOW;
    process.env.PLATFORM_V2_ENABLED = "true";
    process.env.PLATFORM_V2_CHAT_WORKFLOW = "true";

    assert.equal(isPlatformChatWorkflowEnabled(), true);

    assert.equal(
      shouldRouteToPlatformWorkflow({
        intent: "weather",
        userText: "cuaca jakarta",
        attachmentKinds: [],
        bypassLlm: false,
      }),
      false
    );

    assert.equal(
      shouldRouteToPlatformWorkflow({
        intent: "chat_simple",
        userText: "halo",
        attachmentKinds: [],
        bypassLlm: false,
      }),
      false
    );

    process.env.PLATFORM_V2_ENABLED = prev;
    process.env.PLATFORM_V2_CHAT_WORKFLOW = prevChat;
  });

  it("complex intents route to workflow", () => {
    const prev = process.env.PLATFORM_V2_ENABLED;
    process.env.PLATFORM_V2_ENABLED = "true";

    assert.equal(
      shouldRouteToPlatformWorkflow({
        intent: "code",
        userText: "refactor modul auth",
        attachmentKinds: [],
        bypassLlm: false,
      }),
      true
    );

    assert.equal(
      shouldRouteToPlatformWorkflow({
        intent: "operator",
        userText: "cek status server",
        attachmentKinds: [],
        bypassLlm: false,
      }),
      true
    );

    assert.equal(
      shouldRouteToPlatformWorkflow({
        intent: "search",
        userText: "x".repeat(300),
        attachmentKinds: [],
        bypassLlm: false,
      }),
      true
    );

    process.env.PLATFORM_V2_ENABLED = prev;
  });

  it("disabled when PLATFORM_V2_CHAT_WORKFLOW=false", () => {
    const prev = process.env.PLATFORM_V2_ENABLED;
    const prevChat = process.env.PLATFORM_V2_CHAT_WORKFLOW;
    process.env.PLATFORM_V2_ENABLED = "true";
    process.env.PLATFORM_V2_CHAT_WORKFLOW = "false";

    assert.equal(isPlatformChatWorkflowEnabled(), false);
    assert.equal(
      shouldRouteToPlatformWorkflow({
        intent: "code",
        userText: "build api",
        attachmentKinds: [],
        bypassLlm: false,
      }),
      false
    );

    process.env.PLATFORM_V2_ENABLED = prev;
    process.env.PLATFORM_V2_CHAT_WORKFLOW = prevChat;
  });
});
