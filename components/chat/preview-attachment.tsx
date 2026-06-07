import {
  FileAudio2Icon,
  FileCodeIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FileVideo2Icon,
  FileIcon as GenericFileIcon,
} from "lucide-react";
import { resolveChatFileDisplayUrl } from "@/lib/files/chat-file-url";
import type { Attachment } from "@/lib/types";
import { Spinner } from "../ui/spinner";
import { CrossSmallIcon } from "./icons";

function shortName(name: string, max = 14): string {
  if (name.length <= max) return name;
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot) : "";
  const stem = name.slice(0, dot > 0 ? dot : name.length);
  return `${stem.slice(0, max - ext.length - 1)}…${ext}`;
}

function pickIcon(mime: string, name: string) {
  if (mime.startsWith("video/")) return FileVideo2Icon;
  if (mime.startsWith("audio/")) return FileAudio2Icon;
  if (
    mime === "application/pdf" ||
    mime.startsWith("text/") ||
    /\.(md|txt|log|rtf)$/i.test(name)
  )
    return FileTextIcon;
  if (
    mime.includes("spreadsheet") ||
    mime === "text/csv" ||
    /\.(csv|xlsx?|tsv)$/i.test(name)
  )
    return FileSpreadsheetIcon;
  if (
    mime === "application/json" ||
    /\.(json|ya?ml|toml|tsx?|jsx?|py|rb|go|rs|java|c|cpp|cs|php|sh)$/i.test(
      name
    )
  )
    return FileCodeIcon;
  return GenericFileIcon;
}

export const PreviewAttachment = ({
  attachment,
  isUploading = false,
  onRemove,
}: {
  attachment: Attachment;
  isUploading?: boolean;
  onRemove?: () => void;
}) => {
  const { name, url, contentType } = attachment;
  const displayUrl = resolveChatFileDisplayUrl(url);
  const mime = contentType ?? "";
  const isImage = mime.startsWith("image/");

  const Icon = pickIcon(mime, name ?? "");

  return (
    <div
      className="group relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-border/40 bg-muted"
      data-testid="input-attachment-preview"
    >
      {isImage ? (
        // Use plain <img> to bypass next/image optimization — works for any
        // backend (Vercel Blob, local /storage/..., data URLs).
        <img
          alt={name ?? "attachment"}
          className="size-full object-cover"
          src={displayUrl}
        />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-1 px-1.5 text-muted-foreground">
          <Icon className="size-7 opacity-70" />
          {name && (
            <span className="line-clamp-2 text-center text-[9px] leading-tight">
              {shortName(name, 18)}
            </span>
          )}
        </div>
      )}

      {isUploading && (
        <div
          className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40 backdrop-blur-sm"
          data-testid="input-attachment-loader"
        >
          <Spinner className="size-5" />
        </div>
      )}

      {onRemove && !isUploading && (
        <button
          className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/80 group-hover:opacity-100"
          onClick={onRemove}
          type="button"
        >
          <CrossSmallIcon size={10} />
        </button>
      )}
    </div>
  );
};
