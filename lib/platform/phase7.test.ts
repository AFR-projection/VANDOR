import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PLATFORM_AGENT_DEFINITIONS } from "./agents/definitions";
import { MEMORY_SCOPES } from "./core/types";
import {
  filterMemoriesForScope,
  formatShortTermMemory,
  isValidMemoryScope,
  memoryRecordMatchesScope,
} from "./memory/scopes";

describe("platform phase 7 — memory scopes", () => {
  it("validates memory scope names", () => {
    for (const scope of MEMORY_SCOPES) {
      assert.equal(isValidMemoryScope(scope), true);
    }
    assert.equal(isValidMemoryScope("invalid"), false);
  });

  it("filters conversation memories by chatId", () => {
    const records = [
      {
        id: "1",
        content: "Chat A",
        category: "fact" as const,
        importance: 5,
        sourceChatId: "chat-a",
      },
      {
        id: "2",
        content: "Chat B",
        category: "fact" as const,
        importance: 5,
        sourceChatId: "chat-b",
      },
    ];

    const scoped = filterMemoriesForScope(records, "conversation", "chat-a");
    assert.equal(scoped.length, 1);
    assert.equal(scoped[0]?.content, "Chat A");
  });

  it("matches project memories by category or tag", () => {
    assert.equal(
      memoryRecordMatchesScope(
        {
          id: "1",
          content: "Build VANDOR",
          category: "goal",
          importance: 8,
          metadata: null,
        },
        "project",
        null
      ),
      true
    );
    assert.equal(
      memoryRecordMatchesScope(
        {
          id: "2",
          content: "Random",
          category: "fact",
          importance: 5,
          metadata: { platformScope: "project" },
        },
        "project",
        null
      ),
      true
    );
  });

  it("formats short-term memory from prior steps", () => {
    const text = formatShortTermMemory(
      [
        {
          stepKey: "scan",
          agentId: "coding",
          output: { summary: "3 error TS" },
        },
      ],
      "run-12345678"
    );
    assert.match(text, /coding\/scan/);
    assert.match(text, /3 error TS/);
  });

  it("every agent declares memory scopes", () => {
    for (const agent of PLATFORM_AGENT_DEFINITIONS) {
      assert.ok(agent.memoryScopes.length >= 1, `${agent.id} missing scopes`);
      for (const scope of agent.memoryScopes) {
        assert.ok(
          isValidMemoryScope(scope),
          `${agent.id} invalid scope ${scope}`
        );
      }
    }
  });

  it("memory agent has all scopes", () => {
    const memory = PLATFORM_AGENT_DEFINITIONS.find((a) => a.id === "memory");
    assert.ok(memory);
    assert.equal(memory?.memoryScopes.length, MEMORY_SCOPES.length);
  });

  it("reads injected memory pack from step input", async () => {
    const { readAgentMemoryPack } = await import("./memory/types");
    const pack = readAgentMemoryPack({
      _platformMemory: {
        agentId: "coding",
        scopes: ["project"],
        byScope: { project: "- [8/10] Build VANDOR" },
        context: "## Memori agent (coding)",
        itemCount: 1,
      },
    });
    assert.ok(pack);
    assert.equal(pack?.agentId, "coding");
    assert.equal(pack?.itemCount, 1);
  });

  it("builds step memory view for dashboard", async () => {
    const prev = process.env.PLATFORM_V2_ENABLED;
    process.env.PLATFORM_V2_ENABLED = "true";
    const { resetPlatformBootstrapForTests, bootstrapPlatformV2 } =
      await import("./init");
    const { buildStepMemoryView } = await import("./dashboard/step-memory");
    resetPlatformBootstrapForTests();
    bootstrapPlatformV2();

    const pending = buildStepMemoryView("coding", null, "queued");
    assert.ok(pending.scopes.length >= 1);
    assert.equal(pending.hasSnapshot, false);
    assert.equal(pending.scopes[0]?.state, "configured");

    const running = buildStepMemoryView(
      "coding",
      {
        _platformMemory: {
          agentId: "coding",
          scopes: ["project", "short_term"],
          byScope: {
            project: "- [8/10] Build VANDOR",
            short_term: "Run abc — prior step",
          },
          context: "ctx",
          itemCount: 2,
        },
      },
      "running"
    );
    assert.equal(running.hasSnapshot, true);
    assert.equal(running.itemCount, 2);
    assert.equal(running.scopes.find((s) => s.scope === "project")?.state, "loaded");
    assert.ok(running.scopes.find((s) => s.scope === "project")?.preview);

    process.env.PLATFORM_V2_ENABLED = prev;
  });
});
