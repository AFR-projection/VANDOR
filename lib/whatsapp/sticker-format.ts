import "server-only";

import sharp from "sharp";

const STICKER_SIZE = 512;
const MAX_STICKER_BYTES = 500 * 1024;

/**
 * Format buffer gambar ke WebP 512×512 siap kirim sebagai stiker WhatsApp.
 * Background transparan, ukuran file dijaga di bawah ~500 KB.
 */
export async function formatWhatsappSticker(input: Buffer): Promise<Buffer> {
  let quality = 82;
  let last: Buffer | null = null;

  while (quality >= 40) {
    const buf = await sharp(input)
      .rotate()
      .resize(STICKER_SIZE, STICKER_SIZE, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .webp({ quality, effort: 4 })
      .toBuffer();

    last = buf;
    if (buf.byteLength <= MAX_STICKER_BYTES) {
      return buf;
    }
    quality -= 12;
  }

  if (!last) {
    throw new Error("Gagal memformat stiker");
  }
  return last;
}
