import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeRetryDelayMs, retryAfterDate } from "./retry";
import { StepTimeoutError, withStepTimeout } from "./timeout";

describe("platform retry backoff", () => {
  it("increases delay with attempt", () => {
    const a1 = computeRetryDelayMs(1, 1000, 60_000);
    const a2 = computeRetryDelayMs(2, 1000, 60_000);
    const a3 = computeRetryDelayMs(3, 1000, 60_000);
    assert.ok(a1 >= 1000 && a1 <= 1100);
    assert.ok(a2 >= 2000 && a2 <= 2200);
    assert.ok(a3 >= 4000 && a3 <= 4400);
  });

  it("caps at maxMs", () => {
    const delay = computeRetryDelayMs(10, 1000, 5000);
    assert.ok(delay >= 5000 && delay <= 5500);
  });

  it("retryAfterDate is in the future", () => {
    const after = retryAfterDate(1, Date.now());
    assert.ok(after.getTime() > Date.now());
  });
});

describe("platform step timeout", () => {
  it("resolves fast promises", async () => {
    const result = await withStepTimeout(
      Promise.resolve({ ok: true }),
      5000,
      "orchestrator"
    );
    assert.deepEqual(result, { ok: true });
  });

  it("rejects slow promises", async () => {
    await assert.rejects(
      () =>
        withStepTimeout(
          new Promise((resolve) => {
            setTimeout(resolve, 200);
          }),
          50,
          "coding"
        ),
      (error: unknown) => {
        assert.ok(error instanceof StepTimeoutError);
        if (error instanceof StepTimeoutError) {
          assert.equal(error.agentId, "coding");
        }
        return true;
      }
    );
  });
});
