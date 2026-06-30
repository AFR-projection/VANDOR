import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectDocumentExportFormat } from "@/lib/platform/document/detect-format";

describe("document export format detection", () => {
  it("detects excel requests as xlsx", () => {
    assert.equal(
      detectDocumentExportFormat("BUATKAN GUA FILE EXCEL YANG PALING CANGGIH"),
      "xlsx"
    );
  });

  it("detects pdf explicitly", () => {
    assert.equal(detectDocumentExportFormat("buat pdf laporan"), "pdf");
  });

  it("detects docx", () => {
    assert.equal(detectDocumentExportFormat("export word docx surat"), "docx");
  });

  it("respects explicit input format over text", () => {
    assert.equal(
      detectDocumentExportFormat("buat pdf", { format: "xlsx" }),
      "xlsx"
    );
  });
});
