import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildHeuristicPlan } from "./planner/heuristic-planner";

describe("platform phase 4 — testing + fix plans", () => {
  it("code intent includes full testing", () => {
    const plan = buildHeuristicPlan({
      userText: "refactor modul auth dan verifikasi",
      intent: "code",
    });
    assert.ok(plan.steps.some((s) => s.agentId === "coding"));
    assert.ok(
      plan.steps.some(
        (s) => s.agentId === "testing" && s.input?.scope === "full"
      )
    );
    assert.ok(plan.steps.some((s) => s.agentId === "chat"));
  });

  it("code intent with fix keyword adds fix agent", () => {
    const plan = buildHeuristicPlan({
      userText: "perbaiki error typescript di modul auth",
      intent: "code",
    });
    assert.ok(plan.steps.some((s) => s.agentId === "fix"));
  });

  it("operator scan + fix adds fix step", () => {
    const plan = buildHeuristicPlan({
      userText: "scan codebase dan fix error",
      intent: "operator",
    });
    assert.ok(plan.steps.some((s) => s.agentId === "coding"));
    assert.ok(plan.steps.some((s) => s.agentId === "fix"));
  });
});
