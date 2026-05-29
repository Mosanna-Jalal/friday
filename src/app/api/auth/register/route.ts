import { NextResponse } from "next/server";
import { findUserByUsername, createUser, signToken, COOKIE_NAME } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { username, displayName, password, confirmPassword } = (await req.json()) as {
      username?: string;
      displayName?: string;
      password?: string;
      confirmPassword?: string;
    };

    if (!username?.trim())
      return NextResponse.json({ error: "Username is required." }, { status: 400 });
    if (!displayName?.trim())
      return NextResponse.json({ error: "Display name is required." }, { status: 400 });
    if (!password || password.length < 6)
      return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
    if (password !== confirmPassword)
      return NextResponse.json({ error: "Passwords do not match." }, { status: 400 });

    const existing = await findUserByUsername(username);
    if (existing)
      return NextResponse.json({ error: "Username already taken." }, { status: 409 });

    const id = await createUser(username.trim(), password, displayName.trim(), "user");

    const token = await signToken({
      id: id.toString(),
      username: username.toLowerCase().trim(),
      displayName: displayName.trim(),
      role: "user",
    });

    const res = NextResponse.json({
      ok: true,
      user: { username: username.toLowerCase().trim(), displayName: displayName.trim(), role: "user" },
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
    console.error("Register error:", err);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}
