import { VANDOR_CHAT_TOOLS } from "@/lib/ai/tools/registry";
import type { AgentRiskLevel } from "@/lib/db/schema";
import type {
  PlatformAgentId,
  PlatformToolMeta,
  ToolSource,
} from "./types";

const CHAT_TOOL_DESCRIPTIONS: Record<string, string> = {
  getCurrentTime: "Waktu & tanggal saat ini",
  getLocation: "Lokasi/geolokasi user",
  getWeather: "Cuaca lokasi",
  showMap: "Tampilkan peta",
  webSearch: "Pencarian web & berita",
  saveMemory: "Simpan memori jangka panjang",
  getMemory: "Ambil memori user",
  searchDb: "Cari data user (task, memori, catatan)",
  updateTask: "Kelola todo user",
  createDocument: "Buat artifact dokumen/kode",
  editDocument: "Edit artifact",
  updateDocument: "Update artifact",
  requestSuggestions: "Saran lanjutan dokumen",
  createPdf: "Generate PDF",
  createDocx: "Generate DOCX",
  createSpreadsheet: "Generate spreadsheet",
  generateImage: "Generate gambar",
  editImage: "Edit gambar",
  generateVideo: "Generate video",
  generateVoice: "Text-to-speech",
  transcribeAudio: "Transkripsi audio",
  createWhatsappSticker: "Buat stiker WhatsApp",
  downloadMedia: "Unduh media",
  checkSystem: "Cek status sistem/VPS live",
  agentWork: "Antrekan pekerjaan worker nyata",
};

const WORKER_TOOLS: Array<{
  name: string;
  description: string;
  risk: AgentRiskLevel;
  agents: PlatformAgentId[];
}> = [
  {
    name: "system.ping",
    description: "Health-check internal platform",
    risk: "safe",
    agents: ["orchestrator", "monitoring", "tool"],
  },
  {
    name: "shell.run",
    description: "Jalankan perintah shell terkontrol",
    risk: "dangerous",
    agents: ["tool", "deploy", "coding", "fix"],
  },
  {
    name: "monitor.metrics",
    description: "Snapshot CPU/RAM/disk",
    risk: "safe",
    agents: ["monitoring", "tool"],
  },
  {
    name: "monitor.services",
    description: "Status systemd/PM2/Docker",
    risk: "safe",
    agents: ["monitoring", "tool", "deploy"],
  },
  {
    name: "monitor.uptime",
    description: "HTTP uptime check",
    risk: "safe",
    agents: ["monitoring", "deploy"],
  },
  {
    name: "monitor.logs",
    description: "Tail log sistem",
    risk: "moderate",
    agents: ["monitoring", "tool", "fix"],
  },
];

const AGENT_TOOL_MAP: Record<PlatformAgentId, string[]> = {
  chat: [],
  planner: [],
  orchestrator: ["system.ping"],
  coding: [
    "createDocument",
    "editDocument",
    "updateDocument",
    "requestSuggestions",
    "shell.run",
  ],
  browser: ["webSearch", "showMap"],
  document: ["createPdf", "createDocx", "createSpreadsheet", "createDocument"],
  memory: ["saveMemory", "getMemory", "searchDb"],
  tool: [
    "checkSystem",
    "agentWork",
    "system.ping",
    "shell.run",
    "monitor.metrics",
    "monitor.services",
    "monitor.uptime",
    "monitor.logs",
  ],
  testing: [],
  fix: ["shell.run", "monitor.logs"],
  deploy: [
    "agentWork",
    "shell.run",
    "monitor.services",
    "monitor.uptime",
  ],
  monitoring: [
    "checkSystem",
    "monitor.metrics",
    "monitor.services",
    "monitor.uptime",
    "monitor.logs",
    "system.ping",
  ],
};

function agentsForChatTool(toolName: string): PlatformAgentId[] {
  const result: PlatformAgentId[] = [];
  for (const [agentId, tools] of Object.entries(AGENT_TOOL_MAP)) {
    if (tools.includes(toolName)) {
      result.push(agentId as PlatformAgentId);
    }
  }
  if (result.length === 0) {
    return ["chat", "tool"];
  }
  return result;
}

/** Bangun katalog metadata dari tiga sumber existing + platform. */
export function buildStaticToolCatalog(): PlatformToolMeta[] {
  const catalog: PlatformToolMeta[] = [];

  for (const name of VANDOR_CHAT_TOOLS) {
    catalog.push({
      name,
      description: CHAT_TOOL_DESCRIPTIONS[name] ?? `Chat tool: ${name}`,
      source: "chat" as ToolSource,
      risk: name === "agentWork" || name === "checkSystem" ? "moderate" : "safe",
      agents: agentsForChatTool(name),
    });
  }

  for (const wt of WORKER_TOOLS) {
    catalog.push({
      name: wt.name,
      description: wt.description,
      source: "worker",
      risk: wt.risk,
      agents: wt.agents,
    });
  }

  return catalog;
}

export { AGENT_TOOL_MAP };
