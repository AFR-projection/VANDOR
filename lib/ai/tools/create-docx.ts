import "server-only";

import { tool } from "ai";
import { z } from "zod";
import { putFile, StorageNotConfiguredError } from "@/lib/storage/blob";

export const createDocx = tool({
  description:
    "Generate a downloadable Word (.docx) document and return a public URL. Use when the user explicitly asks for a Word document, letter, report, or .docx export. Lines starting with '# ', '## ', '### ' become headings.",
  inputSchema: z.object({
    title: z.string().min(1).max(160),
    body: z.string().min(1).max(60_000),
  }),
  execute: async ({ title, body }) => buildDocxExport({ title, body }),
});

export async function buildDocxExport(input: { title: string; body: string }) {
  const { title, body } = input;
  try {
      const { Document, Packer, Paragraph, HeadingLevel, TextRun } =
        await import("docx");

      const paragraphs: InstanceType<typeof Paragraph>[] = [
        new Paragraph({
          text: title,
          heading: HeadingLevel.TITLE,
        }),
      ];

      for (const rawLine of body.split(/\r?\n/)) {
        const line = rawLine.trimEnd();
        if (!line) {
          paragraphs.push(new Paragraph({ text: "" }));
          continue;
        }
        if (line.startsWith("# ")) {
          paragraphs.push(
            new Paragraph({
              text: line.slice(2),
              heading: HeadingLevel.HEADING_1,
            })
          );
        } else if (line.startsWith("## ")) {
          paragraphs.push(
            new Paragraph({
              text: line.slice(3),
              heading: HeadingLevel.HEADING_2,
            })
          );
        } else if (line.startsWith("### ")) {
          paragraphs.push(
            new Paragraph({
              text: line.slice(4),
              heading: HeadingLevel.HEADING_3,
            })
          );
        } else if (line.startsWith("- ") || line.startsWith("* ")) {
          paragraphs.push(
            new Paragraph({
              children: [new TextRun({ text: `• ${line.slice(2)}` })],
            })
          );
        } else {
          paragraphs.push(
            new Paragraph({ children: [new TextRun({ text: line })] })
          );
        }
      }

      const doc = new Document({
        sections: [{ properties: {}, children: paragraphs }],
        creator: "VANDOR",
        title,
      });

      const buf = await Packer.toBuffer(doc);

      const safeName = title
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .slice(0, 60)
        .replace(/_+$/, "");
      const stored = await putFile(`${safeName || "document"}.docx`, buf, {
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        addRandomSuffix: true,
      });

      return {
        ok: true,
        kind: "docx" as const,
        title,
        url: stored.url,
        filename: `${safeName || "document"}.docx`,
        bytes: buf.byteLength,
      };
    } catch (e) {
      if (e instanceof StorageNotConfiguredError) {
        return { ok: false, kind: "docx" as const, title, error: e.message };
      }
      throw e;
    }
}
