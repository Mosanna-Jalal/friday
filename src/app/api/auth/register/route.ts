import { NextResponse } from "next/server";
import { findUserByUsername, findUserByEmail, createUser, signToken, COOKIE_NAME } from "@/lib/auth";
import { verifyOTP } from "@/lib/otp";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { username, displayName, email, password, confirmPassword, otp } = (await req.json()) as {
      username?: string;
      displayName?: string;
      email?: string;
      password?: string;
      confirmPassword?: string;
      otp?: string;
    };

    if (!username?.trim())
      return NextResponse.json({ error: "Username is required." }, { status: 400 });
    if (!displayName?.trim())
      return NextResponse.json({ error: "Display name is required." }, { status: 400 });
    if (!email?.trim())
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    if (!password || password.length < 6)
      return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
    if (password !== confirmPassword)
      return NextResponse.json({ error: "Passwords do not match." }, { status: 400 });
    if (!otp?.trim())
      return NextResponse.json({ error: "Verification code is required." }, { status: 400 });

    const valid = await verifyOTP(email, otp, "register");
    if (!valid)
      return NextResponse.json({ error: "Invalid or expired verification code." }, { status: 401 });

    const [existingUsername, existingEmail] = await Promise.all([
      findUserByUsername(username),
      findUserByEmail(email),
    ]);
    if (existingUsername)
      return NextResponse.json({ error: "Username already taken." }, { status: 409 });
    if (existingEmail)
      return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });

    const id = await createUser(username.trim(), password, displayName.trim(), "user", email.trim());

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
