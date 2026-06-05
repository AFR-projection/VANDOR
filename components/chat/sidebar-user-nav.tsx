"use client";

import { ChevronUp, LockIcon, SettingsIcon } from "lucide-react";
import Link from "next/link";
import type { User } from "next-auth";
import { signOut, useSession } from "next-auth/react";
import { useTheme } from "next-themes";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { LoaderIcon } from "./icons";
import { toast } from "./toast";

export function SidebarUserNav({ user }: { user: User }) {
  const { status } = useSession();
  const { setTheme, resolvedTheme } = useTheme();

  const displayName =
    process.env.NEXT_PUBLIC_VANDOR_OWNER_NAME ?? user?.email ?? "Boss";

  const handleLock = async () => {
    try {
      await fetch(
        `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/gate/revoke`,
        {
          method: "POST",
          credentials: "include",
        }
      );
      await signOut({ redirect: false });
    } finally {
      const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
      window.location.href = `${base}/gate`;
    }
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            {status === "loading" ? (
              <SidebarMenuButton className="h-10 justify-between rounded-lg bg-transparent text-sidebar-foreground/50">
                <span className="text-[13px]">Loading…</span>
                <LoaderIcon />
              </SidebarMenuButton>
            ) : (
              <SidebarMenuButton
                className="h-8 rounded-lg px-2 text-sidebar-foreground/70 transition-colors hover:text-sidebar-foreground data-[state=open]:bg-sidebar-accent"
                data-testid="user-nav-button"
              >
                <div className="flex size-5 shrink-0 items-center justify-center rounded-full border border-border/50 bg-foreground/10 text-[10px] font-semibold">
                  V
                </div>
                <span className="truncate text-[13px]" data-testid="user-email">
                  {displayName}
                </span>
                <ChevronUp className="ml-auto size-3.5 opacity-50" />
              </SidebarMenuButton>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-popper-anchor-width) rounded-lg border border-border/60 bg-card/95 backdrop-blur-xl"
            data-testid="user-nav-menu"
            side="top"
          >
            <DropdownMenuItem
              className="cursor-pointer text-[13px]"
              onSelect={() =>
                setTheme(resolvedTheme === "dark" ? "light" : "dark")
              }
            >
              {resolvedTheme === "light" ? "Mode gelap" : "Mode terang"}
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="cursor-pointer text-[13px]">
              <Link
                href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/settings`}
              >
                <SettingsIcon className="mr-2 inline size-3.5" />
                Pengaturan
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="cursor-pointer text-[13px]">
              <Link
                href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/settings/memory`}
              >
                Pengaturan memori
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer text-[13px]"
              onSelect={() => {
                handleLock().catch(() => {
                  toast({ type: "error", description: "Gagal mengunci" });
                });
              }}
            >
              <LockIcon className="mr-2 inline size-3.5" />
              Kunci VANDOR (PIN lagi)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
