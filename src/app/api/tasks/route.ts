import { NextResponse } from "next/server";
import { listTasks, saveTask, updateTask, deleteTask, type TaskStatus } from "@/lib/memory";

export const runtime = "nodejs";

const VALID_STATUSES = ["done", "doing", "planned", "scheduled"];
const VALID_DAYS = ["MON","TUE","WED","THU","FRI","SAT","SUN"];

export async function GET(req: Request) {
  const userId = req.headers.get("x-user-id") ?? "anonymous";
  const url = new URL(req.url);
  const status = url.searchParams.get("status") as TaskStatus | "all" | null;
  const tasks = await listTasks(userId, status ?? "all");
  return NextResponse.json({ tasks });
}

export async function POST(req: Request) {
  const userId = req.headers.get("x-user-id") ?? "anonymous";
  const body = await req.json().catch(() => ({}));
  const { content, status, scheduledAt, weekdays, category, priority } = body as Record<string, unknown>;

  if (!content || typeof content !== "string" || !content.trim())
    return NextResponse.json({ error: "content required" }, { status: 400 });
  if (!VALID_STATUSES.includes(status as string))
    return NextResponse.json({ error: "invalid status" }, { status: 400 });

  const days = Array.isArray(weekdays)
    ? (weekdays as string[]).filter((d) => VALID_DAYS.includes(d))
    : undefined;

  const id = await saveTask(
    userId,
    content as string,
    status as TaskStatus,
    scheduledAt as string | undefined,
    days,
    category as string | undefined,
    typeof priority === "number" ? priority : 5,
  );
  const tasks = await listTasks(userId, "all");
  return NextResponse.json({ id, tasks });
}

export async function PATCH(req: Request) {
  const userId = req.headers.get("x-user-id") ?? "anonymous";
  const body = await req.json().catch(() => ({}));
  const { taskId, status, scheduledAt, weekdays, category, priority } = body as Record<string, unknown>;

  if (!taskId) return NextResponse.json({ error: "taskId required" }, { status: 400 });

  const days = Array.isArray(weekdays)
    ? (weekdays as string[]).filter((d) => VALID_DAYS.includes(d))
    : undefined;

  const fields: Parameters<typeof updateTask>[2] = {};
  if (status && VALID_STATUSES.includes(status as string)) fields.status = status as TaskStatus;
  if ("scheduledAt" in body) fields.scheduledAt = scheduledAt as string | undefined;
  if (days !== undefined) fields.weekdays = days;
  if ("category" in body) fields.category = category as string | undefined;
  if (typeof priority === "number") fields.priority = priority;

  const ok = await updateTask(userId, taskId as string, fields);
  if (!ok) return NextResponse.json({ error: "task not found" }, { status: 404 });
  const tasks = await listTasks(userId, "all");
  return NextResponse.json({ tasks });
}

export async function DELETE(req: Request) {
  const userId = req.headers.get("x-user-id") ?? "anonymous";
  const body = await req.json().catch(() => ({}));
  const { taskId } = body as { taskId?: string };

  if (!taskId) return NextResponse.json({ error: "taskId required" }, { status: 400 });
  const ok = await deleteTask(userId, taskId);
  if (!ok) return NextResponse.json({ error: "task not found" }, { status: 404 });
  const tasks = await listTasks(userId, "all");
  return NextResponse.json({ tasks });
}
