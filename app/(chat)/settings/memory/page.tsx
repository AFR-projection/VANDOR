import { Loader2Icon } from "lucide-react";
import { Suspense } from "react";
import { MemorySettingsPage } from "@/components/settings/memory-settings-page";

function MemoryFallback() {
  return (
    <div className="flex h-full items-center justify-center">
      <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<MemoryFallback />}>
      <MemorySettingsPage />
    </Suspense>
  );
}
