"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import equal from "fast-deep-equal";
import { ArrowUpIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  type ChangeEvent,
  type Dispatch,
  memo,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { useLocalStorage, useWindowSize } from "usehooks-ts";
import { ChatModelStatusStrip } from "@/components/chat/chat-model-status";
import { OpenRouterModelPicker } from "@/components/chat/openrouter-model-picker";
import { toast as notify } from "@/components/chat/toast";
import { useIsMobile } from "@/hooks/use-mobile";
import type { ModelCapabilities } from "@/lib/ai/models";
import { isBareMediaSlash, parseMediaSlash } from "@/lib/chat/media-slash";
import {
  isLegacyVaultChatCommand,
  parseVaultEnter,
  parseVaultModeAdd,
} from "@/lib/chat/vault-slash";
import { resolveChatFileDisplayUrl } from "@/lib/files/chat-file-url";
import type { Attachment, ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "../ai-elements/prompt-input";
import { Button } from "../ui/button";
import { PaperclipIcon, StopIcon } from "./icons";
import { PreviewAttachment } from "./preview-attachment";
import {
  type SlashCommand,
  SlashCommandMenu,
  slashCommands,
} from "./slash-commands";
import type { VisibilityType } from "./visibility-selector";
import { VoiceInputButton } from "./voice-input-button";

function PureMultimodalInput({
  chatId,
  chatMode,
  input,
  setInput,
  status,
  stop,
  attachments,
  setAttachments,
  messages,
  setMessages,
  sendMessage,
  className,
  selectedVisibilityType: _selectedVisibilityType,
  selectedModelId,
  onModelChange,
  editingMessage,
  onCancelEdit,
  isLoading: _isLoading,
}: {
  chatId: string;
  chatMode: "chat" | "vault" | "vault-locked";
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  status: UseChatHelpers<ChatMessage>["status"];
  stop: () => void;
  attachments: Attachment[];
  setAttachments: Dispatch<SetStateAction<Attachment[]>>;
  messages: UIMessage[];
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  sendMessage:
    | UseChatHelpers<ChatMessage>["sendMessage"]
    | (() => Promise<void>);
  className?: string;
  selectedVisibilityType: VisibilityType;
  selectedModelId: string;
  onModelChange?: (modelId: string) => void;
  editingMessage?: ChatMessage | null;
  onCancelEdit?: () => void;
  isLoading?: boolean;
}) {
  const router = useRouter();
  const { setTheme, resolvedTheme } = useTheme();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { width } = useWindowSize();
  const isMobile = useIsMobile();
  const hasAutoFocused = useRef(false);
  useEffect(() => {
    if (isMobile || !width || hasAutoFocused.current) return;
    const timer = setTimeout(() => {
      textareaRef.current?.focus();
      hasAutoFocused.current = true;
    }, 100);
    return () => clearTimeout(timer);
  }, [width, isMobile]);

  const [localStorageInput, setLocalStorageInput] = useLocalStorage(
    "input",
    ""
  );

  useEffect(() => {
    if (textareaRef.current) {
      const domValue = textareaRef.current.value;
      const finalValue = domValue || localStorageInput || "";
      setInput(finalValue);
    }
  }, [localStorageInput, setInput]);

  useEffect(() => {
    setLocalStorageInput(input);
  }, [input, setLocalStorageInput]);

  const handleInput = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = event.target.value;
    setInput(val);

    if (val.startsWith("/") && !val.includes(" ")) {
      setSlashOpen(true);
      setSlashQuery(val.slice(1));
      setSlashIndex(0);
    } else {
      setSlashOpen(false);
    }
  };

  const handleSlashSelect = (cmd: SlashCommand) => {
    setSlashOpen(false);

    if (cmd.sendText && typeof sendMessage === "function") {
      setInput("");
      void sendMessage({ text: cmd.sendText });
      return;
    }

    if (cmd.insertText) {
      setInput(cmd.insertText);
      requestAnimationFrame(() => textareaRef.current?.focus());
      return;
    }

    setInput("");
    switch (cmd.action) {
      case "new":
        router.push("/");
        break;
      case "clear":
        setMessages(() => []);
        break;
      case "rename":
        toast("Rename is available from the sidebar chat menu.");
        break;
      case "model": {
        const modelBtn = document.querySelector<HTMLButtonElement>(
          "[data-testid='model-selector']"
        );
        modelBtn?.click();
        break;
      }
      case "theme":
        setTheme(resolvedTheme === "dark" ? "light" : "dark");
        break;
      case "delete":
        toast("Delete this chat?", {
          action: {
            label: "Delete",
            onClick: () => {
              fetch(
                `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/chat?id=${chatId}`,
                { method: "DELETE" }
              );
              router.push("/");
              toast.success("Chat deleted");
            },
          },
        });
        break;
      case "purge":
        toast("Delete all chats?", {
          action: {
            label: "Delete all",
            onClick: () => {
              fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/history`, {
                method: "DELETE",
              });
              router.push("/");
              toast.success("All chats deleted");
            },
          },
        });
        break;
      case "vault_upload":
        vaultFileInputRef.current?.click();
        break;
      default:
        break;
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const vaultFileInputRef = useRef<HTMLInputElement>(null);
  const [uploadQueue, setUploadQueue] = useState<string[]>([]);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [slashIndex, setSlashIndex] = useState(0);

  // Per-chat Vault Mode comes from chat row in DB (via props)
  const vaultModeActive = chatMode === "vault";

  // Auto-trigger vault upload UI when backend signals it
  useEffect(() => {
    if (!messages.length) return;
    const last = messages.at(-1);
    if (last?.role !== "assistant") return;
    const hasAddPrompt = last.parts?.some(
      (p: { type?: string }) => p.type === "data-vault-add-prompt"
    );
    if (hasAddPrompt) {
      // Trigger upload picker once
      const timer = setTimeout(() => {
        vaultFileInputRef.current?.click();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [messages]);

  const submitForm = useCallback(() => {
    window.history.pushState(
      {},
      "",
      `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/chat/${chatId}`
    );

    sendMessage({
      role: "user",
      parts: [
        ...attachments.map((attachment) => ({
          type: "file" as const,
          url: attachment.url,
          name: attachment.name,
          filename: attachment.name,
          mediaType: attachment.contentType,
        })),
        {
          type: "text",
          text: input,
        },
      ],
    });

    setAttachments([]);
    setLocalStorageInput("");
    setInput("");

    if (width && width > 768) {
      textareaRef.current?.focus();
    }
  }, [
    input,
    setInput,
    attachments,
    sendMessage,
    setAttachments,
    setLocalStorageInput,
    width,
    chatId,
  ]);

  const uploadVaultFile = useCallback(
    async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);

      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/vault/upload`,
          { method: "POST", body: formData }
        );

        if (response.ok) {
          const data = await response.json();
          const fileId = data.vaultFileId ?? data.file?.id;
          notify({
            type: "success",
            description: `Tersimpan terenkripsi di Berangkas: ${data.file?.name ?? file.name}`,
          });
          if (fileId) {
            sendMessage({
              role: "user",
              parts: [{ type: "text", text: `/v uploaded ${fileId}` }],
            });
          }
          return true;
        }
        const { error } = await response.json();
        notify({
          type: "error",
          description: error ?? "Upload berangkas gagal",
        });
      } catch {
        notify({
          type: "error",
          description: "Upload berangkas gagal — cek R2 & koneksi",
        });
      }
      return false;
    },
    [sendMessage]
  );

  const uploadFile = useCallback(async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/files/upload`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (response.ok) {
        const data = await response.json();
        const { url, pathname, contentType } = data;

        return {
          url: resolveChatFileDisplayUrl(url),
          name: pathname,
          contentType,
        };
      }
      const { error } = await response.json();
      toast.error(error);
    } catch (_error) {
      toast.error("Failed to upload file, please try again!");
    }
  }, []);

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);

      setUploadQueue(files.map((file) => file.name));

      try {
        const uploadPromises = files.map((file) => uploadFile(file));
        const uploadedAttachments = await Promise.all(uploadPromises);
        const successfullyUploadedAttachments = uploadedAttachments.filter(
          (attachment) => attachment !== undefined
        );

        setAttachments((currentAttachments) => [
          ...currentAttachments,
          ...successfullyUploadedAttachments,
        ]);
      } catch (_error) {
        toast.error("Failed to upload files");
      } finally {
        setUploadQueue([]);
      }
    },
    [setAttachments, uploadFile]
  );

  const handleVaultFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);
      for (const file of files) {
        await uploadVaultFile(file);
      }
      if (vaultFileInputRef.current) {
        vaultFileInputRef.current.value = "";
      }
    },
    [uploadVaultFile]
  );

  const handlePaste = useCallback(
    async (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) {
        return;
      }

      const imageItems = Array.from(items).filter((item) =>
        item.type.startsWith("image/")
      );

      if (imageItems.length === 0) {
        return;
      }

      event.preventDefault();

      setUploadQueue((prev) => [...prev, "Pasted image"]);

      try {
        const uploadPromises = imageItems
          .map((item) => item.getAsFile())
          .filter((file): file is File => file !== null)
          .map((file) => uploadFile(file));

        const uploadedAttachments = await Promise.all(uploadPromises);
        const successfullyUploadedAttachments = uploadedAttachments.filter(
          (attachment) =>
            attachment !== undefined &&
            attachment.url !== undefined &&
            attachment.contentType !== undefined
        );

        setAttachments((curr) => [
          ...curr,
          ...(successfullyUploadedAttachments as Attachment[]),
        ]);
      } catch (_error) {
        toast.error("Failed to upload pasted image(s)");
      } finally {
        setUploadQueue([]);
      }
    },
    [setAttachments, uploadFile]
  );

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.addEventListener("paste", handlePaste);
    return () => textarea.removeEventListener("paste", handlePaste);
  }, [handlePaste]);

  return (
    <div
      className={cn(
        "relative flex w-full touch-manipulation flex-col gap-2 md:gap-4",
        className
      )}
    >
      {editingMessage && onCancelEdit && (
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <span>Editing message</span>
          <button
            className="rounded px-1.5 py-0.5 text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground"
            onMouseDown={(e) => {
              e.preventDefault();
              onCancelEdit();
            }}
            type="button"
          >
            Cancel
          </button>
        </div>
      )}

      <input
        accept="image/*,video/*,audio/*,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/*,application/json,application/zip,application/x-zip-compressed,application/x-7z-compressed,application/x-rar-compressed,application/x-tar,application/gzip,.txt,.md,.csv,.json,.yaml,.yml,.toml,.ini,.log,.sql,.html,.css,.js,.ts,.tsx,.jsx,.py,.rb,.go,.rs,.java,.kt,.swift,.c,.h,.cpp,.cs,.php,.sh"
        className="pointer-events-none fixed -top-4 -left-4 size-0.5 opacity-0"
        multiple
        onChange={handleFileChange}
        ref={fileInputRef}
        tabIndex={-1}
        type="file"
      />
      <input
        accept="image/*,video/*,audio/*,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/*,application/json,application/zip,application/x-zip-compressed,application/x-7z-compressed,application/x-rar-compressed,application/x-tar,application/gzip,.txt,.md,.csv,.json,.yaml,.yml,.toml,.ini,.log,.sql,.html,.css,.js,.ts,.tsx,.jsx,.py,.rb,.go,.rs,.java,.kt,.swift,.c,.h,.cpp,.cs,.php,.sh"
        className="pointer-events-none fixed -top-4 -left-4 size-0.5 opacity-0"
        multiple
        onChange={handleVaultFileChange}
        ref={vaultFileInputRef}
        tabIndex={-1}
        type="file"
      />

      <div className="relative">
        {slashOpen && (
          <SlashCommandMenu
            onClose={() => setSlashOpen(false)}
            onSelect={handleSlashSelect}
            query={slashQuery}
            selectedIndex={slashIndex}
          />
        )}
      </div>

      <PromptInput
        className={cn(
          "[&>div]:rounded-3xl [&>div]:border [&>div]:border-white/[0.07] [&>div]:bg-zinc-100/95 [&>div]:backdrop-blur-2xl [&>div]:shadow-[0_8px_32px_-4px_rgba(0,0,0,0.16)] [&>div]:transition-all [&>div]:duration-300 [&>div]:focus-within:border-foreground/20 [&>div]:focus-within:shadow-[0_8px_36px_-4px_rgba(0,0,0,0.24)]",
          "dark:[&>div]:bg-zinc-950/80 dark:[&>div]:border-white/[0.08] dark:[&>div]:shadow-[0_8px_32px_-4px_rgba(0,0,0,0.5)] dark:[&>div]:focus-within:border-white/15 dark:[&>div]:focus-within:shadow-[0_8px_42px_-4px_rgba(0,0,0,0.7)]",
          vaultModeActive &&
            "[&>div]:border-emerald-500/30 [&>div]:bg-emerald-950/40 [&>div]:focus-within:border-emerald-400/50 [&>div]:focus-within:shadow-[0_8px_32px_-4px_rgba(16,185,129,0.18)]"
        )}
        onSubmit={async () => {
          const trySubmit = () => {
            if (status === "ready" || status === "error") {
              submitForm();
            } else {
              toast.error("Tunggu respons model selesai dulu.");
            }
          };

          // In Vault Mode, `add` / `upload` opens file picker locally
          // (backend will also signal data-vault-add-prompt as a fallback).
          if (vaultModeActive && parseVaultModeAdd(input)) {
            setInput("");
            vaultFileInputRef.current?.click();
            return;
          }

          // `/v` (bare) → create NEW isolated Vault Session and redirect.
          // We call the session start endpoint directly instead of routing
          // through chat — this guarantees the vault chat is born clean,
          // with NO inherited history from the current chat.
          if (parseVaultEnter(input) && !vaultModeActive) {
            setInput("");
            try {
              const res = await fetch(
                `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/vault/session/start`,
                { method: "POST" }
              );
              if (res.ok) {
                const data = (await res.json()) as {
                  redirectTo?: string;
                  chatId?: string;
                };
                if (data.redirectTo) {
                  router.push(
                    `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${data.redirectTo}`
                  );
                  return;
                }
              }
              toast.error("Gagal memulai Vault Session — coba lagi.");
            } catch {
              toast.error("Gagal memulai Vault Session — koneksi bermasalah.");
            }
            return;
          }

          // If already in vault, `/v` is idempotent — let backend ack
          if (parseVaultEnter(input)) {
            trySubmit();
            return;
          }

          if (input.startsWith("/")) {
            const trimmed = input.slice(1).trim();
            const firstToken = trimmed.split(/\s+/)[0]?.toLowerCase() ?? "";

            if (isBareMediaSlash(input)) {
              toast.error(
                "Tambahkan link setelah command, contoh: /tt https://vt.tiktok.com/..."
              );
              return;
            }

            if (isLegacyVaultChatCommand(input)) {
              toast.error("Masuk Vault Mode dulu: ketik /v");
              setInput("");
              return;
            }

            if (parseMediaSlash(input)) {
              trySubmit();
              return;
            }

            // Satu kata saja: /cuaca, /v list, /tt (menu) — jalankan skill UI
            if (!trimmed.includes(" ")) {
              const cmd = slashCommands.find((c) => c.name === firstToken);
              if (cmd) {
                handleSlashSelect(cmd);
                return;
              }
            }

            // Slash + teks lain (mis. /cari tentang X) — kirim ke chat
            if (trimmed.length > 0) {
              trySubmit();
              return;
            }
            return;
          }

          if (!input.trim() && attachments.length === 0) {
            return;
          }
          trySubmit();
        }}
      >
        <ChatModelStatusStrip
          selectedModelId={selectedModelId}
          status={status}
        />
        {(attachments.length > 0 || uploadQueue.length > 0) && (
          <div
            className="flex w-full self-start flex-row gap-2 overflow-x-auto px-3 pt-3 no-scrollbar"
            data-testid="attachments-preview"
          >
            {attachments.map((attachment) => (
              <PreviewAttachment
                attachment={attachment}
                key={attachment.url}
                onRemove={() => {
                  setAttachments((currentAttachments) =>
                    currentAttachments.filter((a) => a.url !== attachment.url)
                  );
                  if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                  }
                }}
              />
            ))}

            {uploadQueue.map((filename) => (
              <PreviewAttachment
                attachment={{
                  url: "",
                  name: filename,
                  contentType: "",
                }}
                isUploading={true}
                key={filename}
              />
            ))}
          </div>
        )}
        <PromptInputTextarea
          className={cn(
            "min-h-[3.25rem] text-base leading-relaxed px-3 pt-3 pb-1 placeholder:text-muted-foreground/35 md:min-h-24 md:px-4 md:pt-3.5 md:text-[13px]",
            vaultModeActive &&
              "font-mono text-emerald-200 placeholder:text-emerald-500/40 caret-emerald-400"
          )}
          data-testid="multimodal-input"
          onChange={handleInput}
          onKeyDown={(e) => {
            if (slashOpen) {
              const filtered = slashCommands.filter((cmd) =>
                cmd.name.startsWith(slashQuery.toLowerCase())
              );
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSlashIndex((i) => Math.min(i + 1, filtered.length - 1));
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setSlashIndex((i) => Math.max(i - 1, 0));
                return;
              }
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                if (filtered[slashIndex]) {
                  handleSlashSelect(filtered[slashIndex]);
                }
                return;
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setSlashOpen(false);
                return;
              }
            }
            if (e.key === "Escape" && editingMessage && onCancelEdit) {
              e.preventDefault();
              onCancelEdit();
            }
          }}
          placeholder={
            editingMessage
              ? "Edit your message..."
              : vaultModeActive
                ? "vault@vandor:~ $ list | read <id> | add | exit"
                : "Ask anything..."
          }
          ref={textareaRef}
          value={input}
        />
        <PromptInputFooter className="px-2.5 pb-2.5 md:px-3 md:pb-3">
          <PromptInputTools>
            <AttachmentsButton
              fileInputRef={fileInputRef}
              selectedModelId={selectedModelId}
              status={status}
            />
            <VoiceInputButton
              disabled={status !== "ready" && status !== "error"}
              onTranscript={(text) => {
                setInput((prev) => (prev ? `${prev} ${text}` : text));
                textareaRef.current?.focus();
              }}
            />
            <ModelSelectorCompact
              onModelChange={onModelChange}
              selectedModelId={selectedModelId}
            />
          </PromptInputTools>

          {status === "submitted" ? (
            <StopButton setMessages={setMessages} stop={stop} />
          ) : (
            <PromptInputSubmit
              className={cn(
                "h-7 w-7 rounded-xl transition-all duration-200",
                input.trim()
                  ? "bg-foreground text-background hover:opacity-85 active:scale-95"
                  : "bg-muted text-muted-foreground/25 cursor-not-allowed"
              )}
              data-testid="send-button"
              disabled={!input.trim() || uploadQueue.length > 0}
              status={status}
              variant="secondary"
            >
              <ArrowUpIcon className="size-4" />
            </PromptInputSubmit>
          )}
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
}

export const MultimodalInput = memo(
  PureMultimodalInput,
  (prevProps, nextProps) => {
    if (prevProps.input !== nextProps.input) {
      return false;
    }
    if (prevProps.status !== nextProps.status) {
      return false;
    }
    if (!equal(prevProps.attachments, nextProps.attachments)) {
      return false;
    }
    if (prevProps.selectedVisibilityType !== nextProps.selectedVisibilityType) {
      return false;
    }
    if (prevProps.selectedModelId !== nextProps.selectedModelId) {
      return false;
    }
    if (prevProps.editingMessage !== nextProps.editingMessage) {
      return false;
    }
    if (prevProps.isLoading !== nextProps.isLoading) {
      return false;
    }
    if (prevProps.messages.length !== nextProps.messages.length) {
      return false;
    }

    return true;
  }
);

function PureAttachmentsButton({
  fileInputRef,
  status,
  selectedModelId,
}: {
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  status: UseChatHelpers<ChatMessage>["status"];
  selectedModelId: string;
}) {
  const { data: modelsResponse } = useSWR(
    `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/models`,
    (url: string) => fetch(url).then((r) => r.json()),
    { revalidateOnFocus: false, dedupingInterval: 3_600_000 }
  );

  const caps: Record<string, ModelCapabilities> | undefined =
    modelsResponse?.capabilities ?? modelsResponse;
  const hasVision = caps?.[selectedModelId]?.vision ?? true;

  return (
    <Button
      className={cn(
        "h-7 w-7 rounded-lg border border-border/40 p-1 transition-colors",
        hasVision
          ? "text-foreground hover:border-border hover:text-foreground"
          : "text-muted-foreground/30 cursor-not-allowed"
      )}
      data-testid="attachments-button"
      disabled={status !== "ready" || !hasVision}
      onClick={(event) => {
        event.preventDefault();
        fileInputRef.current?.click();
      }}
      variant="ghost"
    >
      <PaperclipIcon size={14} style={{ width: 14, height: 14 }} />
    </Button>
  );
}

const AttachmentsButton = memo(PureAttachmentsButton);

function PureModelSelectorCompact({
  selectedModelId,
  onModelChange,
}: {
  selectedModelId: string;
  onModelChange?: (modelId: string) => void;
}) {
  return (
    <OpenRouterModelPicker
      onModelChange={onModelChange}
      selectedModelId={selectedModelId}
    />
  );
}

const ModelSelectorCompact = memo(PureModelSelectorCompact);

function PureStopButton({
  stop,
  setMessages,
}: {
  stop: () => void;
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
}) {
  return (
    <Button
      className="h-7 w-7 rounded-xl bg-foreground p-1 text-background transition-all duration-200 hover:opacity-85 active:scale-95 disabled:bg-muted disabled:text-muted-foreground/25 disabled:cursor-not-allowed"
      data-testid="stop-button"
      onClick={(event) => {
        event.preventDefault();
        stop();
        setMessages((messages) => messages);
      }}
    >
      <StopIcon size={14} />
    </Button>
  );
}

const StopButton = memo(PureStopButton);
