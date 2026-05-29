import { NextResponse } from "next/server";
import { saveFeedback, type FeedbackType } from "@/lib/memory";

export const runtime = "nodejs";

const VALID_TYPES = ["feedback", "suggestion", "bug"];

export async function POST(req: Request) {
  const userId = req.headers.get("x-user-id") ?? "anonymous";
  const body = await req.json().catch(() => ({}));
  const { type, message } = body as { type?: string; message?: string };

  if (!type || !VALID_TYPES.includes(type))
    return NextResponse.json({ error: "invalid type" }, { status: 400 });
  if (!message?.trim())
    return NextResponse.json({ error: "message required" }, { status: 400 });

  await saveFeedback(userId, type as FeedbackType, message);
  return NextResponse.json({ ok: true });
}
