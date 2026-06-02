import { NextResponse } from "next/server";
import { clearActiveSession, GATE_COOKIE_NAME } from "@/lib/security/gate";

export async function POST() {
  await clearActiveSession();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(GATE_COOKIE_NAME, "", {
    httpOnly: true,
    path: "/",
    maxAge: 0,
  });
  return response;
}
