"use client";

import {
  BrainIcon,
  MessageSquarePlusIcon,
  MoonIcon,
  SettingsIcon,
  SunIcon,
  Trash2Icon,
  WandSparklesIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useActiveChat } from "@/hooks/use-active-chat";
import { CHAT_MODE_OPTIONS } from "@/lib/ai/chat-modes";

export function CommandPalette() {
  const router = useRouter();
  const { setTheme, resolvedTheme } = useTheme();
  const { setMessages, currentModelId, setCurrentModelId } = useActiveChat();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const modes = CHAT_MODE_OPTIONS;

  const run = (fn: () => void) => {
    setOpen(false);
    setTimeout(fn, 60);
  };

  return (
    <CommandDialog
      description="Cari aksi atau model. Tekan ⌘K kapan saja."
      onOpenChange={setOpen}
      open={open}
      title="VANDOR command palette"
    >
      <CommandInput placeholder="Ketik aksi atau model..." />
      <CommandList>
        <CommandEmpty>Tidak ada hasil.</CommandEmpty>

        <CommandGroup heading="Aksi">
          <CommandItem
            onSelect={() => run(() => router.push("/"))}
            value="new chat"
          >
            <MessageSquarePlusIcon className="size-3.5" />
            <span>Chat baru</span>
            <CommandShortcut>⌘N</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => run(() => setMessages(() => []))}
            value="clear chat"
          >
            <Trash2Icon className="size-3.5" />
            <span>Bersihkan chat (lokal)</span>
          </CommandItem>
          <CommandItem
            onSelect={() =>
              run(() =>
                router.push(
                  `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/settings`
                )
              )
            }
            value="settings pengaturan pin api"
          >
            <SettingsIcon className="size-3.5" />
            <span>Pengaturan</span>
          </CommandItem>
          <CommandItem
            onSelect={() =>
              run(() =>
                router.push(
                  `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/settings/memory`
                )
              )
            }
            value="memory memori database ingatan"
          >
            <BrainIcon className="size-3.5" />
            <span>Pengaturan memori</span>
          </CommandItem>
          <CommandItem
            onSelect={() =>
              run(() => setTheme(resolvedTheme === "dark" ? "light" : "dark"))
            }
            value="toggle theme"
          >
            {resolvedTheme === "dark" ? (
              <SunIcon className="size-3.5" />
            ) : (
              <MoonIcon className="size-3.5" />
            )}
            <span>
              Ganti tema ke {resolvedTheme === "dark" ? "terang" : "gelap"}
            </span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Mode model">
          {modes.map((m) => (
            <CommandItem
              key={m.id}
              onSelect={() =>
                run(() => {
                  setCurrentModelId(m.id);
                  document.cookie = `chat-model=${encodeURIComponent(m.id)}; path=/; max-age=31536000`;
                })
              }
              value={`model ${m.label} ${m.id}`}
            >
              <WandSparklesIcon className="size-3.5" />
              <span>{m.label}</span>
              {currentModelId === m.id && (
                <CommandShortcut>aktif</CommandShortcut>
              )}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
