import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const secret = new TextEncoder().encode(
  process.env.FRIDAY_JWT_SECRET || "friday-jwt-secret-change-in-prod"
);

const COOKIE_NAME = "friday_session";

const PUBLIC = ["/login", "/api/auth/login", "/api/auth/register"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow static assets
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get(COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  try {
    const { payload } = await jwtVerify(token, secret);

    // Inject user info into request headers for downstream use
    const res = NextResponse.next();
    res.headers.set("x-user-id", payload.sub as string);
    res.headers.set("x-user-role", payload.role as string);
    res.headers.set("x-username", payload.username as string);
    return res;
  } catch {
    return NextResponse.redirect(new URL("/login", req.url));
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
