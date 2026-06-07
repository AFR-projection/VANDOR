import { z } from "zod";

const textPartSchema = z.object({
  type: z.enum(["text"]),
  text: z.string().min(1).max(10_000),
});

/** AI SDK sends `filename`; legacy schema used `name`. Accept both. */
const filePartSchema = z
  .object({
    type: z.enum(["file"]),
    mediaType: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[\w.+-]+\/[\w.+-]+$/, "Invalid MIME type"),
    name: z.string().min(1).max(255).optional(),
    filename: z.string().min(1).max(255).optional(),
    url: z.union([
      z.string().url(),
      z.string().regex(/^\/api\/files\/raw\?key=/),
      z.string().regex(/^data:[\w.+-]+\/[\w.+-]+;base64,/),
    ]),
  })
  .refine((p) => Boolean(p.name?.trim() || p.filename?.trim()), {
    message: "File part requires name or filename",
    path: ["name"],
  })
  .transform((p) => ({
    type: "file" as const,
    mediaType: p.mediaType,
    name: (p.name ?? p.filename ?? "file").trim(),
    url: p.url,
  }));

const partSchema = z.union([textPartSchema, filePartSchema]);

const userMessageSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(["user"]),
  parts: z.array(partSchema).min(1),
});

const toolApprovalMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  parts: z.array(z.record(z.unknown())),
});

export const postRequestBodySchema = z.object({
  id: z.string().uuid(),
  message: userMessageSchema.optional(),
  messages: z.array(toolApprovalMessageSchema).optional(),
  selectedChatModel: z.string(),
  selectedVisibilityType: z.enum(["public", "private"]),
});

export type PostRequestBody = z.infer<typeof postRequestBodySchema>;
