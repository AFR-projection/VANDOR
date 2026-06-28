/**
 * Tools yang benar-benar diimplementasi di server VANDOR.
 * Daftar ini dipakai di prompt agar model tidak mengarang tool palsu.
 *
 * NOTE: `manageVault` SENGAJA TIDAK DIDAFTARKAN di sini.
 * Vault terisolasi total dari LLM — hanya bisa diakses via direct backend
 * commands (`/v list`, `/v get`, Vault Mode, dll.) atau `/share-to-ai`.
 */
export const VANDOR_CHAT_TOOLS = [
  "getCurrentTime",
  "getLocation",
  "getWeather",
  "showMap",
  "webSearch",
  "saveMemory",
  "getMemory",
  "searchDb",
  "updateTask",
  "createDocument",
  "editDocument",
  "updateDocument",
  "requestSuggestions",
  "createPdf",
  "createDocx",
  "createSpreadsheet",
  "generateImage",
  "editImage",
  "generateVideo",
  "generateVoice",
  "transcribeAudio",
  "createWhatsappSticker",
  "downloadMedia",
] as const;

export type VandorChatToolName = (typeof VANDOR_CHAT_TOOLS)[number];
