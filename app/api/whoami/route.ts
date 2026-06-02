import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const fwd = request.headers.get("x-forwarded-for");
  const real = request.headers.get("x-real-ip");
  const ip = fwd
    ? (fwd.split(",")[0]?.trim() ?? "unknown")
    : real
      ? real.trim()
      : "local";
  return NextResponse.json(
    { ip, forwarded: fwd, realIp: real },
    { headers: { "Cache-Control": "no-store" } }
  );
}
