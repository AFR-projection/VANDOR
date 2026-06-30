import { auth } from "@/app/(auth)/auth";
import { buildDeployApprovalSummary } from "@/lib/autonomous/deploy";
import {
  createSchedule,
  deleteSchedule,
  listSchedules,
  triggerSchedule,
  updateSchedule,
} from "@/lib/autonomous/schedules-manage";
import { enqueueTask } from "@/lib/autonomous/tasks";
import type { AgentScheduleKind } from "@/lib/db/schema";
import { agentScheduleKinds } from "@/lib/db/schema";
import { requireClientAccess } from "@/lib/security/client-access";

async function guard(request: Request) {
  const denied = await requireClientAccess(request);
  if (denied) {
    return denied;
  }
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return session;
}

export async function GET(request: Request) {
  const session = await guard(request);
  if (session instanceof Response) {
    return session;
  }
  const schedules = await listSchedules();
  return Response.json({ schedules });
}

export async function POST(request: Request) {
  const session = await guard(request);
  if (session instanceof Response) {
    return session;
  }

  let body: {
    action?: unknown;
    id?: unknown;
    name?: unknown;
    kind?: unknown;
    expression?: unknown;
    taskType?: unknown;
    enabled?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body tidak valid" }, { status: 400 });
  }

  if (body.action === "trigger" && typeof body.id === "string") {
    const ok = await triggerSchedule(body.id);
    if (!ok) {
      return Response.json(
        { error: "Jadwal tidak ditemukan" },
        { status: 404 }
      );
    }
    return Response.json({ ok: true });
  }

  if (body.action === "deploy") {
    const task = await enqueueTask({
      type: "deploy",
      title: buildDeployApprovalSummary(),
      priority: 8,
      dedupe: true,
    });
    return Response.json({ ok: true, taskId: task.id });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const expression =
    typeof body.expression === "string" ? body.expression.trim() : "";
  const taskType =
    typeof body.taskType === "string" ? body.taskType.trim() : "";
  const kind =
    typeof body.kind === "string" &&
    agentScheduleKinds.includes(body.kind as AgentScheduleKind)
      ? (body.kind as AgentScheduleKind)
      : "interval";

  if (!name || !expression || !taskType) {
    return Response.json(
      { error: "name, expression, taskType wajib" },
      { status: 400 }
    );
  }

  const schedule = await createSchedule({
    name,
    kind,
    expression,
    taskType,
    enabled: body.enabled !== false,
  });
  return Response.json({ schedule }, { status: 201 });
}

export async function PATCH(request: Request) {
  const session = await guard(request);
  if (session instanceof Response) {
    return session;
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body tidak valid" }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id : "";
  if (!id) {
    return Response.json({ error: "id wajib" }, { status: 400 });
  }

  const schedule = await updateSchedule(id, {
    name: typeof body.name === "string" ? body.name : undefined,
    kind:
      typeof body.kind === "string" &&
      agentScheduleKinds.includes(body.kind as AgentScheduleKind)
        ? (body.kind as AgentScheduleKind)
        : undefined,
    expression:
      typeof body.expression === "string" ? body.expression : undefined,
    taskType: typeof body.taskType === "string" ? body.taskType : undefined,
    enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
  });

  if (!schedule) {
    return Response.json({ error: "Jadwal tidak ditemukan" }, { status: 404 });
  }
  return Response.json({ schedule });
}

export async function DELETE(request: Request) {
  const session = await guard(request);
  if (session instanceof Response) {
    return session;
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id") ?? "";
  if (!id) {
    return Response.json({ error: "id wajib" }, { status: 400 });
  }

  const ok = await deleteSchedule(id);
  if (!ok) {
    return Response.json({ error: "Jadwal tidak ditemukan" }, { status: 404 });
  }
  return Response.json({ ok: true });
}
