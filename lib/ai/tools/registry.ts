/**
 * Tools yang benar-benar diimplementasi di server VANDOR.
 * Daftar ini dipakai di prompt agar model tidak mengarang tool palsu.
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
  "createNote",
  "updateTask",
  "createDocument",
  "editDocument",
  "updateDocument",
  "requestSuggestions",
  "createPdf",
  "createDocx",
  "createSpreadsheet",
  "generateImage",
] as const;

export type VandorChatToolName = (typeof VANDOR_CHAT_TOOLS)[number];
