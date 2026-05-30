import { NextResponse } from "next/server";
import { findUserByEmail, updatePassword } from "@/lib/auth";
import { verifyOTP } from "@/lib/otp";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { email, code, newPassword } = (await req.json()) as {
      email?: string;
      code?: string;
      newPassword?: string;
    };

    if (!email || !code || !newPassword)
      return NextResponse.json({ error: "All fields are required." }, { status: 400 });
    if (newPassword.length < 6)
      return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });

    const valid = await verifyOTP(email, code, "reset");
    if (!valid)
      return NextResponse.json({ error: "Invalid or expired code." }, { status: 401 });

    const user = await findUserByEmail(email);
    if (!user)
      return NextResponse.json({ error: "Account not found." }, { status: 404 });

    await updatePassword(user._id.toString(), newPassword);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("reset-password error:", err);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}
