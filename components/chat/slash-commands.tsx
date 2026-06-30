"use client";

import {
  BombIcon,
  BrainIcon,
  ClockIcon,
  CloudSunIcon,
  DownloadIcon,
  FolderLockIcon,
  ListIcon,
  ListTodoIcon,
  PaletteIcon,
  PenLineIcon,
  PenSquareIcon,
  SearchIcon,
  Trash2Icon,
  VideoIcon,
  XIcon,
} from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { SLASH_SKILLS } from "@/lib/chat/slash-skills";
import { VAULT_SLASH_SKILLS } from "@/lib/chat/vault-slash";
import { cn } from "@/lib/utils";

export type SlashCommand = {
  name: string;
  description: string;
  icon: ReactNode;
  action: string;
  shortcut?: string;
  insertText?: string;
  sendText?: string;
};

const UI_COMMANDS: SlashCommand[] = [
  {
    name: "new",
    description: "Chat baru",
    icon: <PenSquareIcon className="size-3.5" />,
    action: "new",
  },
  {
    name: "clear",
    description: "Bersihkan chat ini",
    icon: <Trash2Icon className="size-3.5" />,
    action: "clear",
  },
  {
    name: "rename",
    description: "Ubah nama chat",
    icon: <PenLineIcon className="size-3.5" />,
    action: "rename",
  },
  {
    name: "model",
    description: "Ganti model AI",
    icon: <ListIcon className="size-3.5" />,
    action: "model",
  },
  {
    name: "theme",
    description: "Dark / light mode",
    icon: <PaletteIcon className="size-3.5" />,
    action: "theme",
  },
  {
    name: "delete",
    description: "Hapus chat ini",
    icon: <XIcon className="size-3.5" />,
    action: "delete",
  },
  {
    name: "purge",
    description: "Hapus semua chat",
    icon: <BombIcon className="size-3.5" />,
    action: "purge",
  },
];

const SKILL_ICONS: Record<string, ReactNode> = {
  todo: <ListTodoIcon className="size-3.5" />,
  ingat: <BrainIcon className="size-3.5" />,
  cari: <SearchIcon className="size-3.5" />,
  cuaca: <CloudSunIcon className="size-3.5" />,
  waktu: <ClockIcon className="size-3.5" />,
  ringkas: <PenLineIcon className="size-3.5" />,
  tt: <VideoIcon className="size-3.5" />,
  ig: <DownloadIcon className="size-3.5" />,
  v: <FolderLockIcon className="size-3.5" />,
  "share-to-ai": <FolderLockIcon className="size-3.5" />,
};

const VAULT_COMMANDS: SlashCommand[] = VAULT_SLASH_SKILLS.map((skill) => ({
  name: skill.name,
  description: skill.description,
  icon: SKILL_ICONS[skill.name] ?? <FolderLockIcon className="size-3.5" />,
  action:
    skill.kind === "ui" ? (skill.action ?? skill.name) : `skill:${skill.name}`,
  insertText: skill.insertText,
  sendText: skill.sendText,
}));

const SKILL_COMMANDS: SlashCommand[] = SLASH_SKILLS.map((skill) => ({
  name: skill.name,
  description: skill.description,
  icon: SKILL_ICONS[skill.name] ?? <ListTodoIcon className="size-3.5" />,
  action:
    skill.kind === "ui" ? (skill.action ?? skill.name) : `skill:${skill.name}`,
  insertText: skill.insertText,
  sendText: skill.sendText,
}));

export const slashCommands: SlashCommand[] = [
  ...VAULT_COMMANDS,
  ...SKILL_COMMANDS,
  ...UI_COMMANDS,
];

type SlashCommandMenuProps = {
  query: string;
  onSelect: (command: SlashCommand) => void;
  onClose: () => void;
  selectedIndex: number;
};

export function SlashCommandMenu({
  query,
  onSelect,
  onClose: _onClose,
  selectedIndex,
}: SlashCommandMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const filtered = slashCommands.filter((cmd) =>
    cmd.name.startsWith(query.toLowerCase())
  );

  useEffect(() => {
    const selected = menuRef.current?.querySelector("[data-selected='true']");
    if (selected) {
      selected.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  if (filtered.length === 0) {
    return null;
  }

  const hasSkills = filtered.some((c) => c.action.startsWith("skill:"));

  const renderItem = (cmd: SlashCommand, globalIndex: number) => (
    <button
      className={cn(
        "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors",
        globalIndex === selectedIndex ? "bg-muted/70" : "hover:bg-muted/40"
      )}
      data-selected={globalIndex === selectedIndex}
      key={cmd.name}
      onClick={() => onSelect(cmd)}
      onMouseDown={(e) => e.preventDefault()}
      type="button"
    >
      <div className="flex size-6 shrink-0 items-center justify-center text-muted-foreground/60">
        {cmd.icon}
      </div>
      <span className="font-mono text-[13px] text-foreground">/{cmd.name}</span>
      <span className="text-[12px] text-muted-foreground/50">
        {cmd.description}
      </span>
      {cmd.shortcut && (
        <span className="ml-auto text-[11px] text-muted-foreground/30">
          {cmd.shortcut}
        </span>
      )}
    </button>
  );

  return (
    <div
      className="absolute bottom-full left-0 right-0 z-50 mb-2 overflow-hidden rounded-xl border border-border/50 bg-card/95 shadow-[var(--shadow-float)] backdrop-blur-xl"
      ref={menuRef}
    >
      <div className="max-h-72 overflow-y-auto pb-1 no-scrollbar">
        {hasSkills && (
          <div className="px-4 py-2.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/40">
            Skills & aksi
          </div>
        )}
        {filtered.map((cmd, index) => renderItem(cmd, index))}
      </div>
    </div>
  );
}
