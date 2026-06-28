import { auth } from "@/app/(auth)/auth";
import { runCodeScan } from "@/lib/autonomous/coding-agent/scan";
import { runCliCommand } from "@/lib/autonomous/cli/runner";
import { enqueueTask } from "@/lib/autonomous/tasks";
import { requireClientAccess } from "@/lib/security/client-access";
import { evaluateCommand } from "@/lib/autonomous/rule-engine";

/** POST — jalankan perintah CLI nyata (log ke AgentTerminalLog). */
export async function POST(request: Request) {
  const denied = await requireClientAccess(request);
  if (denied) {
    return denied;
  }
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { command?: string; action?: string; fullBuild?: boolean };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body tidak valid" }, { status: 400 });
  }

  if (body.action === "scan") {
    const scan = await runCodeScan({
      fullBuild: Boolean(body.fullBuild),
      echo: false,
    });
    return Response.json(scan);
  }

  if (body.action === "enqueue_scan") {
    const { id, deduped } = await enqueueTask({
      type: "code_scan",
      title: body.fullBuild ? "Code scan + build" : "Code scan",
      payload: { fullBuild: Boolean(body.fullBuild) },
      priority: 7,
      dedupe: true,
    });
    return Response.json({ ok: true, taskId: id, deduped });
  }

  if (body.action === "enqueue_fix") {
    const { id, deduped } = await enqueueTask({
      type: "code_fix",
      title: "Coding agent — analisis & fix",
      priority: 8,
      dedupe: true,
    });
    return Response.json({ ok: true, taskId: id, deduped });
  }

  const command = body.command?.trim();
  if (!command) {
    return Response.json({ error: "command atau action wajib" }, { status: 400 });
  }

  const verdict = await evaluateCommand(command);
  if (verdict.decision === "deny") {
    return Response.json(
      { ok: false, error: verdict.reason, blocked: true },
      { status: 403 }
    );
  }
  if (verdict.decision === "require_approval") {
    return Response.json(
      {
        ok: false,
        needsApproval: true,
        risk: verdict.risk,
        reason: verdict.reason,
      },
      { status: 428 }
    );
  }

  const result = await runCliCommand(command, { echo: false, stream: "cli" });
  return Response.json({
    ok: result.ok,
    sessionId: result.sessionId,
    exitCode: result.exitCode,
    stdout: result.stdout.slice(0, 4000),
    stderr: result.stderr.slice(0, 2000),
  });
}
