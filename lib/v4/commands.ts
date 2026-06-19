import "server-only";

import type { RequestHints } from "@/lib/ai/prompts";
import { parseMediaSlash } from "@/lib/chat/media-slash";
import {
  parseShareToAi,
  parseVaultDelete,
  parseVaultEnter,
  parseVaultGet,
  parseVaultList,
  parseVaultModeAdd,
  parseVaultModeBareList,
  parseVaultModeDelete,
  parseVaultModeExit,
  parseVaultModeRead,
  parseVaultModeUpdate,
  parseVaultOpen,
  parseVaultUploaded,
} from "@/lib/chat/vault-slash";
import {
  shareToAiDataPart,
  vaultDeniedDataPart,
  vaultDetailDataPart,
  vaultListDataPart,
  vaultOpenDataPart,
  vaultReadDataPart,
  vaultUploadDataPart,
  vaultUrls,
} from "@/lib/vault/notice";
import {
  vaultModeEnterDataPart,
  vaultModeExitDataPart,
} from "@/lib/vault/mode";
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
  | { kind: "vault_enter" }
  | { kind: "vault_exit" }
  | { kind: "vault_list" }
  | { kind: "vault_get"; query: string }
  | { kind: "vault_del"; target: string }
  | { kind: "vault_open"; fileId: string }
  | { kind: "vault_uploaded"; fileId: string }
  | { kind: "vault_read"; target: string }
  | { kind: "vault_add" }
  | { kind: "vault_update"; target: string; patch: string }
  | { kind: "share_to_ai"; fileId: string }
  | { kind: "vault_denied"; attempted: string };

export type ParseDirectCommandOptions = {
  /** True when chat is currently in Vault Mode. Affects parsing & isolation. */
  vaultMode?: boolean;
};

export function parseDirectCommand(
  text: string,
  hints: RequestHints,
  chatId?: string,
  options: ParseDirectCommandOptions = {}
): DirectCommand | null {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  const vaultMode = options.vaultMode === true;

  // ── Vault Mode: ISOLATED — only vault commands allowed ─────────────
  if (vaultMode) {
    if (parseVaultModeExit(trimmed)) {
      return { kind: "vault_exit" };
    }
    if (parseVaultEnter(trimmed)) {
      // already in mode → just acknowledge enter (idempotent)
      return { kind: "vault_enter" };
    }
    if (parseVaultModeBareList(trimmed) || parseVaultList(trimmed)) {
      return { kind: "vault_list" };
    }
    const readTarget = parseVaultModeRead(trimmed);
    if (readTarget) {
      return { kind: "vault_read", target: readTarget };
    }
    if (parseVaultModeAdd(trimmed)) {
      return { kind: "vault_add" };
    }
    const upd = parseVaultModeUpdate(trimmed);
    if (upd) {
      return { kind: "vault_update", target: upd.target, patch: upd.patch };
    }
    const delTarget =
      parseVaultModeDelete(trimmed) ?? parseVaultDelete(trimmed);
    if (delTarget) {
      return { kind: "vault_del", target: delTarget };
    }
    const getQuery = parseVaultGet(trimmed);
    if (getQuery) {
      return { kind: "vault_get", query: getQuery };
    }
    // Vault upload via `/v up`
    if (/^\/?v\s+up\s*$/i.test(trimmed)) {
      return { kind: "vault_add" };
    }
    const uploaded = parseVaultUploaded(trimmed);
    if (uploaded) {
      return { kind: "vault_uploaded", fileId: uploaded.fileId };
    }
    // Anything else → REJECT (AI is OFF in vault mode)
    return { kind: "vault_denied", attempted: trimmed.slice(0, 120) };
  }

  // ── Chat Mode: full router ─────────────────────────────────────────

  if (parseMediaSlash(trimmed)) {
    return { kind: "media" };
  }

  // Vault Mode entry
  if (parseVaultEnter(trimmed)) {
    return { kind: "vault_enter" };
  }

  // /share-to-ai <id> — explicit consent
  const share = parseShareToAi(trimmed);
  if (share) {
    return { kind: "share_to_ai", fileId: share.fileId };
  }

  if (parseVaultList(trimmed)) {
    return { kind: "vault_list" };
  }

  const vaultOpen = parseVaultOpen(trimmed);
  if (vaultOpen) {
    // Legacy `/v open <id>` is now an alias for /share-to-ai
    return { kind: "share_to_ai", fileId: vaultOpen.fileId };
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

/** Text-based MIME types whose decrypted bytes are safe to render as text. */
const TEXT_LIKE_MIMES = new Set([
  "text/plain",
  "text/markdown",
  "text/x-markdown",
  "text/csv",
  "application/json",
  "application/xml",
  "text/xml",
  "text/html",
  "text/css",
  "text/javascript",
  "application/javascript",
  "application/x-yaml",
  "text/yaml",
]);

function isTextLikeMime(mime: string): boolean {
  if (TEXT_LIKE_MIMES.has(mime)) return true;
  return mime.startsWith("text/");
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

    // ── Vault Mode lifecycle ─────────────────────────────────────────

    case "vault_enter": {
      return {
        text: "",
        instantLabel: "Vault Mode",
        extraParts: [
          vaultModeEnterDataPart({ enteredAt: new Date().toISOString() }),
        ],
      };
    }

    case "vault_exit": {
      return {
        text: "",
        instantLabel: "Chat Mode",
        extraParts: [
          vaultModeExitDataPart({
            exitedAt: new Date().toISOString(),
            reason: "user",
          }),
        ],
      };
    }

    case "vault_denied": {
      return {
        text: "",
        instantLabel: "Vault Mode",
        extraParts: [
          vaultDeniedDataPart({
            attempted: cmd.attempted,
            reason:
              "Vault Mode aktif — AI dimatikan. Hanya command Vault yang tersedia (`list`, `read <id>`, `add`, `update <id> ...`, `delete <id>`). Ketik `exit` untuk kembali ke Chat Mode.",
          }),
        ],
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

    case "vault_open":
    case "share_to_ai": {
      const fileId = cmd.kind === "vault_open" ? cmd.fileId : cmd.fileId;
      const { getVaultFileById } = await import("@/lib/vault/queries");
      const { toVaultSnapshot } = await import("@/lib/vault/snapshot");
      const row = await getVaultFileById({
        userId: ctx.userId,
        fileId,
      });
      if (!row) {
        return {
          text: "File berangkas tidak ditemukan. Cek ID dengan `/v list`.",
          instantLabel: "Berangkas",
        };
      }
      const file = toVaultSnapshot(row);
      const urls = vaultUrls(file.id);
      // share_to_ai uses a special warning card; legacy open path uses open card
      const parts =
        cmd.kind === "share_to_ai"
          ? [
              shareToAiDataPart({
                file,
                openUrl: urls.openUrl,
                downloadUrl: urls.downloadUrl,
              }),
            ]
          : [
              vaultOpenDataPart({
                file,
                openUrl: urls.openUrl,
                downloadUrl: urls.downloadUrl,
              }),
            ];
      return {
        text:
          cmd.kind === "share_to_ai"
            ? `⚠️ **${file.name}** dibagikan ke AI untuk sesi chat ini. Isi file akan masuk context model.`
            : `**${file.name}** dibuka dari berangkas. File aktif untuk sesi chat ini.`,
        instantLabel: "Berangkas",
        extraParts: parts,
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
          text: `File berangkas tidak ditemukan untuk "${cmd.query}".`,
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

    case "vault_read": {
      const { resolveVaultFileTarget } = await import("@/lib/vault/queries");
      const { toVaultSnapshot } = await import("@/lib/vault/snapshot");
      const row = await resolveVaultFileTarget({
        userId: ctx.userId,
        target: cmd.target,
      });
      if (!row) {
        return {
          text: `File berangkas tidak ditemukan untuk "${cmd.target}".`,
          instantLabel: "Vault",
        };
      }
      const file = toVaultSnapshot(row);
      const urls = vaultUrls(file.id);

      // For text-like files, decrypt and inline preview (Vault Mode only,
      // direct backend → user → never touches LLM).
      let textContent: string | undefined;
      let textTruncated = false;
      if (isTextLikeMime(file.mimeType) && file.size <= 32 * 1024) {
        try {
          const { decryptVaultFile } = await import("@/lib/vault/retrieve");
          const decrypted = await decryptVaultFile({
            userId: ctx.userId,
            fileId: file.id,
            audit: true,
            auditDetail: { source: "vault-mode-read" },
          });
          if (decrypted) {
            const raw = decrypted.data.toString("utf8");
            const MAX = 16 * 1024;
            if (raw.length > MAX) {
              textContent = raw.slice(0, MAX);
              textTruncated = true;
            } else {
              textContent = raw;
            }
          }
        } catch {
          // fall through: card without inline text
        }
      }

      return {
        text: `**${file.name}** — ${file.type} · ${(file.size / 1024).toFixed(1)} KB`,
        instantLabel: "Vault",
        extraParts: [
          vaultReadDataPart({
            file,
            downloadUrl: urls.downloadUrl,
            textContent,
            textTruncated,
          }),
        ],
      };
    }

    case "vault_add": {
      // Signal to client to open upload UI.
      return {
        text: "Klik tombol upload yang muncul untuk pilih file Vault, atau gunakan `/v up`.",
        instantLabel: "Vault Upload",
        extraParts: [
          {
            type: "data-vault-add-prompt",
            data: { hint: "open-upload-ui" },
          },
        ],
      };
    }

    case "vault_update": {
      const { resolveVaultFileTarget, updateVaultFileMeta } = await import(
        "@/lib/vault/queries"
      );
      const row = await resolveVaultFileTarget({
        userId: ctx.userId,
        target: cmd.target,
      });
      if (!row) {
        return {
          text: `File vault tidak ditemukan untuk "${cmd.target}".`,
          instantLabel: "Vault",
        };
      }

      // Parse patch: "tags:work,private" / "summary: ..." / "name: ..."
      const tagsMatch = cmd.patch.match(/tags?\s*[:=]\s*(.+)/i);
      const summaryMatch = cmd.patch.match(/summary\s*[:=]\s*(.+)/i);
      let tags: string[] | undefined;
      let summary: string | undefined;
      if (tagsMatch?.[1]) {
        tags = tagsMatch[1]
          .split(/[,;]+/)
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 20);
      }
      if (summaryMatch?.[1]) {
        summary = summaryMatch[1].trim().slice(0, 500);
      }
      if (!tags && !summary) {
        // Treat free-form text as summary by default
        summary = cmd.patch.slice(0, 500);
      }
      const updated = await updateVaultFileMeta({
        userId: ctx.userId,
        fileId: row.id,
        tags,
        summary,
      });
      if (!updated) {
        return {
          text: `Gagal memperbarui **${row.fileName}**.`,
          instantLabel: "Vault",
        };
      }
      const snap = updated;
      const urls = vaultUrls(snap.id);
      return {
        text: `Metadata **${snap.name}** diperbarui.`,
        instantLabel: "Vault",
        extraParts: [
          vaultDetailDataPart({
            file: snap,
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
          text: `File vault tidak ditemukan untuk "${cmd.target}".`,
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
            ? `Ditemukan **${count} sumber** untuk "${cmd.query}". Lihat kartu SUMBER di bawah — ringkas dari situ, tanpa mengulang link mentah.`
            : `Tidak ada sumber untuk "${cmd.query}". Coba kata kunci lain.`,
        instantLabel: "Pencarian",
        extraParts,
      };
    }

    default:
      return { text: "Perintah tidak dikenali.", instantLabel: "VANDOR" };
  }
}
