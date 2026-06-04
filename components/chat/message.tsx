"use client";
import type { UseChatHelpers } from "@ai-sdk/react";
import type { Vote } from "@/lib/db/schema";
import type { ChatMessage } from "@/lib/types";
import { cn, sanitizeText } from "@/lib/utils";
import { MessageContent, MessageResponse } from "../ai-elements/message";
import { Shimmer } from "../ai-elements/shimmer";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "../ai-elements/tool";
import { GlobeIcon } from "lucide-react";
import { useDataStream } from "./data-stream-provider";
import { DocumentToolResult } from "./document";
import { DocumentPreview } from "./document-preview";
import { SparklesIcon } from "./icons";
import { MessageActions } from "./message-actions";
import { MessageReasoning } from "./message-reasoning";
import { PreviewAttachment } from "./preview-attachment";
import { AssistantAnswer } from "./assistant-answer";
import { MapWidget } from "./map-widget";
import {
  getRichContentFromMessage,
  getSearchStatusFromMessage,
  getWebSourcesFromMessage,
  WebSearchIndicator,
} from "./search-sources";
import { RichContentBlocks } from "./rich/rich-content";
import { SourcesSkeleton } from "./rich/skeletons";
import { Weather } from "./weather";

const PurePreviewMessage = ({
  addToolApprovalResponse,
  chatId,
  message,
  vote,
  isLoading,
  setMessages: _setMessages,
  regenerate: _regenerate,
  sendMessage,
  isReadonly,
  requiresScrollPadding: _requiresScrollPadding,
  onEdit,
}: {
  addToolApprovalResponse: UseChatHelpers<ChatMessage>["addToolApprovalResponse"];
  chatId: string;
  message: ChatMessage;
  vote: Vote | undefined;
  isLoading: boolean;
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  regenerate: UseChatHelpers<ChatMessage>["regenerate"];
  sendMessage?: UseChatHelpers<ChatMessage>["sendMessage"];
  isReadonly: boolean;
  requiresScrollPadding: boolean;
  onEdit?: (message: ChatMessage) => void;
}) => {
  const attachmentsFromMessage = message.parts.filter(
    (part) => part.type === "file"
  );

  useDataStream();

  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";

  const hasAnyContent = message.parts?.some(
    (part) =>
      (part.type === "text" && part.text?.trim().length > 0) ||
      (part.type === "reasoning" &&
        "text" in part &&
        part.text?.trim().length > 0) ||
      part.type.startsWith("tool-")
  );
  const isThinking = isAssistant && isLoading && !hasAnyContent;

  const webSources = isAssistant ? getWebSourcesFromMessage(message) : null;
  const richContent = isAssistant ? getRichContentFromMessage(message) : null;
  const searchStatus = isAssistant ? getSearchStatusFromMessage(message) : null;
  const isWebSearching =
    isAssistant &&
    isLoading &&
    searchStatus?.status === "searching" &&
    !message.parts.some((p) => p.type === "text" && p.text?.trim());

  const attachments = attachmentsFromMessage.length > 0 && (
    <div
      className="flex flex-row justify-end gap-2"
      data-testid={"message-attachments"}
    >
      {attachmentsFromMessage.map((attachment) => (
        <PreviewAttachment
          attachment={{
            name: attachment.filename ?? "file",
            contentType: attachment.mediaType,
            url: attachment.url,
          }}
          key={attachment.url}
        />
      ))}
    </div>
  );

  const mergedReasoning = message.parts?.reduce(
    (acc, part) => {
      if (part.type === "reasoning" && part.text?.trim().length > 0) {
        return {
          text: acc.text ? `${acc.text}\n\n${part.text}` : part.text,
          isStreaming: "state" in part ? part.state === "streaming" : false,
          rendered: false,
        };
      }
      return acc;
    },
    { text: "", isStreaming: false, rendered: false }
  ) ?? { text: "", isStreaming: false, rendered: false };

  const parts = message.parts?.map((part, index) => {
    const { type } = part;
    const key = `message-${message.id}-part-${index}`;

    if (type === "reasoning") {
      if (!mergedReasoning.rendered && mergedReasoning.text) {
        mergedReasoning.rendered = true;
        return (
          <MessageReasoning
            isLoading={isLoading || mergedReasoning.isStreaming}
            key={key}
            reasoning={mergedReasoning.text}
          />
        );
      }
      return null;
    }

    if (
      type === "data-web-sources" ||
      type === "data-rich-content" ||
      type === "data-search-status" ||
      type === "data-model-meta" ||
      type === "data-chat-title"
    ) {
      return null;
    }

    if (type === "text") {
      if (message.role === "assistant") {
        return (
          <AssistantAnswer
            key={key}
            sources={webSources?.sources ?? []}
            text={part.text}
          />
        );
      }

      return (
        <MessageContent
          className={cn(
            "w-fit max-w-[min(92vw,56ch)] overflow-hidden break-words rounded-2xl rounded-br-lg border border-border/30 bg-gradient-to-br from-secondary to-muted px-3 py-2 text-[13px] leading-[1.65] shadow-[var(--shadow-card)] sm:max-w-[min(80%,56ch)] sm:px-3.5"
          )}
          data-testid="message-content"
          key={key}
        >
          <MessageResponse>{sanitizeText(part.text)}</MessageResponse>
        </MessageContent>
      );
    }

    if (type === "tool-showMap") {
      const { toolCallId, state } = part;
      const output = part.output as
        | {
            ok?: boolean;
            error?: string;
            query?: string;
            displayName?: string;
            center?: { lat: number; lng: number };
            zoom?: number;
            markers?: Array<{
              lat: number;
              lng: number;
              label: string;
              kind?: string;
            }>;
            bbox?: [number, number, number, number];
            osmUrl?: string;
            embedUrl?: string;
          }
        | undefined;
      const widthClass = "w-[min(100%,560px)]";

      if (state === "output-available" && output) {
        return (
          <div className={widthClass} key={toolCallId}>
            <MapWidget data={output} />
          </div>
        );
      }

      return (
        <div className={widthClass} key={toolCallId}>
          <Tool className="w-full" defaultOpen={true}>
            <ToolHeader state={state} type="tool-showMap" />
            <ToolContent>
              {(state === "input-available" ||
                state === "approval-requested") && (
                <ToolInput input={part.input} />
              )}
              {state === "output-error" && (
                <ToolOutput
                  errorText={(part as { errorText?: string }).errorText}
                  output={undefined}
                />
              )}
            </ToolContent>
          </Tool>
        </div>
      );
    }

    if (type === "tool-getWeather") {
      const { toolCallId, state } = part;
      const approvalId = (part as { approval?: { id: string } }).approval?.id;
      const isDenied =
        state === "output-denied" ||
        (state === "approval-responded" &&
          (part as { approval?: { approved?: boolean } }).approval?.approved ===
            false);
      const widthClass = "w-[min(100%,450px)]";

      if (state === "output-available") {
        return (
          <div className={widthClass} key={toolCallId}>
            <Weather weatherAtLocation={part.output} />
          </div>
        );
      }

      if (isDenied) {
        return (
          <div className={widthClass} key={toolCallId}>
            <Tool className="w-full" defaultOpen={true}>
              <ToolHeader state="output-denied" type="tool-getWeather" />
              <ToolContent>
                <div className="px-4 py-3 text-muted-foreground text-sm">
                  Weather lookup was denied.
                </div>
              </ToolContent>
            </Tool>
          </div>
        );
      }

      if (state === "approval-responded") {
        return (
          <div className={widthClass} key={toolCallId}>
            <Tool className="w-full" defaultOpen={true}>
              <ToolHeader state={state} type="tool-getWeather" />
              <ToolContent>
                <ToolInput input={part.input} />
              </ToolContent>
            </Tool>
          </div>
        );
      }

      return (
        <div className={widthClass} key={toolCallId}>
          <Tool className="w-full" defaultOpen={true}>
            <ToolHeader state={state} type="tool-getWeather" />
            <ToolContent>
              {(state === "input-available" ||
                state === "approval-requested") && (
                <ToolInput input={part.input} />
              )}
              {state === "approval-requested" && approvalId && (
                <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
                  <button
                    className="rounded-md px-3 py-1.5 text-muted-foreground text-sm transition-colors hover:bg-muted hover:text-foreground"
                    onClick={() => {
                      addToolApprovalResponse({
                        id: approvalId,
                        approved: false,
                        reason: "User denied weather lookup",
                      });
                    }}
                    type="button"
                  >
                    Deny
                  </button>
                  <button
                    className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground text-sm transition-colors hover:bg-primary/90"
                    onClick={() => {
                      addToolApprovalResponse({
                        id: approvalId,
                        approved: true,
                      });
                    }}
                    type="button"
                  >
                    Allow
                  </button>
                </div>
              )}
            </ToolContent>
          </Tool>
        </div>
      );
    }

    if (type === "tool-createDocument") {
      const { toolCallId } = part;

      if (part.output && "error" in part.output) {
        return (
          <div
            className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-500 dark:bg-red-950/50"
            key={toolCallId}
          >
            Error creating document: {String(part.output.error)}
          </div>
        );
      }

      return (
        <DocumentPreview
          isReadonly={isReadonly}
          key={toolCallId}
          result={part.output}
        />
      );
    }

    if (type === "tool-updateDocument") {
      const { toolCallId } = part;

      if (part.output && "error" in part.output) {
        return (
          <div
            className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-500 dark:bg-red-950/50"
            key={toolCallId}
          >
            Error updating document: {String(part.output.error)}
          </div>
        );
      }

      return (
        <div className="relative" key={toolCallId}>
          <DocumentPreview
            args={{ ...part.output, isUpdate: true }}
            isReadonly={isReadonly}
            result={part.output}
          />
        </div>
      );
    }

    if (type === "tool-generateImage" || type === "tool-editImage") {
      const { toolCallId, state } = part;
      const isEdit = type === "tool-editImage";
      const output = part.output as
        | {
            ok?: boolean;
            url?: string;
            mime?: string;
            bytes?: number;
            model?: string;
            prompt?: string;
            instruction?: string;
            aspectRatio?: string;
            error?: string;
          }
        | undefined;
      const imageAlt =
        output?.instruction ?? output?.prompt ?? (isEdit ? "Edited image" : "Generated image");
      return (
        <div className="w-[min(100%,520px)]" key={toolCallId}>
          <Tool className="w-full" defaultOpen={false}>
            <ToolHeader
              state={state}
              title={isEdit ? "Edit gambar" : "Generate gambar"}
              type={type}
            />
            <ToolContent>
              {state === "input-available" && (
                <ToolInput input={part.input} />
              )}
              {state === "output-available" && output?.ok && output.url && (
                <div className="space-y-2">
                  <img
                    alt={imageAlt}
                    className="w-full rounded-lg border border-border/40"
                    src={output.url}
                  />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {output.model} · {output.aspectRatio}
                      {output.bytes
                        ? ` · ${(output.bytes / 1024).toFixed(1)} KB`
                        : ""}
                    </span>
                    <a
                      className="inline-flex items-center gap-1 rounded-md bg-foreground px-2.5 py-1 text-background hover:bg-foreground/90"
                      download
                      href={output.url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Unduh
                    </a>
                  </div>
                </div>
              )}
              {state === "output-available" && output && !output.ok && (
                <div className="rounded-md bg-destructive/10 p-3 text-destructive text-xs">
                  {output.error ??
                    (isEdit ? "Image edit failed." : "Image generation failed.")}
                </div>
              )}
            </ToolContent>
          </Tool>
        </div>
      );
    }

    if (
      type === "tool-createPdf" ||
      type === "tool-createDocx" ||
      type === "tool-createSpreadsheet"
    ) {
      const { toolCallId, state } = part;
      const labels: Record<string, string> = {
        "tool-createPdf": "Membuat PDF",
        "tool-createDocx": "Membuat dokumen Word",
        "tool-createSpreadsheet": "Membuat spreadsheet",
      };
      const output = part.output as
        | {
            kind?: string;
            title?: string;
            url?: string;
            filename?: string;
            bytes?: number;
          }
        | undefined;
      return (
        <div className="w-[min(100%,520px)]" key={toolCallId}>
          <Tool className="w-full" defaultOpen={false}>
            <ToolHeader
              state={state}
              title={labels[type] ?? type}
              type={type}
            />
            <ToolContent>
              {state === "input-available" && (
                <ToolInput input={part.input} />
              )}
              {state === "output-available" && output?.url && (
                <div className="space-y-3">
                  <div className="rounded-lg border border-border/50 bg-card/60 p-3">
                    <p className="text-xs text-muted-foreground">
                      {output.kind?.toUpperCase()} ·{" "}
                      {output.bytes
                        ? `${(output.bytes / 1024).toFixed(1)} KB`
                        : ""}
                    </p>
                    <p className="mt-1 font-medium text-sm">{output.title}</p>
                    <a
                      className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-background text-xs hover:bg-foreground/90"
                      download={output.filename}
                      href={output.url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Unduh {output.filename}
                    </a>
                  </div>
                </div>
              )}
              {state === "output-error" && (
                <ToolOutput
                  errorText={(part as { errorText?: string }).errorText}
                  output={undefined}
                />
              )}
            </ToolContent>
          </Tool>
        </div>
      );
    }

    if (
      type === "tool-getCurrentTime" ||
      type === "tool-getLocation"
    ) {
      const { toolCallId, state } = part;
      const labels: Record<string, string> = {
        "tool-getCurrentTime": "Mengecek waktu",
        "tool-getLocation": "Mendeteksi lokasi",
      };
      return (
        <Tool
          className="w-[min(100%,560px)]"
          defaultOpen={false}
          key={toolCallId}
        >
          <ToolHeader
            state={state}
            title={labels[type] ?? type}
            type={type}
          />
          <ToolContent>
            {(state === "input-available" ||
              state === "approval-requested") && (
              <ToolInput input={part.input} />
            )}
            {state === "output-available" && (
              <ToolOutput errorText={undefined} output={part.output} />
            )}
            {state === "output-error" && (
              <ToolOutput
                errorText={(part as { errorText?: string }).errorText}
                output={undefined}
              />
            )}
          </ToolContent>
        </Tool>
      );
    }

    if (type === "tool-webSearch") {
      const { toolCallId, state } = part;

      if (state === "output-available") {
        return null;
      }

      if (state === "input-streaming" || state === "input-available") {
        return (
          <div
            className="flex items-center gap-2 text-[13px] text-muted-foreground"
            key={toolCallId}
          >
            <GlobeIcon className="size-3.5 animate-pulse" />
            Mencari di web…
          </div>
        );
      }

      return (
        <Tool
          className="w-[min(100%,560px)]"
          defaultOpen
          key={toolCallId}
        >
          <ToolHeader
            state={state}
            title="Mencari di web"
            type="tool-webSearch"
          />
          <ToolContent>
            {state === "output-error" && (
              <ToolOutput
                errorText={(part as { errorText?: string }).errorText}
                output={undefined}
              />
            )}
          </ToolContent>
        </Tool>
      );
    }

    if (type === "tool-requestSuggestions") {
      const { toolCallId, state } = part;

      return (
        <Tool
          className="w-[min(100%,450px)]"
          defaultOpen={true}
          key={toolCallId}
        >
          <ToolHeader state={state} type="tool-requestSuggestions" />
          <ToolContent>
            {state === "input-available" && <ToolInput input={part.input} />}
            {state === "output-available" && (
              <ToolOutput
                errorText={undefined}
                output={
                  "error" in part.output ? (
                    <div className="rounded border p-2 text-red-500">
                      Error: {String(part.output.error)}
                    </div>
                  ) : (
                    <DocumentToolResult
                      isReadonly={isReadonly}
                      result={part.output}
                      type="request-suggestions"
                    />
                  )
                }
              />
            )}
          </ToolContent>
        </Tool>
      );
    }

    if (
      type === "tool-saveMemory" ||
      type === "tool-getMemory" ||
      type === "tool-searchDb" ||
      type === "tool-manageNotes" ||
      type === "tool-updateTask"
    ) {
      const { toolCallId, state } = part;
      const labels: Record<string, string> = {
        "tool-saveMemory": "Menyimpan memori",
        "tool-getMemory": "Mengambil memori",
        "tool-searchDb": "Mencari memori & data",
        "tool-manageNotes": "Catatan pribadi",
        "tool-updateTask": "Mengelola task",
      };

      return (
        <Tool
          className="w-[min(100%,560px)]"
          defaultOpen={false}
          key={toolCallId}
        >
          <ToolHeader
            state={state}
            title={labels[type] ?? type}
            type={type}
          />
          <ToolContent>
            {(state === "input-available" ||
              state === "approval-requested") && (
              <ToolInput input={part.input} />
            )}
            {state === "output-available" && (
              <ToolOutput errorText={undefined} output={part.output} />
            )}
            {state === "output-error" && (
              <ToolOutput
                errorText={(part as { errorText?: string }).errorText}
                output={undefined}
              />
            )}
          </ToolContent>
        </Tool>
      );
    }

    return null;
  });

  const actions = !isReadonly && (
    <MessageActions
      chatId={chatId}
      isLoading={isLoading}
      key={`action-${message.id}`}
      message={message}
      onEdit={onEdit ? () => onEdit(message) : undefined}
      vote={vote}
    />
  );

  const content = isThinking ? (
    <div className="flex h-[calc(13px*1.65)] items-center text-[13px] leading-[1.65]">
      <Shimmer className="font-medium" duration={1}>
        Thinking...
      </Shimmer>
    </div>
  ) : (
    <>
      {attachments}
      {isWebSearching && (
        <>
          <WebSearchIndicator query={searchStatus?.query} />
          <SourcesSkeleton />
        </>
      )}
      {webSources && webSources.sources.length > 0 && isLoading && !message.parts.some((p) => p.type === "text" && p.text?.trim()) && (
        <WebSearchIndicator
          query={webSources.query}
          sourceCount={webSources.sources.length}
        />
      )}
      {parts}
      {isAssistant && richContent && (
        <RichContentBlocks
          onAsk={(question) => {
            if (!sendMessage) {
              return;
            }
            window.history.pushState(
              {},
              "",
              `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/chat/${chatId}`
            );
            sendMessage({
              role: "user",
              parts: [{ type: "text", text: question }],
            });
          }}
          rich={richContent}
        />
      )}
      {actions}
    </>
  );

  return (
    <div
      className={cn(
        "group/message w-full",
        !isAssistant && "animate-[fade-up_0.25s_cubic-bezier(0.22,1,0.36,1)]"
      )}
      data-role={message.role}
      data-testid={`message-${message.role}`}
    >
      <div
        className={cn(
          isUser ? "flex flex-col items-end gap-2" : "flex items-start gap-2 sm:gap-3"
        )}
      >
        {isAssistant && (
          <div className="flex h-[calc(13px*1.65)] shrink-0 items-center">
            <div className="flex size-7 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground ring-1 ring-border/50">
              <SparklesIcon size={13} />
            </div>
          </div>
        )}
        {isAssistant ? (
          <div className="flex min-w-0 flex-1 flex-col gap-2">{content}</div>
        ) : (
          content
        )}
      </div>
    </div>
  );
};

export const PreviewMessage = PurePreviewMessage;

export const ThinkingMessage = () => {
  return (
    <div
      className="group/message w-full"
      data-role="assistant"
      data-testid="message-assistant-loading"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-[calc(13px*1.65)] shrink-0 items-center">
          <div className="flex size-7 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground ring-1 ring-border/50">
            <SparklesIcon size={13} />
          </div>
        </div>

        <div className="flex h-[calc(13px*1.65)] items-center text-[13px] leading-[1.65]">
          <Shimmer className="font-medium" duration={1}>
            Thinking...
          </Shimmer>
        </div>
      </div>
    </div>
  );
};
