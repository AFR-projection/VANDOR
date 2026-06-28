import { autonomousConfig } from "./config";

export type DeployResult = {
  ok: boolean;
  steps: Array<{ command: string; ok: boolean; output?: string; error?: string }>;
  rollbackHint?: string;
};

/** Perintah deploy produksi — selalu butuh approval sebelum dijalankan. */
export function buildDeployCommands(): string[] {
  const path = autonomousConfig.deployPath;
  const branch = autonomousConfig.deployBranch;
  return [
    `cd ${path} && git rev-parse HEAD`,
    `cd ${path} && git fetch origin ${branch} && git pull origin ${branch}`,
    `cd ${path} && npm ci && npm run build`,
    `cd ${path} && pm2 startOrReload deploy/hostinger/ecosystem.config.cjs --update-env && pm2 save`,
  ];
}

export function buildDeployApprovalSummary(): string {
  return `Deploy VANDOR: git pull (${autonomousConfig.deployBranch}) + build + pm2 reload di ${autonomousConfig.deployPath}`;
}

export function buildRollbackCommand(previousCommit: string): string {
  const path = autonomousConfig.deployPath;
  return `cd ${path} && git checkout ${previousCommit} && npm ci && npm run build && pm2 startOrReload deploy/hostinger/ecosystem.config.cjs --update-env && pm2 save`;
}
