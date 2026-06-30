import { autonomousConfig } from "./config";

export type DeployResult = {
  ok: boolean;
  steps: Array<{ command: string; ok: boolean; output?: string; error?: string }>;
  rollbackHint?: string;
};

export type DeployRemoteStatus = {
  behind: number;
  ahead: number;
  dirty: boolean;
  localHead: string;
  remoteHead: string;
};

function deployPath(): string {
  return autonomousConfig.deployPath;
}

function deployBranch(): string {
  return autonomousConfig.deployBranch;
}

/** Cek apakah GitHub (origin) punya commit baru vs VPS — jalankan sebelum deploy manual. */
export function buildDeployRemoteCheckCommand(): string {
  const path = deployPath();
  const branch = deployBranch();
  return [
    `cd ${path}`,
    `git fetch origin ${branch}`,
    `echo "behind=$(git rev-list --count HEAD..origin/${branch} 2>/dev/null || echo 0)"`,
    `echo "ahead=$(git rev-list --count origin/${branch}..HEAD 2>/dev/null || echo 0)"`,
    `echo "dirty=$(git status --porcelain | wc -l | tr -d ' ')"`,
    `echo "local=$(git rev-parse --short HEAD)"`,
    `echo "remote=$(git rev-parse --short origin/${branch} 2>/dev/null || echo unknown)"`,
  ].join(" && ");
}

/** Perintah deploy produksi — selalu butuh approval sebelum dijalankan. */
export function buildDeployCommands(): string[] {
  const path = deployPath();
  const branch = deployBranch();
  const installCmd = "pnpm install --no-frozen-lockfile && pnpm run build";
  const commands = [
    `cd ${path} && git rev-parse HEAD`,
    `cd ${path} && git fetch origin ${branch} && git pull origin ${branch}`,
    `cd ${path} && ${installCmd}`,
    `cd ${path} && pm2 startOrReload deploy/hostinger/ecosystem.config.cjs --update-env && pm2 save`,
  ];

  if (autonomousConfig.deployPushEnabled) {
    commands.splice(
      1,
      0,
      `cd ${path} && git status --porcelain | grep -q . && git add -A && git commit -m "chore(agent): sync perubahan lokal sebelum deploy" || true`,
      `cd ${path} && git push origin ${branch} || true`
    );
  }

  return commands;
}

export function buildDeployApprovalSummary(): string {
  const branch = deployBranch();
  const path = deployPath();
  const pushNote = autonomousConfig.deployPushEnabled
    ? " (+ push commit lokal VPS ke GitHub jika ada)"
    : "";
  return [
    `Deploy VANDOR di ${path}: pull origin/${branch} + build + pm2 reload${pushNote}.`,
    "Pastikan kode terbaru sudah di-push ke GitHub dari PC (atau CI deploy-vps sudah jalan).",
    "Kalau belum push, VPS cuma tarik commit lama — deploy tidak akan bawa perubahan baru.",
  ].join(" ");
}

export function describeDeployRemoteCheck(output: string): DeployRemoteStatus | null {
  const lines = output.split("\n").map((l) => l.trim());
  const read = (prefix: string): string => {
    const line = lines.find((l) => l.startsWith(`${prefix}=`));
    return line ? line.slice(prefix.length + 1) : "";
  };
  const behind = Number.parseInt(read("behind"), 10);
  const ahead = Number.parseInt(read("ahead"), 10);
  if (Number.isNaN(behind) || Number.isNaN(ahead)) {
    return null;
  }
  const dirtyCount = Number.parseInt(read("dirty"), 10);
  return {
    behind,
    ahead,
    dirty: Number.isNaN(dirtyCount) ? false : dirtyCount > 0,
    localHead: read("local"),
    remoteHead: read("remote"),
  };
}

export function deployRemoteStatusHint(status: DeployRemoteStatus): string {
  if (status.behind === 0 && status.ahead === 0 && !status.dirty) {
    return "VPS sudah sama dengan origin — tidak ada commit baru di GitHub. Push dulu dari PC, baru deploy.";
  }
  if (status.behind > 0) {
    return `${status.behind} commit baru di GitHub siap di-pull ke VPS.`;
  }
  if (status.ahead > 0) {
    return `VPS ${status.ahead} commit di depan GitHub — push dari VPS atau PC dulu supaya sinkron.`;
  }
  if (status.dirty) {
    return "Ada perubahan file belum commit di VPS.";
  }
  return "Siap deploy.";
}

export function buildRollbackCommand(previousCommit: string): string {
  const path = autonomousConfig.deployPath;
  return `cd ${path} && git checkout ${previousCommit} && pnpm install --no-frozen-lockfile && pnpm run build && pm2 startOrReload deploy/hostinger/ecosystem.config.cjs --update-env && pm2 save`;
}
