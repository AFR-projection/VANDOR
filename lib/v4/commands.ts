import "server-only";

import type { RequestHints } from "@/lib/ai/prompts";
import { parseMediaSlash } from "@/lib/chat/media-slash";
import {
  parseVaultDelete,
  parseVaultGet,
  parseVaultList,
  parseVaultOpen,
  parseVaultUploaded,
} from "@/lib/chat/vault-slash";
import {
  vaultDetailDataPart,
  vaultListDataPart,
  vaultOpenDataPart,
  vaultUploadDataPart,
  vaultUrls,
} from "@/lib/vault/notice";
import {
  createTask,
  getChatSummary,
  listTasks,
} from "@/lib/memory/assistant-db";
import { memorySavedDataPart } from "@/lib/memory/notice";
import { saveMemory } from "@/lib/memory/queries";
import { isExplicitRememberRequest } from "@/lib/memory/remember";
import { runWebSearch } from "@/lib/search/engine";
import { fetchWeatherPanelData } from "@/lib/weather/fetch";
import { extractWeatherCity } from "@/lib/weather/location-phrases";
import { weatherDataPart } from "@/lib/weather/notice";

export type DirectCommand =
  | { kind: "media" }
  | { kind: "cuaca"; hints: RequestHints; city?: string }
  | { kind: "waktu"; timezone?: string }
  | { kind: "task_list" }
  | { kind: "task_create"; title: string }
  | { kind: "memory_save"; content: string }
  | { kind: "cari"; query: string }
  | { kind: "ringkas"; chatId: string }
  | { kind: "vault_list" }
  | { kind: "vault_get"; query: string }
  | { kind: "vault_del"; target: string }
  | { kind: "vault_open"; fileId: string }
  | { kind: "vault_uploaded"; fileId: string };

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

  if (parseVaultList(trimmed)) {
    return { kind: "vault_list" };
  }

  const vaultOpen = parseVaultOpen(trimmed);
  if (vaultOpen) {
    return { kind: "vault_open", fileId: vaultOpen.fileId };
  }

  const vaultUploaded = parseVaultUploaded(trimmed);
  if (vaultUploaded) {
    return { kind: "vault_uploaded", fileId: vaultUploaded.fileId };
  }

  const vaultGet = parseVaultGet(trimmed);
  if (vaultGet) {
    return { kind: "vault_get", query: vaultGet };
  }

  const vaultDel = parseVaultDelete(trimmed);
  if (vaultDel) {
    return { kind: "vault_del", target: vaultDel };
  }

  if (
    (/^\/?ringkas\s*$/i.test(trimmed) ||
      /^ringkas(kan)?\s+chat/i.test(trimmed)) &&
    chatId
  ) {
    return { kind: "ringkas", chatId };
  }

  const WEATHER_QUERY_RE =
    /\b(cuaca|weather|panas|hujan|derajat|suhu|temperature)\b/i;

  if (
    WEATHER_QUERY_RE.test(trimmed) &&
    trimmed.length < 160 &&
    !/\b(cari|search|berita|news|forecast\s+sales)\b/i.test(trimmed)
  ) {
    const city = extractWeatherCity(trimmed) ?? undefined;
    return {
      kind: "cuaca",
      hints,
      city,
    };
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
  data: {
    current?: { temperature_2m?: number };
    cityName?: string;
    conditionDescription?: string;
    feelsLike?: number;
    humidity?: number;
  },
  city?: string
): string {
  const temp = data.current?.temperature_2m;
  const name = data.cityName ?? city ?? "lokasimu";
  if (temp == null) {
    return `Cuaca di **${name}**: data tidak tersedia saat ini.`;
  }
  const parts = [`**${temp}°C**`];
  if (data.conditionDescription) {
    parts.push(data.conditionDescription);
  }
  if (data.feelsLike != null) {
    parts.push(`terasa ${data.feelsLike}°C`);
  }
  if (data.humidity != null) {
    parts.push(`kelembapan ${data.humidity}%`);
  }
  return `Cuaca di **${name}** sekarang: ${parts.join(", ")}. Lihat panel cuaca di bawah.`;
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
      const lat = Number(cmd.hints.latitude);
      const lng = Number(cmd.hints.longitude);
      const useIpLocation = !cmd.city;
      const result = await fetchWeatherPanelData({
        latitude: useIpLocation && Number.isFinite(lat) ? lat : undefined,
        longitude: useIpLocation && Number.isFinite(lng) ? lng : undefined,
        city: cmd.city,
        locationLabel: useIpLocation
          ? (cmd.hints.city ?? undefined)
          : undefined,
      });
      if ("error" in result) {
        return { text: String(result.error), instantLabel: "Cuaca" };
      }
      const place = result.cityName ?? cmd.city ?? cmd.hints.city ?? "lokasimu";
      return {
        text: formatWeatherReply(result, place),
        instantLabel: "Cuaca",
        extraParts: [weatherDataPart(result)],
      };
    }

    case "waktu": {
      const r = formatTimeReply(cmd.timezone ?? "Asia/Jakarta");
      return {
        text: `**${r.day}** — ${r.formatted} (${r.timezone})`,
        instantLabel: "Waktu",
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

    case "vault_list": {
      const { listVaultFiles, countVaultFiles } = await import(
        "@/lib/vault/queries"
      );
      const [files, total] = await Promise.all([
        listVaultFiles({ userId: ctx.userId, limit: 30 }),
        countVaultFiles(ctx.userId),
      ]);
      if (files.length === 0) {
        return {
          text: "Berangkas kosong. Upload dengan `/v up` lalu pilih file.",
          instantLabel: "Berangkas",
        };
      }
      return {
        text: `**${total} file** di berangkas pribadi kamu. Lihat kartu di bawah untuk detail & aksi.`,
        instantLabel: "Berangkas",
        extraParts: [vaultListDataPart({ files, total })],
      };
    }

    case "vault_open": {
      const { getVaultFileById } = await import("@/lib/vault/queries");
      const { toVaultSnapshot } = await import("@/lib/vault/snapshot");
      const row = await getVaultFileById({
        userId: ctx.userId,
        fileId: cmd.fileId,
      });
      if (!row) {
        return {
          text: "File berangkas tidak ditemukan. Cek ID dengan `/v list`.",
          instantLabel: "Berangkas",
        };
      }
      const file = toVaultSnapshot(row);
      const urls = vaultUrls(file.id);
      return {
        text: `**${file.name}** dibuka dari berangkas. File aktif untuk sesi chat ini.`,
        instantLabel: "Berangkas",
        extraParts: [
          vaultOpenDataPart({ file, openUrl: urls.openUrl, downloadUrl: urls.downloadUrl }),
        ],
      };
    }

    case "vault_uploaded": {
      const { getVaultFileById } = await import("@/lib/vault/queries");
      const { toVaultSnapshot } = await import("@/lib/vault/snapshot");
      const row = await getVaultFileById({
        userId: ctx.userId,
        fileId: cmd.fileId,
      });
      if (!row) {
        return {
          text: "Upload berangkas selesai, tapi metadata file belum bisa dimuat.",
          instantLabel: "Berangkas",
        };
      }
      const file = toVaultSnapshot(row);
      return {
        text: `**${file.name}** tersimpan terenkripsi di berangkas pribadi kamu.`,
        instantLabel: "Berangkas",
        extraParts: [vaultUploadDataPart({ file })],
      };
    }

    case "vault_get": {
      const { resolveVaultFileTarget } = await import("@/lib/vault/queries");
      const { toVaultSnapshot } = await import("@/lib/vault/snapshot");
      const row = await resolveVaultFileTarget({
        userId: ctx.userId,
        target: cmd.query,
      });
      if (!row) {
        return {
          text: `File berangkas tidak ditemukan untuk “${cmd.query}”.`,
          instantLabel: "Berangkas",
        };
      }
      const file = toVaultSnapshot(row);
      const urls = vaultUrls(file.id);
      return {
        text: `Metadata **${file.name}** — lihat kartu di bawah.`,
        instantLabel: "Berangkas",
        extraParts: [
          vaultDetailDataPart({
            file,
            openUrl: urls.openUrl,
            downloadUrl: urls.downloadUrl,
          }),
        ],
      };
    }

    case "vault_del": {
      const { resolveVaultFileTarget, deleteVaultFile } = await import(
        "@/lib/vault/queries"
      );
      const row = await resolveVaultFileTarget({
        userId: ctx.userId,
        target: cmd.target,
      });
      if (!row) {
        return {
          text: `File vault tidak ditemukan untuk “${cmd.target}”.`,
          instantLabel: "Vault",
        };
      }
      const removed = await deleteVaultFile({
        userId: ctx.userId,
        fileId: row.id,
      });
      return {
        text: removed
          ? `File **${row.fileName}** dihapus dari Vault.`
          : `Gagal menghapus **${row.fileName}**.`,
        instantLabel: "Vault",
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
