import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildHeuristicPlan } from "./planner/heuristic-planner";
import {
  bootstrapPlatformV2,
  resetPlatformBootstrapForTests,
} from "./init";
import { clearAgentRegistry } from "./core/agent-registry";
import {
  listTools,
  resetToolCatalogForTests,
} from "./core/tool-registry";
import { getTool } from "@/lib/autonomous/tools/index";

describe("platform phase 3 — bootstrap worker tools", () => {
  it("registers monitor and shell worker tools", () => {
    const prev = process.env.PLATFORM_V2_ENABLED;
    process.env.PLATFORM_V2_ENABLED = "true";
    resetPlatformBootstrapForTests();
    clearAgentRegistry();
    resetToolCatalogForTests();
    bootstrapPlatformV2();
    assert.ok(getTool("monitor.metrics"));
    assert.ok(getTool("monitor.services"));
    assert.ok(getTool("shell.run"));
    const catalog = listTools();
    assert.ok(catalog.some((t) => t.name === "webSearch"));
    assert.ok(catalog.some((t) => t.name === "checkSystem"));
    process.env.PLATFORM_V2_ENABLED = prev;
  });
});

describe("platform phase 3 — heuristic plans", () => {
  it("operator + scan includes coding step", () => {
    const plan = buildHeuristicPlan({
      userText: "cek status server dan scan codebase",
      intent: "operator",
    });
    assert.ok(plan.steps.some((s) => s.agentId === "monitoring"));
    assert.ok(plan.steps.some((s) => s.agentId === "coding"));
    assert.ok(plan.steps.some((s) => s.agentId === "chat"));
  });
});
