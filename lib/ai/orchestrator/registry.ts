import type { AgentSpec } from "./types";

export const SPECIALIST_AGENTS: AgentSpec[] = [
  {
    id: "chat",
    name: "Chat Agent",
    description: "Percakapan umum, salam, Q&A ringan.",
    tools: [
      "getCurrentTime",
      "getLocation",
      "getWeather",
      "saveMemory",
      "getMemory",
      "searchDb",
      "updateTask",
    ],
    memoryScope: "long-term",
    modelSlot: "chatModel",
  },
  {
    id: "research",
    name: "Research Agent",
    description: "Web search, berita, fakta terkini, sintesis sumber.",
    tools: ["webSearch", "showMap", "searchDb"],
    memoryScope: "long-term",
    modelSlot: "researchModel",
  },
  {
    id: "coding",
    name: "Coding Agent",
    description: "Kode, debug, refactor, artifacts dokumen/kode.",
    tools: [
      "createDocument",
      "editDocument",
      "updateDocument",
      "createPdf",
      "createDocx",
      "createSpreadsheet",
    ],
    memoryScope: "session",
    modelSlot: "codingModel",
  },
  {
    id: "reasoning",
    name: "Reasoning Agent",
    description: "Analisis mendalam, perbandingan, rencana multi-langkah.",
    tools: ["searchDb", "createDocument", "requestSuggestions"],
    memoryScope: "long-term",
    modelSlot: "reasoningModel",
  },
  {
    id: "vision",
    name: "Vision Agent",
    description: "Gambar, video, audio — multimodal understanding.",
    tools: [
      "saveMemory",
      "generateImage",
      "editImage",
      "transcribeAudio",
      "createWhatsappSticker",
    ],
    memoryScope: "long-term",
    modelSlot: "visionModel",
  },
  {
    id: "long-context",
    name: "Long Context Agent",
    description: "Dokumen besar, ekstraksi file panjang.",
    tools: ["searchDb", "createDocument", "createPdf"],
    memoryScope: "session",
    modelSlot: "longContextModel",
  },
];

export function getAgentSpec(id: AgentSpec["id"]): AgentSpec {
  const found = SPECIALIST_AGENTS.find((a) => a.id === id);
  if (!found) {
    return SPECIALIST_AGENTS[0];
  }
  return found;
}
