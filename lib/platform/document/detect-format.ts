export type DocumentExportFormat = "pdf" | "xlsx" | "csv" | "docx";

export function detectDocumentExportFormat(
  userText: string,
  input: Record<string, unknown> = {}
): DocumentExportFormat {
  const explicit = String(input.format ?? input.exportFormat ?? "")
    .toLowerCase()
    .trim();
  if (
    explicit === "pdf" ||
    explicit === "xlsx" ||
    explicit === "csv" ||
    explicit === "docx"
  ) {
    return explicit;
  }

  const text = userText.toLowerCase();

  if (/\b(excel|xlsx|xls|spreadsheet|sheet)\b/.test(text)) {
    return "xlsx";
  }
  if (/\bcsv\b/.test(text)) {
    return "csv";
  }
  if (/\b(docx|word|dokumen word)\b/.test(text)) {
    return "docx";
  }
  if (/\bpdf\b/.test(text)) {
    return "pdf";
  }

  if (/\b(file|dokumen|laporan|export|unduh|download)\b/.test(text)) {
    return "pdf";
  }

  return "pdf";
}

export function documentFormatLabel(format: DocumentExportFormat): string {
  switch (format) {
    case "xlsx":
      return "Excel (.xlsx)";
    case "csv":
      return "CSV";
    case "docx":
      return "Word (.docx)";
    default:
      return "PDF";
  }
}
