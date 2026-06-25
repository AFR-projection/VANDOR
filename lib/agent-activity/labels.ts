const TOOL_LABELS: Record<string, string> = {
  webSearch: "Mencari di web",
  getWeather: "Mengecek cuaca",
  getCurrentTime: "Mengecek waktu",
  getLocation: "Mendeteksi lokasi",
  showMap: "Memuat peta",
  createDocument: "Membuat dokumen",
  editDocument: "Mengedit dokumen",
  updateDocument: "Memperbarui dokumen",
  requestSuggestions: "Menyiapkan saran",
  createPdf: "Membuat PDF",
  createDocx: "Membuat dokumen Word",
  createSpreadsheet: "Membuat spreadsheet",
  generateImage: "Menghasilkan gambar",
  editImage: "Mengedit gambar",
  generateVideo: "Menghasilkan video",
  generateVoice: "Menghasilkan suara",
  transcribeAudio: "Mentranskripsi audio",
  downloadMedia: "Mengunduh media",
  saveMemory: "Menyimpan memori",
  getMemory: "Mengambil memori",
  searchDb: "Mencari memori & data",
  updateTask: "Mengelola task",
  listVaultFiles: "Membuka berangkas",
  openVaultFile: "Membaca berkas berangkas",
  readVaultFile: "Membaca berangkas",
  uploadToVault: "Mengunggah ke berangkas",
};

export function toolActivityLabel(toolName: string): string {
  if (TOOL_LABELS[toolName]) {
    return TOOL_LABELS[toolName];
  }
  const spaced = toolName
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
  return spaced || "Menjalankan tool";
}

export function toolEventMessage(
  toolName: string,
  state: string,
  detail?: string
): string | null {
  const label = toolActivityLabel(toolName);
  if (state === "output-available") {
    if (toolName === "webSearch") {
      return detail ? `Menemukan sumber: ${detail}` : "Pencarian web selesai";
    }
    return `${label} selesai`;
  }
  if (state === "output-error") {
    return detail ? `${label} gagal: ${detail}` : `${label} gagal`;
  }
  if (state === "input-available" || state === "input-streaming") {
    if (toolName === "webSearch") {
      return "Membuka situs & membaca sumber";
    }
    return `${label}…`;
  }
  return null;
}

export const INTENT_LIVE_STATUS: Record<string, string> = {
  search: "Mencari informasi",
  weather: "Mengecek cuaca",
  time: "Mengecek waktu",
  task: "Mengelola task",
  vault: "Berangkas pribadi",
  document: "Menyiapkan dokumen",
  code: "Menulis kode",
  image: "Memproses gambar",
  pdf: "Membuat file",
  map: "Memuat peta",
  chat_simple: "Memproses permintaan",
  chat_reasoning: "Menganalisis",
};
