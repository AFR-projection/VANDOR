import { cookies } from "next/headers";
import { Suspense } from "react";
import { AppSidebar } from "@/components/chat/app-sidebar";
import { ChatToaster } from "@/components/chat/chat-toaster";
import { DataStreamProvider } from "@/components/chat/data-stream-provider";
import { ChatLayoutContent } from "@/components/chat/chat-layout-content";
import { GateWatchdog } from "@/components/security/gate-watchdog";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { auth } from "../(auth)/auth";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <DataStreamProvider>
        <Suspense fallback={<div className="flex h-dvh bg-sidebar" />}>
          <SidebarShell>{children}</SidebarShell>
        </Suspense>
      </DataStreamProvider>
    </>
  );
}

async function SidebarShell({ children }: { children: React.ReactNode }) {
  const [session, cookieStore] = await Promise.all([auth(), cookies()]);
  const isCollapsed = cookieStore.get("sidebar_state")?.value !== "true";

  return (
    <SidebarProvider defaultOpen={!isCollapsed}>
      <GateWatchdog />
      <AppSidebar user={session?.user} />
      <SidebarInset className="h-dvh max-h-dvh min-h-0 overflow-hidden">
        <ChatToaster />
        <Suspense fallback={<div className="flex h-dvh" />}>
          <ChatLayoutContent>{children}</ChatLayoutContent>
        </Suspense>
      </SidebarInset>
    </SidebarProvider>
  );
}
