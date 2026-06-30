import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractStepDeliverable,
  formatDeliverableMarkdown,
} from "./deliverables";
import {
  summarizeStepOutput,
  synthesizeChatFromWorkflowSteps,
} from "./format-response";
import { buildHeuristicPlan } from "../planner/heuristic-planner";

describe("platform deliverables", () => {
  it("prioritizes download URL over generic summary for spreadsheets", () => {
    const out = {
      summary: 'Excel "excel" dibuat (XLSX)',
      document: {
        ok: true,
        url: "https://example.com/file.xlsx",
        filename: "report.xlsx",
        kind: "xlsx",
      },
    };
    const deliverable = extractStepDeliverable(out);
    assert.equal(deliverable?.kind, "file");
    assert.equal(deliverable?.url, "https://example.com/file.xlsx");
    assert.match(summarizeStepOutput(out), /Unduh report\.xlsx/);
    assert.match(summarizeStepOutput(out), /https:\/\/example\.com\/file\.xlsx/);
  });

  it("surfaces generated images in workflow synthesis", () => {
    const text = synthesizeChatFromWorkflowSteps({
      userText: "buat gambar vandor",
      priorSteps: [
        {
          stepKey: "generate_image",
          agentId: "tool",
          output: {
            image: {
              ok: true,
              kind: "image",
              url: "https://example.com/vandor.png",
              prompt: "logo vandor keren",
            },
          },
        },
      ],
    });
    assert.match(text, /!\[logo vandor keren\]/);
    assert.match(text, /https:\/\/example\.com\/vandor\.png/);
    assert.doesNotMatch(text, /Sudah diproses tim agent/);
  });

  it("image intent uses tool generate_image step", () => {
    const plan = buildHeuristicPlan({
      userText: "tolong buatkan gambar vandor keren",
      intent: "image",
    });
    assert.ok(
      plan.steps.some(
        (s) =>
          s.agentId === "tool" &&
          s.stepKey === "generate_image" &&
          s.input?.action === "generate_image"
      )
    );
    assert.ok(plan.steps.some((s) => s.agentId === "chat"));
  });

  it("formats image markdown deliverable", () => {
    const md = formatDeliverableMarkdown({
      kind: "image",
      url: "https://example.com/a.png",
      label: "VANDOR",
    });
    assert.equal(md, "![VANDOR](https://example.com/a.png)");
  });
});
