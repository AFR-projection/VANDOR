import "server-only";

import type { RequestHints } from "@/lib/ai/prompts";
import { parseMediaSlash } from "@/lib/chat/media-slash";
import {
  createNote,
  createTask,
  getChatSummary,
  listNotes,
  listTasks,
} from "@/lib/memory/assistant-db";
import { memorySavedDataPart } from "@/lib/memory/notice";
import { saveMemory } from "@/lib/memory/queries";
import { isExplicitRememberRequest } from "@/lib/memory/remember";
import { runWebSearch } from "@/lib/search/engine";
import { getCachedWeather, setCachedWeather } from "@/lib/v4/runtime-cache";

export type DirectCommand =
  | { kind: "media" }
  | { kind: "cuaca"; hints: RequestHints }
  | { kind: "waktu"; timezone?: string }
  | { kind: "catatan_list" }
  | { kind: "task_list" }
  | { kind: "task_create"; title: string }
  | { kind: "note_create"; title: string; content: string }
  | { kind: "memory_save"; content: string }
  | { kind: "cari"; query: string }
  | { kind: "ringkas"; chatId: string };

export function parseDirectCommand(
  text: string,
  hints: RequestHints,
  chatId?: string
): DirectCommand | null {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  if (parseMediaSlash(trimmed)) {
    return { kind: "media" };
  }

  if (
    (/^\/?ringkas\s*$/i.test(trimmed) ||
      /^ringkas(kan)?\s+chat/i.test(trimmed)) &&
    chatId
  ) {
    return { kind: "ringkas", chatId };
  }

  if (
    /^\/?cuaca\s*$/i.test(trimmed) ||
    lower === "cuaca" ||
    /^cuaca\s+(?:di\s+)?(.+)/i.test(trimmed)
  ) {
    const cityMatch = trimmed.match(/^cuaca\s+(?:di\s+)?(.+)/i);
    if (cityMatch?.[1]) {
      return {
        kind: "cuaca",
        hints: { ...hints, city: cityMatch[1].trim() },
      };
    }
    return { kind: "cuaca", hints };
  }

  if (
    /^\/?waktu\s*$/i.test(trimmed) ||
    lower === "waktu" ||
    /^(?:jam|pukul)\s+berapa/i.test(trimmed)
  ) {
    return {
      kind: "waktu",
      timezone: hints.timezone ?? "Asia/Jakarta",
    };
  }

  if (/^\/?catatan\s*$/i.test(trimmed) || /daftar\s+catatan/i.test(trimmed)) {
    return { kind: "catatan_list" };
  }

  if (
    /^\/?todo\s*$/i.test(trimmed) ||
    /daftar\s+(?:task|tugas|todo)/i.test(trimmed)
  ) {
    return { kind: "task_list" };
  }

  const cari = trimmed.match(/^\/?cari\s+(.+)/is);
  if (cari?.[1]?.trim()) {
    return { kind: "cari", query: cari[1].trim() };
  }

  const taskCreate =
    trimmed.match(/^\/?todo\s+(.+)/is) ||
    trimmed.match(
      /^(?:buat(?:kan)?|tambah(?:kan)?)\s+(?:task|tugas|todo)\s*[:-]?\s*(.+)/is
    ) ||
    trimmed.match(
      /^(?:catet(?:in|kan)?|catat)\s+(?:task|tugas|todo)?\s*[:-]?\s*(.+)/is
    );
  if (taskCreate?.[1]?.trim() && taskCreate[1].trim().length >= 2) {
    return { kind: "task_create", title: taskCreate[1].trim().slice(0, 500) };
  }

  const judulMatch = trimmed.match(/^judul\s*:\s*(.+)/im);
  const isiMatch = trimmed.match(/^isi\s*:\s*([\s\S]+)/im);
  if (judulMatch && isiMatch) {
    return {
      kind: "note_create",
      title: judulMatch[1].trim().slice(0, 200),
      content: isiMatch[1].trim().slice(0, 8000),
    };
  }

  if (isExplicitRememberRequest(trimmed)) {
    const content = trimmed
      .replace(
        /^(?:ingat(?:kan)?|jangan lupa|remember|simpan(?:kan)?|catat(?:kan)?)\s*/i,
        ""
      )
      .trim();
    if (content.length >= 3) {
      return { kind: "memory_save", content: content.slice(0, 500) };
    }
  }

  return null;
}

async function fetchWeatherAt(
  hints: RequestHints
): Promise<Record<string, unknown> | { error: string }> {
  const cached = getCachedWeather(hints);
  if (cached) {
    return cached;
  }

  const lat = Number(hints.latitude);
  const lng = Number(hints.longitude);
  const hasCoords =
    Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);

  let latitude = lat;
  let longitude = lng;
  let cityName = hints.city ?? "Jakarta";

  if (!hasCoords && cityName) {
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1`
    );
    const geo = (await geoRes.json()) as {
      results?: Array<{ latitude: number; longitude: number; name: string }>;
    };
    const hit = geo.results?.[0];
    if (!hit) {
      return { error: `Kota "${cityName}" tidak ditemukan.` };
    }
    latitude = hit.latitude;
    longitude = hit.longitude;
    cityName = hit.name;
  }

  const res = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&timezone=auto`
  );
  const data = (await res.json()) as Record<string, unknown>;
  const payload = { ...data, cityName };
  setCachedWeather(hints, payload);
  return payload;
}

function formatTimeReply(timezone: string) {
  const now = new Date();
  const formatted = new Intl.DateTimeFormat("id-ID", {
    timeZone: timezone,
    dateStyle: "full",
    timeStyle: "long",
  }).format(now);
  const day = new Intl.DateTimeFormat("id-ID", {
    timeZone: timezone,
    weekday: "long",
  }).format(now);
  return { formatted, day, timezone };
}

function formatWeatherReply(
  data: Record<string, unknown>,
  city?: string
): string {
  const current = data.current as
    | { temperature_2m?: number; time?: string }
    | undefined;
  const temp = current?.temperature_2m;
  const name = (data.cityName as string) ?? city ?? "lokasimu";
  if (temp == null) {
    return `Cuaca di **${name}**: data tidak tersedia saat ini.`;
  }
  return `Cuaca di **${name}** sekarang: **${temp}°C** (Open-Meteo).`;
}

export async function executeDirectCommand(
  cmd: DirectCommand,
  ctx: { userId: string; chatId: string }
): Promise<{
  text: string;
  instantLabel: string;
  extraParts?: Array<{ type: string; data: unknown }>;
}> {
  switch (cmd.kind) {
    case "media":
      return { text: "", instantLabel: "Unduh media" };

    case "cuaca": {
      const result = await fetchWeatherAt(cmd.hints);
      if ("error" in result) {
        return { text: String(result.error), instantLabel: "Cuaca" };
      }
      return {
        text: formatWeatherReply(
          result,
          (result.cityName as string) ?? cmd.hints.city ?? undefined
        ),
        instantLabel: "Cuaca",
      };
    }

    case "waktu": {
      const r = formatTimeReply(cmd.timezone ?? "Asia/Jakarta");
      return {
        text: `**${r.day}** — ${r.formatted} (${r.timezone})`,
        instantLabel: "Waktu",
      };
    }

    case "catatan_list": {
      const notes = await listNotes(ctx.userId, 30);
      if (notes.length === 0) {
        return {
          text: "Belum ada catatan. Pakai `/catat` atau tulis `Judul:` / `Isi:`.",
          instantLabel: "Catatan",
        };
      }
      const lines = notes.map((n, i) => `${i + 1}. **${n.title}**`);
      return {
        text: `**Catatan kamu** (${notes.length}):\n\n${lines.join("\n")}\n\nBuka: \`/baca <judul>\``,
        instantLabel: "Catatan",
      };
    }

    case "task_list": {
      const tasks = await listTasks(ctx.userId, 25);
      if (tasks.length === 0) {
        return {
          text: "Belum ada task. Contoh: `/todo Beli kopi`",
          instantLabel: "Task",
        };
      }
      const lines = tasks.map(
        (t, i) =>
          `${i + 1}. [${t.status}] **${t.title}**${t.dueAt ? ` (due ${t.dueAt.toISOString().slice(0, 10)})` : ""}`
      );
      return {
        text: `**Task** (${tasks.length}):\n\n${lines.join("\n")}`,
        instantLabel: "Task",
      };
    }

    case "task_create": {
      const row = await createTask({
        userId: ctx.userId,
        title: cmd.title,
      });
      return {
        text: `Task disimpan: **${row.title}**`,
        instantLabel: "Task",
      };
    }

    case "note_create": {
      const row = await createNote({
        userId: ctx.userId,
        title: cmd.title,
        content: cmd.content,
      });
      return {
        text: `Catatan **${row.title}** tersimpan.`,
        instantLabel: "Catatan",
      };
    }

    case "memory_save": {
      await saveMemory({
        userId: ctx.userId,
        content: cmd.content,
        category: "fact",
        importance: 9,
        sourceChatId: ctx.chatId,
        mergeSimilar: true,
      });
      return {
        text: `Oke, gua ingat: **${cmd.content}**`,
        instantLabel: "Memori",
        extraParts: [
          memorySavedDataPart({
            items: [{ content: cmd.content, category: "fact" }],
            source: "explicit",
          }),
        ],
      };
    }

    case "ringkas": {
      const row = await getChatSummary(cmd.chatId);
      if (!row?.summary) {
        return {
          text: "Belum ada ringkasan chat. Lanjutkan percakapan dulu (~15 pesan), lalu coba lagi.",
          instantLabel: "Ringkas",
        };
      }
      return {
        text: `**Ringkasan chat**\n\n${row.summary}`,
        instantLabel: "Ringkas",
      };
    }

    case "cari": {
      const searchResult = await runWebSearch(cmd.query, {
        userId: ctx.userId,
        maxResults: 5,
      });
      const count = searchResult.sources.length;
      const extraParts =
        count > 0
          ? [{ type: "data-web-sources", data: searchResult }]
          : undefined;
      return {
        text:
          count > 0
            ? `Ditemukan **${count} sumber** untuk “${cmd.query}”. Lihat kartu SUMBER di bawah — ringkas dari situ, tanpa mengulang link mentah.`
            : `Tidak ada sumber untuk “${cmd.query}”. Coba kata kunci lain.`,
        instantLabel: "Pencarian",
        extraParts,
      };
    }

    default:
      return { text: "Perintah tidak dikenali.", instantLabel: "VANDOR" };
  }
}
