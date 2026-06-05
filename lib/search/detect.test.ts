import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectWebSearchNeed, shouldDisableWebSearchTool } from "./detect";

describe("detectWebSearchNeed", () => {
  it("detects sports live score queries", () => {
    const r = detectWebSearchNeed(
      "INTERNATIONAL FRIENDLY Spain vs Iraq berapa skornya sekarang broo"
    );
    assert.equal(r.needed, true);
    assert.equal(r.reason, "live_data");
  });

  it("detects gold price prediction", () => {
    const r = detectWebSearchNeed(
      "Prediksi harga emas di indonesia untuk 2 bulan kedepan"
    );
    assert.equal(r.needed, true);
  });

  it("skips simple greetings", () => {
    const r = detectWebSearchNeed("halo");
    assert.equal(r.needed, false);
  });

  it("skips personal note with biaya transfer", () => {
    const r = detectWebSearchNeed(
      "Judul: ayam petelur\nIsi: username BDR@ biaya transfer 50rb rekening BCA"
    );
    assert.equal(r.needed, false);
    assert.equal(r.reason, "local_task");
  });

  it("skips catat slash-style note", () => {
    const r = detectWebSearchNeed(
      "simpan catatan usaha ayam petelur modal 5 juta biaya pakan bulanan"
    );
    assert.equal(r.needed, false);
  });

  it("detects explicit web search request", () => {
    const r = detectWebSearchNeed(
      "cari di google harga tiket jakarta bali besok"
    );
    assert.equal(r.needed, true);
  });

  it("does not search bare biaya without live context", () => {
    const r = detectWebSearchNeed("catat biaya operasional bulan ini 2 juta");
    assert.equal(r.needed, false);
  });

  it("detects news with recency", () => {
    const r = detectWebSearchNeed("berita teknologi terbaru hari ini apa?");
    assert.equal(r.needed, true);
  });

  it("detects link follow-up with prior user context", () => {
    const r = detectWebSearchNeed("berikan linknya", {
      priorUserTexts: ["gue suka DJ vinahouse Mandarin dan English"],
    });
    assert.equal(r.needed, true);
    assert.equal(r.reason, "link_follow_up");
    assert.match(r.query, /vinahouse|DJ/i);
    assert.match(r.query, /youtube|soundcloud/i);
  });

  it("detects bare link request", () => {
    const r = detectWebSearchNeed("kasih link youtube playlist");
    assert.equal(r.needed, true);
    assert.equal(r.reason, "link_request");
  });

  it("disables web search tool for local notes", () => {
    assert.equal(
      shouldDisableWebSearchTool(
        "Judul: ayam petelur\nIsi: BDR@ biaya transfer"
      ),
      true
    );
    assert.equal(
      shouldDisableWebSearchTool("Spain vs Iraq berapa skor sekarang"),
      false
    );
  });
});
