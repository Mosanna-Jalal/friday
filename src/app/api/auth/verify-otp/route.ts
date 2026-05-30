import { NextResponse } from "next/server";
import { findUserByEmail, signToken, COOKIE_NAME } from "@/lib/auth";
import { verifyOTP } from "@/lib/otp";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { email, code } = (await req.json()) as { email?: string; code?: string };

    if (!email || !code)
      return NextResponse.json({ error: "Email and code are required." }, { status: 400 });

    const valid = await verifyOTP(email, code, "login");
    if (!valid)
      return NextResponse.json({ error: "Invalid or expired code." }, { status: 401 });

    const user = await findUserByEmail(email);
    if (!user)
      return NextResponse.json({ error: "Account not found." }, { status: 404 });

    const token = await signToken({
      id: user._id.toString(),
      username: user.username as string,
      displayName: user.displayName as string,
      role: user.role as "admin" | "user",
    });

    const res = NextResponse.json({
      ok: true,
      user: { username: user.username, displayName: user.displayName, role: user.role },
    });
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60,
      path: "/",
    });
    return res;
  } catch (err) {
    console.error("verify-otp error:", err);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}
