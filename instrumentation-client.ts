import { initBotId } from "botid/client/core";
import { isBotIdEnabledInBrowser } from "@/lib/botid-config";

if (isBotIdEnabledInBrowser()) {
  initBotId({
    protect: [
      {
        path: "/api/chat",
        method: "POST",
      },
    ],
  });
}
