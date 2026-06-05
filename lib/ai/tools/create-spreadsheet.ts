import "server-only";

import { tool } from "ai";
import { z } from "zod";
import { putFile, StorageNotConfiguredError } from "@/lib/storage/blob";

const SheetSchema = z.object({
  name: z.string().min(1).max(31).describe("Sheet name (max 31 chars)"),
  rows: z
    .array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])))
    .describe(
      "2D array of cell values. First row is treated as the header row."
    ),
});

export const createSpreadsheet = tool({
  description:
    "Generate a downloadable Excel (.xlsx) spreadsheet from one or more sheets and return a public URL. Use whenever the user asks for a spreadsheet, table export, budget, schedule, dataset, or .xlsx file.",
  inputSchema: z.object({
    title: z.string().min(1).max(120),
    format: z.enum(["xlsx", "csv"]).optional().default("xlsx"),
    sheets: z.array(SheetSchema).min(1).max(20),
  }),
  execute: async ({ title, format, sheets }) => {
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();

      for (const s of sheets) {
        const ws = XLSX.utils.aoa_to_sheet(
          s.rows as (string | number | boolean | null)[][]
        );
        XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
      }

      const safeName = title
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .slice(0, 60)
        .replace(/_+$/, "");

      if (format === "csv") {
        const csv = XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]]);
        const buf = Buffer.from(csv, "utf8");
        const stored = await putFile(`${safeName || "data"}.csv`, buf, {
          contentType: "text/csv",
          addRandomSuffix: true,
        });
        return {
          ok: true,
          kind: "csv" as const,
          title,
          url: stored.url,
          filename: `${safeName || "data"}.csv`,
          bytes: buf.byteLength,
          sheets: sheets.length,
        };
      }

      const out = XLSX.write(wb, {
        type: "buffer",
        bookType: "xlsx",
      }) as Buffer;
      const stored = await putFile(`${safeName || "data"}.xlsx`, out, {
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        addRandomSuffix: true,
      });

      return {
        ok: true,
        kind: "xlsx" as const,
        title,
        url: stored.url,
        filename: `${safeName || "data"}.xlsx`,
        bytes: out.byteLength,
        sheets: sheets.length,
      };
    } catch (e) {
      if (e instanceof StorageNotConfiguredError) {
        return {
          ok: false,
          kind: format === "csv" ? ("csv" as const) : ("xlsx" as const),
          title,
          error: e.message,
        };
      }
      throw e;
    }
  },
});
