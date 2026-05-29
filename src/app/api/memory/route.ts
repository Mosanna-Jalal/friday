import { NextResponse } from "next/server";
import { readMemory, rememberFact, forgetFact } from "@/lib/memory";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const userId = req.headers.get("x-user-id") ?? "anonymous";
  const memory = await readMemory(userId);
  return NextResponse.json(memory);
}

export async function POST(req: Request) {
  const userId = req.headers.get("x-user-id") ?? "anonymous";
  let body: { fact?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const fact = typeof body.fact === "string" ? body.fact.trim() : "";
  if (!fact) {
    return NextResponse.json(
      { error: "Field 'fact' is required and must be a non-empty string." },
      { status: 400 },
    );
  }
  await rememberFact(fact, userId);
  const memory = await readMemory(userId);
  return NextResponse.json(memory);
}

export async function DELETE(req: Request) {
  const userId = req.headers.get("x-user-id") ?? "anonymous";
  let body: { fact?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const fact = typeof body.fact === "string" ? body.fact : "";
  if (!fact) {
    return NextResponse.json(
      { error: "Field 'fact' is required." },
      { status: 400 },
    );
  }
  await forgetFact(fact, userId);
  const memory = await readMemory(userId);
  return NextResponse.json(memory);
}
