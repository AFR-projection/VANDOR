import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fallbackTitleFromUserText } from "@/lib/chat/title-utils";

describe("chat title utils", () => {
  it("truncates long user text for sidebar title", () => {
    const long = "a".repeat(80);
    const title = fallbackTitleFromUserText(long);
    assert.ok(title.length <= 56);
    assert.match(title, /…$/);
  });

  it("keeps short messages as title", () => {
    assert.equal(
      fallbackTitleFromUserText("cek status server"),
      "cek status server"
    );
  });
});
