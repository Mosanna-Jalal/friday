import { ObjectId, type Collection } from "mongodb";
import { getFridayDb } from "./mongodb";

export type Memory = { facts: string[] };
export type ChatMessage = { role: "user" | "assistant"; content: string; ts: number; userId: string };

export type TaskStatus = "done" | "doing" | "planned" | "scheduled";
export type Task = {
  _id?: string;
  userId: string;
  content: string;
  status: TaskStatus;
  scheduledAt?: string;
  weekdays?: string[];
  category?: string;
  priority: number;
  createdAt: Date;
  updatedAt: Date;
};

export type FeedbackType = "feedback" | "suggestion" | "bug";
export type Feedback = {
  _id?: string;
  userId: string;
  type: FeedbackType;
  message: string;
  createdAt: Date;
};

async function factsCol(): Promise<Collection> {
  return (await getFridayDb()).collection("memory");
}

async function historyCol(): Promise<Collection> {
  return (await getFridayDb()).collection("history");
}

async function tasksCol(): Promise<Collection> {
  return (await getFridayDb()).collection("tasks");
}

async function feedbackCol(): Promise<Collection> {
  return (await getFridayDb()).collection("feedback");
}

// ── Facts (per user) ────────────────────────────────────────────────────────

export async function readMemory(userId: string): Promise<Memory> {
  try {
    const col = await factsCol();
    const doc = await col.findOne<{ facts: string[] }>({ _id: userId as unknown as undefined });
    return { facts: Array.isArray(doc?.facts) ? doc!.facts : [] };
  } catch {
    return { facts: [] };
  }
}

export async function rememberFact(fact: string, userId: string): Promise<void> {
  const trimmed = fact.trim();
  if (!trimmed) return;
  const col = await factsCol();
  await col.updateOne(
    { _id: userId as unknown as undefined },
    { $addToSet: { facts: trimmed } },
    { upsert: true },
  );
}

export async function forgetFact(fact: string, userId: string): Promise<boolean> {
  const col = await factsCol();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await col.updateOne(
    { _id: userId as unknown as undefined },
    { $pull: { facts: fact } } as any,
  );
  return (res.modifiedCount ?? 0) > 0;
}

// ── Tasks (per user) ────────────────────────────────────────────────────────

export async function saveTask(
  userId: string,
  content: string,
  status: TaskStatus,
  scheduledAt?: string,
  weekdays?: string[],
  category?: string,
  priority = 5,
): Promise<string> {
  const col = await tasksCol();
  const now = new Date();
  const result = await col.insertOne({
    userId,
    content: content.trim(),
    status,
    scheduledAt: scheduledAt ?? null,
    weekdays: weekdays && weekdays.length > 0 ? weekdays : null,
    category: category?.trim() || null,
    priority: Math.min(10, Math.max(1, priority)),
    createdAt: now,
    updatedAt: now,
  });
  return result.insertedId.toString();
}

export async function updateTask(
  userId: string,
  taskId: string,
  fields: {
    status?: TaskStatus;
    scheduledAt?: string;
    weekdays?: string[];
    category?: string;
    priority?: number;
  },
): Promise<boolean> {
  const col = await tasksCol();
  let oid: ObjectId;
  try { oid = new ObjectId(taskId); } catch { return false; }
  const $set: Record<string, unknown> = { updatedAt: new Date() };
  if (fields.status !== undefined)     $set.status = fields.status;
  if ("scheduledAt" in fields)         $set.scheduledAt = fields.scheduledAt ?? null;
  if ("weekdays" in fields)            $set.weekdays = fields.weekdays && fields.weekdays.length > 0 ? fields.weekdays : null;
  if ("category" in fields)            $set.category = fields.category?.trim() || null;
  if (fields.priority !== undefined)   $set.priority = Math.min(10, Math.max(1, fields.priority));
  const res = await col.updateOne({ _id: oid, userId }, { $set });
  return (res.modifiedCount ?? 0) > 0;
}

export async function saveFeedback(userId: string, type: FeedbackType, message: string): Promise<void> {
  const col = await feedbackCol();
  await col.insertOne({ userId, type, message: message.trim(), createdAt: new Date() });
}

export async function deleteTask(userId: string, taskId: string): Promise<boolean> {
  const col = await tasksCol();
  let oid: ObjectId;
  try { oid = new ObjectId(taskId); } catch { return false; }
  const res = await col.deleteOne({ _id: oid, userId });
  return (res.deletedCount ?? 0) > 0;
}

export async function loadActiveTasks(userId: string): Promise<Task[]> {
  const col = await tasksCol();
  const docs = await col
    .find({ userId, status: { $in: ["doing", "planned", "scheduled"] } })
    .sort({ priority: -1, createdAt: 1 })
    .toArray();
  return docs.map((d) => ({ ...d, _id: d._id.toString() })) as Task[];
}

export async function listTasks(userId: string, status?: TaskStatus | "all"): Promise<Task[]> {
  const col = await tasksCol();
  const filter: Record<string, unknown> = { userId };
  if (status && status !== "all") filter.status = status;
  const docs = await col.find(filter).sort({ priority: -1, createdAt: -1 }).toArray();
  return docs.map((d) => ({ ...d, _id: d._id.toString() })) as Task[];
}

// ── Chat history (per user) ─────────────────────────────────────────────────

export async function appendHistory(messages: Omit<ChatMessage, "userId">[], userId: string): Promise<void> {
  if (messages.length === 0) return;
  try {
    const col = await historyCol();
    await col.insertMany(messages.map((m) => ({ ...m, userId })));
  } catch {
    // Non-fatal
  }
}

export async function loadHistory(userId: string, limit = 40): Promise<ChatMessage[]> {
  try {
    const col = await historyCol();
    const docs = await col
      .find<ChatMessage>({ userId })
      .sort({ ts: -1 })
      .limit(limit)
      .toArray();
    return docs.reverse();
  } catch {
    return [];
  }
}
