import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildHeuristicPlan } from "./planner/heuristic-planner";

describe("platform phase 5 — deploy agent plans", () => {
  it("operator deploy intent routes to monitoring + deploy", () => {
    const plan = buildHeuristicPlan({
      userText: "deploy ke production vps sekarang",
      intent: "operator",
    });
    assert.ok(plan.steps.some((s) => s.agentId === "monitoring"));
    assert.ok(
      plan.steps.some(
        (s) => s.agentId === "deploy" && s.input?.action === "dispatch"
      )
    );
    assert.ok(plan.steps.some((s) => s.agentId === "chat"));
  });

  it("code + deploy adds deploy step after testing", () => {
    const plan = buildHeuristicPlan({
      userText: "fix error typescript lalu deploy ke prod",
      intent: "code",
    });
    assert.ok(plan.steps.some((s) => s.agentId === "testing"));
    assert.ok(plan.steps.some((s) => s.agentId === "fix"));
    assert.ok(plan.steps.some((s) => s.agentId === "deploy"));
  });

  it("operator scan without deploy keeps coding path", () => {
    const plan = buildHeuristicPlan({
      userText: "scan codebase dan cek error",
      intent: "operator",
    });
    assert.ok(plan.steps.some((s) => s.agentId === "coding"));
    assert.equal(
      plan.steps.some((s) => s.agentId === "deploy"),
      false
    );
  });
});
