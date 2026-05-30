import { NextResponse } from "next/server";
import { findUserByEmail } from "@/lib/auth";
import { generateOTP, storeOTP } from "@/lib/otp";
import { sendOTPEmail } from "@/lib/email";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { email, purpose } = (await req.json()) as { email?: string; purpose?: string };

    if (!email?.trim())
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    if (!["login", "register", "reset"].includes(purpose ?? ""))
      return NextResponse.json({ error: "Invalid purpose." }, { status: 400 });

    if (purpose === "login" || purpose === "reset") {
      const user = await findUserByEmail(email);
      if (!user)
        return NextResponse.json({ error: "No account found with this email." }, { status: 404 });
    }

    const code = generateOTP();
    await storeOTP(email.toLowerCase().trim(), code, purpose as "login" | "register" | "reset");
    await sendOTPEmail(email.trim(), code, purpose as "login" | "register" | "reset");

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("send-otp error:", err);
    return NextResponse.json({ error: "Failed to send code. Try again." }, { status: 500 });
  }
}
