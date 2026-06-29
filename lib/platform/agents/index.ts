import { PLATFORM_AGENT_DEFINITIONS } from "./definitions";
import {
  isAgentRegistryBootstrapped,
  registerAgent,
} from "../core/agent-registry";

export function registerPlatformAgents(): void {
  if (isAgentRegistryBootstrapped()) {
    return;
  }
  for (const def of PLATFORM_AGENT_DEFINITIONS) {
    registerAgent(def);
  }
}

export { PLATFORM_AGENT_DEFINITIONS };
