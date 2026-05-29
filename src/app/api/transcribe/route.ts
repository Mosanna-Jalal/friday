export const runtime = "nodejs";

export async function POST(req: Request) {
  const apiKey = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "No API key configured for transcription." }, { status: 500 });
  }

  const isGroq = !!process.env.GROQ_API_KEY;
  const baseUrl = isGroq
    ? "https://api.groq.com/openai/v1"
    : "https://api.openai.com/v1";
  const model = isGroq ? "whisper-large-v3-turbo" : "whisper-1";

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return Response.json({ error: "Invalid form data." }, { status: 400 });
  }

  const audio = formData.get("audio") as File | null;
  if (!audio || audio.size < 100) {
    return Response.json({ text: "" });
  }

  const body = new FormData();
  body.append("file", audio, "audio.webm");
  body.append("model", model);
  body.append("language", "en");

  try {
    const res = await fetch(`${baseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body,
    });

    if (!res.ok) {
      const err = await res.text();
      return Response.json({ error: err }, { status: res.status });
    }

    const data = await res.json() as { text?: string };
    return Response.json({ text: data.text?.trim() ?? "" });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
