import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatDurationMs,
  formatTimeAgo,
  isActiveRunStatus,
  runStatusTone,
  stepStatusTone,
  topicLabel,
} from "./dashboard/format";

describe("platform phase 6 — dashboard format", () => {
  it("detects active run statuses", () => {
    assert.equal(isActiveRunStatus("running"), true);
    assert.equal(isActiveRunStatus("completed"), false);
  });

  it("maps run status tones", () => {
    assert.equal(runStatusTone("completed"), "success");
    assert.equal(runStatusTone("failed"), "danger");
    assert.equal(runStatusTone("running"), "warning");
  });

  it("maps step status tones", () => {
    assert.equal(stepStatusTone("completed"), "success");
    assert.equal(stepStatusTone("queued"), "warning");
  });

  it("formats duration", () => {
    const start = new Date(Date.now() - 5000);
    assert.match(formatDurationMs(start), /5s/);
  });

  it("formats time ago for recent", () => {
    const recent = new Date(Date.now() - 30_000);
    assert.equal(formatTimeAgo(recent), "baru saja");
  });

  it("labels event topics", () => {
    assert.equal(topicLabel("workflow.completed"), "Workflow selesai");
    assert.equal(topicLabel("unknown.topic"), "unknown.topic");
  });
});

describe("platform phase 6 — definitions", () => {
  it("all 12 agents registered including deploy", async () => {
    const prev = process.env.PLATFORM_V2_ENABLED;
    process.env.PLATFORM_V2_ENABLED = "true";
    const { resetPlatformBootstrapForTests, bootstrapPlatformV2 } = await import(
      "./init"
    );
    const { listAgents } = await import("./core/agent-registry");
    resetPlatformBootstrapForTests();
    bootstrapPlatformV2();
    const agents = listAgents();
    assert.equal(agents.length, 12);
    assert.ok(agents.some((a) => a.id === "deploy"));
    process.env.PLATFORM_V2_ENABLED = prev;
  });
});
