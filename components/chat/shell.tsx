"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useActiveChat } from "@/hooks/use-active-chat";
import {
  initialArtifactData,
  useArtifact,
  useArtifactSelector,
} from "@/hooks/use-artifact";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import {
  useSourcePanel,
  useSourcePanelSelector,
} from "@/hooks/use-source-panel";
import { useVisualViewportInset } from "@/hooks/use-visual-viewport-inset";
import type { Attachment, ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ChatHeader } from "./chat-header";
import { DataStreamHandler } from "./data-stream-handler";
import { MemorySavedHandler } from "./memory-saved-handler";
import { submitEditedMessage } from "./message-editor";
import { Messages } from "./messages";
import { MobileChatEffects } from "./mobile-chat-effects";
import { MultimodalInput } from "./multimodal-input";
import { VaultModeBanner } from "./vault-mode-banner";

const LazyArtifact = dynamic(
  () => import("./artifact").then((m) => ({ default: m.Artifact })),
  { ssr: false }
);

const LazySourcePanel = dynamic(
  () => import("./source-panel").then((m) => ({ default: m.SourcePanel })),
  { ssr: false }
);

const LazyCommandPalette = dynamic(
  () =>
    import("./command-palette").then((m) => ({ default: m.CommandPalette })),
  { ssr: false }
);

export function ChatShell() {
  const {
    chatId,
    messages,
    setMessages,
    sendMessage,
    status,
    stop,
    regenerate,
    addToolApprovalResponse,
    input,
    setInput,
    visibilityType,
    chatMode,
    isReadonly,
    isLoading,
    votes,
    currentModelId,
    setCurrentModelId,
    showCreditCardAlert,
    setShowCreditCardAlert,
  } = useActiveChat();
  const router = useRouter();

  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(
    null
  );
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [hasMounted, setHasMounted] = useState(false);
  const isArtifactVisible = useArtifactSelector((state) => state.isVisible);
  const isSourcePanelVisible = useSourcePanelSelector(
    (state) => state.isVisible
  );
  const { setArtifact } = useArtifact();
  const { closeSourcePanel } = useSourcePanel();
  const { isMobile, isTablet } = useBreakpoint();
  const keyboardInset = useVisualViewportInset();

  useEffect(() => {
    setHasMounted(true);
  }, []);

  const showSidePanel =
    hasMounted && (isArtifactVisible || isSourcePanelVisible);
  const useOverlayPanel = isMobile || isTablet;

  const stopRef = useRef(stop);
  stopRef.current = stop;

  // Vault Session is now DB-backed (per-chat, server-authoritative).
  // chatMode comes from chat row in DB, NOT from message history.
  const vaultModeActive = chatMode === "vault";
  const vaultEnteredAt = (() => {
    if (!vaultModeActive) return undefined;
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role !== "assistant") continue;
      for (const part of msg.parts ?? []) {
        if (!part || typeof part !== "object" || !("type" in part)) {
          continue;
        }
        if (part.type === "data-vault-mode-enter" && "data" in part) {
          return (part.data as { enteredAt?: string }).enteredAt;
        }
      }
    }
    return undefined;
  })();

  const handleExitVault = () => {
    if (typeof sendMessage === "function") {
      void sendMessage({
        role: "user",
        parts: [{ type: "text", text: "exit" }],
      });
    }
  };

  // Listen for vault session redirects (enter → new vault chat; exit → fresh chat).
  useEffect(() => {
    if (!messages.length) return;
    const last = messages.at(-1);
    if (last?.role !== "assistant") return;
    for (const part of last.parts ?? []) {
      if (!part || typeof part !== "object" || !("type" in part)) {
        continue;
      }
      if (part.type === "data-vault-session-redirect" && "data" in part) {
        const data = part.data as {
          chatId?: string;
          redirectTo?: string;
          reason?: string;
        };
        if (data.redirectTo) {
          // Use Next router for proper navigation
          router.push(
            `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${data.redirectTo}`
          );
        } else if (data.reason === "exit") {
          // Fallback: navigate to root for fresh chat
          router.push(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/`);
        }
        break;
      }
    }
  }, [messages, router]);

  const prevChatIdRef = useRef(chatId);
  useEffect(() => {
    if (prevChatIdRef.current !== chatId) {
      prevChatIdRef.current = chatId;
      stopRef.current();
      setArtifact(initialArtifactData);
      closeSourcePanel();
      setEditingMessage(null);
      setAttachments([]);
    }
  }, [chatId, setArtifact, closeSourcePanel]);

  return (
    <>
      <MobileChatEffects />
      <div className="vandor-chat-shell flex w-full flex-row overflow-hidden">
        <div
          className={cn(
            "flex min-h-0 min-w-0 flex-col bg-sidebar max-md:transition-none transition-[width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
            showSidePanel && !useOverlayPanel && "w-full lg:w-[42%] xl:w-[40%]",
            (!showSidePanel || useOverlayPanel) && "w-full"
          )}
        >
          <ChatHeader />

          {vaultModeActive && (
            <VaultModeBanner
              enteredAt={vaultEnteredAt}
              onExit={handleExitVault}
            />
          )}

          <div
            className={cn(
              "relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background max-md:rounded-none md:rounded-tl-[12px] md:border-t md:border-l md:border-border/40",
              vaultModeActive && "ring-1 ring-emerald-500/20"
            )}
          >
            <Messages
              addToolApprovalResponse={addToolApprovalResponse}
              chatId={chatId}
              isArtifactVisible={showSidePanel}
              isLoading={isLoading}
              isReadonly={isReadonly}
              messages={messages}
              onEditMessage={(msg) => {
                const text = msg.parts
                  ?.filter((p) => p.type === "text")
                  .map((p) => p.text)
                  .join("");
                setInput(text ?? "");
                setEditingMessage(msg);
              }}
              regenerate={regenerate}
              selectedModelId={currentModelId}
              sendMessage={sendMessage}
              setMessages={setMessages}
              status={status}
              votes={votes}
            />

            <div
              className="sticky bottom-0 z-10 mx-auto flex w-full max-w-4xl shrink-0 gap-2 border-t-0 bg-gradient-to-t from-background from-90% to-transparent px-2 pt-1.5 max-md:from-95% sm:px-4 sm:pt-2 sm:pb-4"
              style={{
                paddingBottom: `max(0.5rem, calc(env(safe-area-inset-bottom) + ${keyboardInset}px))`,
              }}
            >
              {!isReadonly && (
                <MultimodalInput
                  attachments={attachments}
                  chatId={chatId}
                  chatMode={chatMode}
                  editingMessage={editingMessage}
                  input={input}
                  isLoading={isLoading}
                  messages={messages}
                  onCancelEdit={() => {
                    setEditingMessage(null);
                    setInput("");
                  }}
                  onModelChange={setCurrentModelId}
                  selectedModelId={currentModelId}
                  selectedVisibilityType={visibilityType}
                  sendMessage={
                    editingMessage
                      ? async () => {
                          const msg = editingMessage;
                          setEditingMessage(null);
                          await submitEditedMessage({
                            message: msg,
                            text: input,
                            setMessages,
                            regenerate,
                          });
                          setInput("");
                        }
                      : sendMessage
                  }
                  setAttachments={setAttachments}
                  setInput={setInput}
                  setMessages={setMessages}
                  status={status}
                  stop={stop}
                />
              )}
            </div>
          </div>
        </div>

        {isSourcePanelVisible ? (
          <LazySourcePanel overlay={useOverlayPanel} />
        ) : isArtifactVisible ? (
          <LazyArtifact
            addToolApprovalResponse={addToolApprovalResponse}
            attachments={attachments}
            chatId={chatId}
            input={input}
            isReadonly={isReadonly}
            messages={messages}
            regenerate={regenerate}
            selectedModelId={currentModelId}
            selectedVisibilityType={visibilityType}
            sendMessage={sendMessage}
            setAttachments={setAttachments}
            setInput={setInput}
            setMessages={setMessages}
            status={status}
            stop={stop}
            votes={votes}
          />
        ) : null}
      </div>

      <MemorySavedHandler messages={messages} status={status} />
      <DataStreamHandler />
      <LazyCommandPalette />

      <AlertDialog
        onOpenChange={setShowCreditCardAlert}
        open={showCreditCardAlert}
      >
        <AlertDialogContent className="mx-4 max-w-[calc(100vw-2rem)] sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Kredit OpenRouter habis</AlertDialogTitle>
            <AlertDialogDescription>
              Model berbayar membutuhkan saldo di OpenRouter. Tambahkan kredit
              atau pilih model gratis (bertanda :free) di pemilih model.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                window.open("https://openrouter.ai/settings/credits", "_blank");
                window.location.href = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/`;
              }}
            >
              Buka OpenRouter
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
