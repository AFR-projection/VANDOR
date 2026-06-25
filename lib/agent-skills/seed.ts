import "server-only";

import { upsertBuiltinSkill } from "./queries";

export async function ensureBuiltinSkills(userId: string): Promise<void> {
  await upsertBuiltinSkill({
    userId,
    slug: "web_search_agent",
    name: "Web Search",
    description:
      "Cari informasi terkini di internet. Gunakan untuk berita, harga, skor, fakta live, dan kutip sumber.",
    category: "web_search",
    skillType: "web_search",
    config: { maxResults: 5 },
  });

  await upsertBuiltinSkill({
    userId,
    slug: "knowledge_base_search",
    name: "Knowledge Base Search",
    description:
      "Cari jawaban dari dokumen yang diunggah (PDF, DOCX, TXT, CSV, JSON). Gunakan untuk pertanyaan berbasis dokumen internal.",
    category: "knowledge_base",
    skillType: "knowledge_base",
    config: { maxResults: 5, minSimilarity: 0.35 },
  });

  await upsertBuiltinSkill({
    userId,
    slug: "cs_mix_parlay",
    name: "CS Mix Parlay Calculator",
    description:
      "WAJIB dipakai saat user kirim screenshot/foto tiket Mix Parlay dan minta hitung return atau balasan CS. Langkah: (1) baca gambar — ambil Ref No (PAR...), bet amount, setiap odds ASLI (3 desimal) dan status W/WH/LH/D dari kolom hasil, (2) panggil tool ini SEKALI. Setelah tool sukses, STOP — jangan tulis ulang perhitungan/odds/payout (UI sudah menampilkan kartu salin balasan). Jangan hitung manual. Untuk D/Draw jangan masukkan ke perkalian.",
    category: "integration",
    skillType: "parlay_calculator",
    config: {},
  });
}
