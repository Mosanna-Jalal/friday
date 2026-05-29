import { NextResponse } from "next/server";
import {
  findUserByUsername,
  verifyPassword,
  signToken,
  ensureAdminExists,
  COOKIE_NAME,
} from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { username, password } = (await req.json()) as {
      username?: string;
      password?: string;
    };

    if (!username || !password) {
      return NextResponse.json({ error: "Username and password required." }, { status: 400 });
    }

    await ensureAdminExists();

    const user = await findUserByUsername(username);
    if (!user || !(await verifyPassword(password, user.passwordHash as string))) {
      return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
    }

    const token = await signToken({
      id: user._id.toString(),
      username: user.username as string,
      displayName: user.displayName as string,
      role: user.role as "admin" | "user",
    });

    const res = NextResponse.json({
      ok: true,
      user: {
        username: user.username,
        displayName: user.displayName,
        role: user.role,
      },
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
    console.error("Login error:", err);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}
