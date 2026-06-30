export type VaultHelpCommand = {
  cmd: string;
  desc: string;
  group: "navigasi" | "file" | "organisasi" | "bulk" | "sampah";
};

/** Single source of truth — dipakai kartu help, banner hint, dan command `i`. */
export const VAULT_MODE_COMMANDS: VaultHelpCommand[] = [
  { cmd: "i", desc: "tampilkan daftar perintah ini", group: "navigasi" },
  { cmd: "list", desc: "daftar semua file", group: "navigasi" },
  {
    cmd: "list image · video · pdf · pinned",
    desc: "filter tipe / favorit",
    group: "navigasi",
  },
  { cmd: "list folder:<nama>", desc: "file dalam folder", group: "navigasi" },
  { cmd: "recent", desc: "10 file terbaru", group: "navigasi" },
  { cmd: "stats", desc: "ringkasan ukuran & tipe", group: "navigasi" },
  { cmd: "search <kata>", desc: "cari semantic + keyword", group: "navigasi" },
  { cmd: "folders", desc: "daftar folder/koleksi", group: "organisasi" },
  {
    cmd: "move <id> folder:<nama>",
    desc: "pindah file ke folder",
    group: "organisasi",
  },
  { cmd: "read <nama|id>", desc: "baca & preview file", group: "file" },
  { cmd: "add", desc: "upload file baru", group: "file" },
  {
    cmd: "#T <isi catatan>",
    desc: "simpan catatan teks langsung",
    group: "file",
  },
  { cmd: "pin / unpin <id>", desc: "tandai favorit", group: "file" },
  { cmd: "rename <id> <nama>", desc: "ganti nama tampilan", group: "file" },
  { cmd: "update <id> tags:...", desc: "edit metadata & tag", group: "file" },
  { cmd: "delete <nama|id>", desc: "pindah ke sampah", group: "sampah" },
  { cmd: "trash", desc: "lihat isi sampah", group: "sampah" },
  { cmd: "restore <id>", desc: "pulihkan dari sampah", group: "sampah" },
  { cmd: "purge trash", desc: "hapus permanen isi sampah", group: "sampah" },
  {
    cmd: "bulk tag <tag> <id...>",
    desc: "tambah tag ke banyak file",
    group: "bulk",
  },
  { cmd: "bulk delete tag:<tag>", desc: "hapus massal by tag", group: "bulk" },
  {
    cmd: "bulk delete type:image",
    desc: "hapus massal by tipe",
    group: "bulk",
  },
  { cmd: "exit", desc: "kembali ke Chat Mode", group: "navigasi" },
];

const GROUP_LABEL: Record<VaultHelpCommand["group"], string> = {
  navigasi: "Navigasi & cari",
  file: "File",
  organisasi: "Folder & favorit",
  bulk: "Bulk",
  sampah: "Sampah",
};

export function formatVaultHelpText(): string {
  const lines: string[] = [
    "**Perintah Vault Mode** — ketik `i` kapan saja untuk buka daftar ini.",
  ];
  let lastGroup: VaultHelpCommand["group"] | null = null;
  for (const item of VAULT_MODE_COMMANDS) {
    if (item.group !== lastGroup) {
      lastGroup = item.group;
      lines.push("", `**${GROUP_LABEL[item.group]}**`);
    }
    lines.push(`- \`${item.cmd}\` — ${item.desc}`);
  }
  lines.push(
    "",
    "_Chat Mode:_ `/v` masuk · `/share-to-ai <id>` bagikan file ke AI."
  );
  return lines.join("\n");
}
