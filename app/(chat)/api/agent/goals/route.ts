import { auth } from "@/app/(auth)/auth";
import {
  createGoal,
  deleteGoal,
  listGoals,
  updateGoal,
} from "@/lib/autonomous/goals";
import { resolveOwnerUserId } from "@/lib/autonomous/owner";
import { requireClientAccess } from "@/lib/security/client-access";
import type { AgentGoalStatus } from "@/lib/db/schema";
import { agentGoalStatuses } from "@/lib/db/schema";

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
  const goals = await listGoals(50);
  return Response.json({ goals });
}

export async function POST(request: Request) {
  const session = await guard(request);
  if (session instanceof Response) {
    return session;
  }

  let body: {
    title?: unknown;
    description?: unknown;
    priority?: unknown;
    deadline?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body tidak valid" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (title.length < 3) {
    return Response.json({ error: "title min 3 karakter" }, { status: 400 });
  }

  const ownerId = await resolveOwnerUserId();
  const goal = await createGoal({
    userId: ownerId,
    title,
    description:
      typeof body.description === "string" ? body.description : null,
    priority:
      typeof body.priority === "number" && body.priority >= 1 && body.priority <= 10
        ? body.priority
        : 5,
    deadline:
      typeof body.deadline === "string" ? new Date(body.deadline) : null,
  });

  return Response.json({ goal }, { status: 201 });
}

export async function PATCH(request: Request) {
  const session = await guard(request);
  if (session instanceof Response) {
    return session;
  }

  let body: {
    id?: unknown;
    title?: unknown;
    description?: unknown;
    status?: unknown;
    priority?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body tidak valid" }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id : "";
  if (!id) {
    return Response.json({ error: "id wajib" }, { status: 400 });
  }

  const status =
    typeof body.status === "string" &&
    agentGoalStatuses.includes(body.status as AgentGoalStatus)
      ? (body.status as AgentGoalStatus)
      : undefined;

  const goal = await updateGoal(id, {
    title: typeof body.title === "string" ? body.title : undefined,
    description:
      typeof body.description === "string" ? body.description : undefined,
    status,
    priority:
      typeof body.priority === "number" ? body.priority : undefined,
  });

  if (!goal) {
    return Response.json({ error: "Goal tidak ditemukan" }, { status: 404 });
  }
  return Response.json({ goal });
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

  const ok = await deleteGoal(id);
  if (!ok) {
    return Response.json({ error: "Goal tidak ditemukan" }, { status: 404 });
  }
  return Response.json({ ok: true });
}
