import { auth } from "@/app/(auth)/auth";
import {
  createRule,
  deleteRule,
  listRules,
  updateRule,
} from "@/lib/autonomous/rules";
import type { AgentRiskLevel, AgentRuleKind } from "@/lib/db/schema";
import { agentRiskLevels, agentRuleKinds } from "@/lib/db/schema";
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
  const rules = await listRules();
  return Response.json({ rules });
}

export async function POST(request: Request) {
  const session = await guard(request);
  if (session instanceof Response) {
    return session;
  }

  let body: {
    name?: unknown;
    kind?: unknown;
    pattern?: unknown;
    riskLevel?: unknown;
    priority?: unknown;
    note?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body tidak valid" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const pattern = typeof body.pattern === "string" ? body.pattern.trim() : "";
  const kind =
    typeof body.kind === "string" &&
    agentRuleKinds.includes(body.kind as AgentRuleKind)
      ? (body.kind as AgentRuleKind)
      : null;

  if (!name || !pattern || !kind) {
    return Response.json(
      { error: "name, kind, pattern wajib" },
      { status: 400 }
    );
  }

  try {
    const rule = await createRule({
      name,
      kind,
      pattern,
      riskLevel:
        typeof body.riskLevel === "string" &&
        agentRiskLevels.includes(body.riskLevel as AgentRiskLevel)
          ? (body.riskLevel as AgentRiskLevel)
          : "moderate",
      priority: typeof body.priority === "number" ? body.priority : 100,
      note: typeof body.note === "string" ? body.note : null,
    });
    return Response.json({ rule }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Gagal buat rule" },
      { status: 400 }
    );
  }
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

  const rule = await updateRule(id, {
    name: typeof body.name === "string" ? body.name : undefined,
    kind:
      typeof body.kind === "string" &&
      agentRuleKinds.includes(body.kind as AgentRuleKind)
        ? (body.kind as AgentRuleKind)
        : undefined,
    pattern: typeof body.pattern === "string" ? body.pattern : undefined,
    riskLevel:
      typeof body.riskLevel === "string" &&
      agentRiskLevels.includes(body.riskLevel as AgentRiskLevel)
        ? (body.riskLevel as AgentRiskLevel)
        : undefined,
    priority: typeof body.priority === "number" ? body.priority : undefined,
    note: typeof body.note === "string" ? body.note : undefined,
    enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
  });

  if (!rule) {
    return Response.json(
      { error: "Rule tidak ditemukan/invalid" },
      { status: 404 }
    );
  }
  return Response.json({ rule });
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

  const ok = await deleteRule(id);
  if (!ok) {
    return Response.json({ error: "Rule tidak ditemukan" }, { status: 404 });
  }
  return Response.json({ ok: true });
}
