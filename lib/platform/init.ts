import { registerBuiltinTools as registerWorkerBuiltinTools } from "@/lib/autonomous/tools/index";
import { registerMonitorTools } from "@/lib/autonomous/tools/monitor";
import { registerShellTools } from "@/lib/autonomous/tools/shell";
import { registerPlatformAgents } from "./agents";
import { isPlatformV2Enabled } from "./config";
import { isAgentRegistryBootstrapped, listAgents } from "./core/agent-registry";
import {
  isToolCatalogBootstrapped,
  listTools,
  registerBuiltinPlatformTools,
} from "./core/tool-registry";

let bootstrapped = false;

/** Bootstrap platform V2 — idempotent, aman dipanggil berulang. */
export function bootstrapPlatformV2(): {
  enabled: boolean;
  agents: number;
  tools: number;
} {
  if (!isPlatformV2Enabled()) {
    return { enabled: false, agents: 0, tools: 0 };
  }

  if (!bootstrapped) {
    registerPlatformAgents();
    registerBuiltinPlatformTools();
    registerWorkerBuiltinTools();
    registerMonitorTools();
    registerShellTools();
    bootstrapped = true;
  }

  return {
    enabled: true,
    agents: isAgentRegistryBootstrapped() ? listAgents().length : 0,
    tools: isToolCatalogBootstrapped() ? listTools().length : 0,
  };
}

export function isPlatformBootstrapped(): boolean {
  return bootstrapped;
}

/** Reset untuk unit test. */
export function resetPlatformBootstrapForTests(): void {
  bootstrapped = false;
}
