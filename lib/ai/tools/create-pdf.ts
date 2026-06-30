import "server-only";

import { tool } from "ai";
import { z } from "zod";
import { putFile, StorageNotConfiguredError } from "@/lib/storage/blob";

export const createPdf = tool({
  description:
    "Generate a downloadable PDF document and return a public URL. Use for reports, letters, summaries, invoices, anything the user wants as a PDF. Markdown-style headings (# Title, ## Section) are rendered.",
  inputSchema: z.object({
    title: z.string().min(1).max(160).describe("Document title"),
    body: z
      .string()
      .min(1)
      .max(40_000)
      .describe(
        "Document body. Use blank lines between paragraphs. Lines starting with '# ', '## ' or '### ' become headings."
      ),
    author: z.string().max(80).optional(),
  }),
  execute: async ({ title, body, author }) => {
    try {
      return await buildPdf({ title, body, author });
    } catch (e) {
      if (e instanceof StorageNotConfiguredError) {
        return {
          ok: false,
          kind: "pdf" as const,
          title,
          error: e.message,
        };
      }
      throw e;
    }
  },
});

export async function buildPdfFromMarkdown(input: {
  title: string;
  body: string;
  author?: string;
}) {
  return buildPdf(input);
}

async function buildPdf({
  title,
  body,
  author,
}: {
  title: string;
  body: string;
  author?: string;
}) {
  type PdfDoc = NodeJS.ReadableStream & {
    on(event: "data", listener: (chunk: Buffer) => void): PdfDoc;
    on(event: "end" | "error", listener: (...args: unknown[]) => void): PdfDoc;
    fontSize: (n: number) => PdfDoc;
    font: (n: string) => PdfDoc;
    text: (t: string, opts?: Record<string, unknown>) => PdfDoc;
    moveDown: (n?: number) => PdfDoc;
    end: () => void;
  };

  const PDFDocument = (await import("pdfkit")).default as unknown as new (
    opts?: Record<string, unknown>
  ) => PdfDoc;

  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 56, bottom: 56, left: 64, right: 64 },
    info: {
      Title: title,
      Author: author ?? "VANDOR",
      Creator: "VANDOR",
    },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  doc.font("Helvetica-Bold").fontSize(20).text(title);
  if (author) {
    doc.moveDown(0.3).font("Helvetica").fontSize(10).text(`— ${author}`);
  }
  doc.moveDown(1).font("Helvetica").fontSize(11);

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line) {
      doc.moveDown(0.5);
      continue;
    }
    if (line.startsWith("# ")) {
      doc.moveDown(0.4).font("Helvetica-Bold").fontSize(16).text(line.slice(2));
      doc.font("Helvetica").fontSize(11);
    } else if (line.startsWith("## ")) {
      doc.moveDown(0.3).font("Helvetica-Bold").fontSize(14).text(line.slice(3));
      doc.font("Helvetica").fontSize(11);
    } else if (line.startsWith("### ")) {
      doc.moveDown(0.2).font("Helvetica-Bold").fontSize(12).text(line.slice(4));
      doc.font("Helvetica").fontSize(11);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      doc.text(`• ${line.slice(2)}`, { indent: 12 });
    } else {
      doc.text(line);
    }
  }

  doc.end();
  const buf = await done;

  const safeName = title
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 60)
    .replace(/_+$/, "");
  const stored = await putFile(`${safeName || "document"}.pdf`, buf, {
    contentType: "application/pdf",
    addRandomSuffix: true,
  });

  return {
    ok: true,
    kind: "pdf" as const,
    title,
    url: stored.url,
    filename: `${safeName || "document"}.pdf`,
    bytes: buf.byteLength,
    backend: stored.backend,
  };
}
