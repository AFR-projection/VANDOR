export type StepDeliverable = {
  kind: "file" | "image";
  url: string;
  label: string;
};

function defaultFileLabel(kind?: string): string {
  if (kind === "xlsx") {
    return "spreadsheet.xlsx";
  }
  if (kind === "docx") {
    return "document.docx";
  }
  if (kind === "csv") {
    return "data.csv";
  }
  if (kind === "pdf") {
    return "document.pdf";
  }
  return "file";
}

function readUrlPayload(
  payload: Record<string, unknown> | undefined
): StepDeliverable | null {
  if (!payload?.url || typeof payload.url !== "string") {
    return null;
  }
  const url = payload.url.trim();
  if (!url.startsWith("http")) {
    return null;
  }

  const kind = String(payload.kind ?? "");
  const isImage =
    kind === "image" ||
    /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url) ||
    String(payload.mime ?? "").startsWith("image/");

  const label =
    String(payload.filename ?? "").trim() ||
    String(payload.title ?? "").trim() ||
    String(payload.prompt ?? "").trim().slice(0, 80) ||
    String(payload.instruction ?? "").trim().slice(0, 80) ||
    (isImage ? "Gambar" : defaultFileLabel(kind));

  return {
    kind: isImage ? "image" : "file",
    url,
    label,
  };
}

/** Ekstrak file/gambar siap unduh dari output step agent — prioritas di atas summary teks. */
export function extractStepDeliverable(
  out: Record<string, unknown> | null | undefined
): StepDeliverable | null {
  if (!out) {
    return null;
  }

  const document = out.document as Record<string, unknown> | undefined;
  const fromDocument = readUrlPayload(document);
  if (fromDocument) {
    return fromDocument;
  }

  const image = out.image as Record<string, unknown> | undefined;
  const fromImage = readUrlPayload(image);
  if (fromImage) {
    return { ...fromImage, kind: "image" };
  }

  return readUrlPayload(out);
}

export function formatDeliverableMarkdown(deliverable: StepDeliverable): string {
  if (deliverable.kind === "image") {
    return `![${deliverable.label}](${deliverable.url})`;
  }
  return `📎 [Unduh ${deliverable.label}](${deliverable.url})`;
}

export function formatDeliverableSummary(deliverable: StepDeliverable): string {
  if (deliverable.kind === "image") {
    return `Gambar siap — ${formatDeliverableMarkdown(deliverable)}`;
  }
  return formatDeliverableMarkdown(deliverable);
}

export function summaryWithDownloadUrl(
  label: string,
  data: unknown
): string {
  const payload = data as Record<string, unknown> | undefined;
  const deliverable = readUrlPayload(payload);
  if (!deliverable) {
    return label;
  }
  return `${label} — ${formatDeliverableMarkdown(deliverable)}`;
}
