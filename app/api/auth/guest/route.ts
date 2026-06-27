import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { signIn } from "@/app/(auth)/auth";
import { useSecureCookies } from "@/lib/constants";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawRedirect = searchParams.get("redirectUrl") || "/";
  const redirectUrl =
    rawRedirect.startsWith("/") && !rawRedirect.startsWith("//")
      ? rawRedirect
      : "/";

  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const secure = useSecureCookies();

  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    secureCookie: secure,
  });

  if (token) {
    return NextResponse.redirect(new URL(`${base}/`, request.url));
  }

  try {
    await signIn("guest", { redirect: false });
  } catch {
    return NextResponse.redirect(new URL(`${base}/gate`, request.url));
  }

  const target = new URL(`${base}${redirectUrl}`, request.url);
  const response = NextResponse.redirect(target);
  const store = await cookies();

  for (const c of store.getAll()) {
    if (!c.name.includes("authjs") && !c.name.includes("next-auth")) {
      continue;
    }
    response.cookies.set(c.name, c.value, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: c.name.includes("session-token") ? 60 * 60 * 24 * 30 : undefined,
    });
  }

  return response;
}
