import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PLATFORM_AGENT_DEFINITIONS } from "./agents/definitions";
import { registerPlatformAgents } from "./agents/index";
import { defineAgent } from "./core/agent-definition";
import {
  clearAgentRegistry,
  getAgent,
  listAgentIds,
  registerAgent,
} from "./core/agent-registry";
import { buildStaticToolCatalog } from "./core/tool-catalog";
import {
  listTools,
  listToolsForAgent,
  resetToolCatalogForTests,
} from "./core/tool-registry";
import { PLATFORM_AGENT_IDS } from "./core/types";
import { bootstrapPlatformV2, resetPlatformBootstrapForTests } from "./init";

describe("platform agent registry", () => {
  it("registers all 12 V2 agents", () => {
    clearAgentRegistry();
    registerPlatformAgents();
    assert.equal(listAgentIds().length, 12);
    for (const id of PLATFORM_AGENT_IDS) {
      assert.ok(getAgent(id), `missing agent ${id}`);
    }
    clearAgentRegistry();
  });

  it("rejects duplicate agent registration", () => {
    clearAgentRegistry();
    const def = defineAgent({
      id: "chat",
      name: "Chat",
      description: "test",
      capabilities: [],
      tools: [],
      memoryScopes: ["user"],
      execute: async () => ({ ok: true }),
    });
    registerAgent(def);
    assert.throws(() => registerAgent(def));
    clearAgentRegistry();
  });

  it("definitions match PLATFORM_AGENT_IDS", () => {
    assert.equal(PLATFORM_AGENT_DEFINITIONS.length, PLATFORM_AGENT_IDS.length);
  });
});

describe("platform tool catalog", () => {
  it("includes chat and worker tools", () => {
    resetToolCatalogForTests();
    const staticCatalog = buildStaticToolCatalog();
    assert.ok(staticCatalog.length >= 25);
    assert.ok(staticCatalog.some((t) => t.name === "webSearch"));
    assert.ok(staticCatalog.some((t) => t.name === "monitor.metrics"));
  });

  it("filters tools by agent", () => {
    resetToolCatalogForTests();
    listTools();
    const browserTools = listToolsForAgent("browser");
    assert.ok(browserTools.some((t) => t.name === "webSearch"));
    const codingTools = listToolsForAgent("coding");
    assert.ok(codingTools.some((t) => t.name === "createDocument"));
  });
});

describe("platform bootstrap", () => {
  it("returns disabled when env flag off", () => {
    const prev = process.env.PLATFORM_V2_ENABLED;
    process.env.PLATFORM_V2_ENABLED = "false";
    resetPlatformBootstrapForTests();
    clearAgentRegistry();
    resetToolCatalogForTests();
    const boot = bootstrapPlatformV2();
    assert.equal(boot.enabled, false);
    process.env.PLATFORM_V2_ENABLED = prev;
  });
});
