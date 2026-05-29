import { loadHistory } from "@/lib/memory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const userId = req.headers.get("x-user-id") ?? "anonymous";
  try {
    const messages = await loadHistory(userId, 20);
    return Response.json({ messages });
  } catch (err) {
    return Response.json({ messages: [], error: String(err) });
  }
}
