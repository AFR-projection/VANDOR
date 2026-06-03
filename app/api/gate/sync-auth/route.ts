import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { signIn } from "@/app/(auth)/auth";
import { isDevelopmentEnvironment } from "@/lib/constants";
import { ensureOwnerUser } from "@/lib/db/ensure-owner";
import { getClientAccessSnapshot } from "@/lib/security/client-access";
import { getOwnerCredentials } from "@/lib/security/gate-edge";

/** Gate cookie valid but NextAuth session missing — restore without new PIN. */
export async function GET(request: Request) {
  const snapshot = await getClientAccessSnapshot(request);
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const { searchParams } = new URL(request.url);
  const rawRedirect = searchParams.get("redirectUrl") ?? "/";
  const redirectPath =
    rawRedirect.startsWith("/") && !rawRedirect.startsWith("//")
      ? rawRedirect
      : "/";

  if (snapshot.requiresPin) {
    const reason = snapshot.sessionRevoked ? "revoked" : "expired";
    return NextResponse.redirect(
      new URL(`${base}/gate?reason=${reason}`, request.url)
    );
  }

  const owner = getOwnerCredentials();
  if (!owner) {
    return NextResponse.redirect(new URL(`${base}/`, request.url));
  }

  try {
    await ensureOwnerUser();
    await signIn("credentials", {
      email: owner.email,
      password: owner.password,
      redirect: false,
    });
  } catch {
    return NextResponse.redirect(
      new URL(`${base}/gate?reason=expired`, request.url)
    );
  }

  const target = new URL(`${base}${redirectPath}`, request.url);
  const response = NextResponse.redirect(target);
  const secure = !isDevelopmentEnvironment;
  const store = await cookies();

  for (const c of store.getAll()) {
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
