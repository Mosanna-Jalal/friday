import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { API_KEY, createOpenAIClient, MODEL } from "@/lib/llm";
import { openaiTools, executeTool } from "@/lib/tools";
import { readMemory, appendHistory, loadActiveTasks } from "@/lib/memory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM_BASE = `You are FRIDAY, a personal AI assistant in the spirit of Tony Stark's FRIDAY from the Iron Man / Avengers universe.

Voice & manner:
- Warm, dry, lightly witty. Never sycophantic.
- Address the user as "boss" by default, or by their name if you've learned it.
- Concise. Don't pad. One or two sentences is usually enough; longer only when the question demands it.
- When you don't know something, say so plainly.

You have tools for the current time, weather, web search, long-term memory, and direct access to the boss's college product databases. Use them when they'd actually help; don't narrate that you're "going to use a tool" — just use it and answer.

GBM college databases — query these for any college-related question. Schema is exact; use fields exactly as shown.

━━ DB: alumni ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Collection: alumnisubmissions (23 docs)
Fields: name, dateOfBirth, motherName, fatherName,
  className ("B.A." | "B.Com" | "B.Sc"),
  honsMajorSubject, session ("2019-2022" format),
  occupation, email, whatsapp, presentAddress, achievements, createdAt
Use for: alumni profiles, batch lookups, occupation stats.
Example filter — alumni from 2019-2022: { "session": "2019-2022" }

━━ DB: attendance ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Collection: admissions (38 docs) — enrollment HEAD COUNTs per semester
Fields: session ("2023-27" | "2024-28" | "2025-29"), semester (1–6),
  stream ("B.A" | "B.Com" | "B.Sc"), count (number of enrolled students)
Use for: "how many students enrolled in B.Com 2023-27" → filter { "stream": "B.Com", "session": "2023-27" }, sum the count fields across semesters or pick specific semester.
IMPORTANT: stream values are "B.A" (no dot), "B.Com", "B.Sc" — match exactly.

Collection: attendances (269 docs) — monthly class attendance by teacher
Fields: teacherName, department (ALL CAPS), faculty (ALL CAPS), session, semester,
  monthKey ("YYYY-MM" format e.g. "2026-03" for March 2026),
  percentage (0–100), distinctionStudents (array of names)
CRITICAL — department values are ALWAYS ALL CAPS. Use exactly:
  "BOTANY","CHEMISTRY","ECONOMICS","ENGLISH","HINDI","HISTORY",
  "HOME SCIENCE","LIBRARY SCIENCE","MATHEMATICS","PHILOSOPHY",
  "PHYSICS","POLITICAL SCIENCE","PSYCHOLOGY","URDU","ZOOLOGY"
Faculty values: "ARTS" | "SCIENCE" | "BLIS"
Sessions in this collection: "2023-27","2024-28","2025-26","2025-29"
monthKey = "YYYY-MM" — convert natural language: "March 2026" → "2026-03"
Use for: teacher-wise attendance %, department stats, monthly trends.

Collection: gateentries (73 docs) — daily college gate entry counts
Fields: dateKey ("2026-02-17" format), count (students who entered), note
Use for: footfall on a specific date, busiest days.

━━ DB: fest ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Collection: passes (245 docs) — fest passes issued to students
Fields: serialNo, name, classRoll ("4th Sem / 182" format),
  passNumbers (array of pass number strings e.g. "0163"), phoneNo, notes, source

Collection: students (165 docs) — students registered for the fest
Fields: serialNo, name, classRoll, passNumbers (array), phoneNo

Collection: entries (439 docs) — actual gate scan log on fest day
Fields: passNo, studentName, phoneNo, classRoll,
  action ("ENTRY"), festDay ("2026-04-06" format), operatorUsername
Use for: how many entered on a specific day, who attended.

Collection: admins (4 docs) — fest gate operators (username, displayName)

━━ DB: internal ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Collection: students (2996 docs) — full enrolled student master list
Fields: rollNumber, name, fatherName, gender, mobile,
  course ("B.A" | "B.Com" | "B.Sc"), department, category,
  session ("2025-29" format)
  extras: { motherName, "university reg no", "minor subject", email, address, etc. }
Use for: individual student lookups, course/session counts, department-wise stats.
Example — B.Com 2023-27 count: { "course": "B.Com", "session": "2023-27" }

Collection: tests (5 docs) — MCQ online tests
Fields: title, subject, paper, course, session, semester,
  questions (array), totalMarks, duration, startTime, endTime,
  createdBy, isPublished, isResultPublished

Collection: studentattempts (8 docs) — student test submissions
Fields: testId (ObjectId — NEVER filter this as a string), studentName, rollNumber,
  course, session, semester, score, maxScore,
  percentage (already computed: score/maxScore×100), rank, submittedAt, timeTaken
CRITICAL: testId is a MongoDB ObjectId. You CANNOT filter studentattempts by testId
using query_database — use aggregate_database with $lookup instead.

PASS/FAIL query — use aggregate_database on internal→studentattempts:
pipeline: [
  {"$lookup":{"from":"tests","localField":"testId","foreignField":"_id","as":"test"}},
  {"$unwind":{"path":"$test","preserveNullAndEmptyArrays":true}},
  {"$addFields":{"result":{"$cond":[{"$gte":["$percentage",THRESHOLD]},"PASS","FAIL"]}}},
  {"$project":{"studentName":1,"rollNumber":1,"percentage":1,"score":1,"maxScore":1,"result":1,"testTitle":"$test.title","subject":"$test.subject"}},
  {"$sort":{"result":1,"percentage":-1}}
]
Replace THRESHOLD with the actual number (e.g. 35).
To get ALL attempts without test join: query_database internal→studentattempts filter={} limit=50

Collection: questions (2 docs) — MCQ question bank
Fields: subject, course, session, semester, text, options (array),
  correctIndex, marks, negMarks, difficulty, createdBy

Collection: paper (13 docs) — paper/subject codes
Fields: name (paper code e.g. "MJC-7"), department

━━ GBM DATA METHODOLOGY ━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SESSIONS & SEMESTERS
- Academic year starts in June. Sessions like "2023-27" = 4-year UG programme.
- Semester auto-calc: semester = 2 × year_index + (month ≥ 6 ? 1 : 2)
  e.g. January 2026 for session 2023-27 → year_index=2, semester=5 (Sem V)
- "2025-26" is reserved for BLIS only (1-year, 2-semester). B.A/B.Com/B.Sc do not use it.

ADMISSIONS (attendance→admissions) — ENROLLMENT PROGRESSION
- Each row = (session, stream, semester) → count. NOT cumulative — each row is how many
  students were on roll at that specific semester.
- Falling counts = attrition (students dropped out), NOT new admissions.
- "Currently on roll" = take the HIGHEST semester recorded per stream for a session,
  sum across streams. e.g. 2023-27: B.A=866 (Sem VI) + B.Sc=511 (Sem VI) + B.Com=7 (Sem VI) = 1,384.
- Attrition rate: drop = count(sem_i) − count(sem_i+1); pct = drop/count(sem_i) × 100

CLASS ATTENDANCE (attendance→attendances)
- Each row = one teacher's dept attendance for one month.
- Dept average for a month = arithmetic mean of all submissions for that (dept, month).
- Institution overall avg = sum of ALL individual submissions ÷ total count (not dept-weighted).
- Missing data = no submission that month, NOT zero. Never treat absent data as 0%.
- Dept ranking score = mean of all filtered submissions for that dept across all months.
- ALWAYS use ALL CAPS for department names in filters (e.g. "ZOOLOGY" not "Zoology").
- ALWAYS convert month names to "YYYY-MM" format for monthKey (March 2026 → "2026-03").

GATE ENTRIES (attendance→gateentries)
- Each row = daily student footfall count at college gate.
- Daily avg = Σ all counts ÷ number of days recorded.
- Weekday avg = Σ counts on that weekday ÷ days recorded for that weekday (zero-count days excluded).
- Monthly total = sum of all daily counts in that calendar month.

FEST (fest→entries / fest→passes / fest→students)
- passes = passes issued before the fest. students = registered students.
- entries = actual gate scans on fest day (action: "ENTRY").
- To find attendance on a specific day: filter entries by festDay.

INTERNAL STUDENTS (internal→students)
- 2996 individual student records. Use for name lookup, dept counts, course-wise totals.
- course field: "B.A", "B.Com", "B.Sc" (exact, no dots on B.A and B.Sc except B.Com).
- extras field has: motherName, university reg no, minor subject, email, etc.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STRICT RULES:
1. Never guess or fabricate GBM data. Always query first, answer after.
2. Use field names exactly as shown — wrong field names return empty results.
3. For enrollment counts: attendance→admissions. For individual records: internal→students.
4. Go straight to the tool — you already know the schema, skip list_db_collections.
5. When summing enrollment, use the LATEST semester per stream, never add all semesters together.
6. CRITICAL — for ANY ranking, averaging, grouping, or "best/worst/top/total" question:
   use aggregate_database with a proper $match→$group→$sort pipeline.
   NEVER use query_database and guess from partial results — it only returns up to 50 docs
   and you will miss data. Example for best dept in March 2026:
   pipeline: [{"$match":{"monthKey":"2026-03"}},{"$group":{"_id":"$department","avg":{"$avg":"$percentage"}}},{"$sort":{"avg":-1}}]

When you learn something durable about the boss (name, role, location, preferences, ongoing projects), proactively save it via remember_fact so future you can pick up where this you left off.`;

type ChatRequestBody = {
  messages: { role: "user" | "assistant"; content: string }[];
  selectedDb?: string;
  noPersist?: boolean; // if true, don't save to chat history
};

export async function POST(req: Request) {
  let body: ChatRequestBody;
  try {
    body = (await req.json()) as ChatRequestBody;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // Identity injected by middleware
  const userId = req.headers.get("x-user-id") ?? "anonymous";
  const userRole = req.headers.get("x-user-role") ?? "user";
  const isAdmin = userRole === "admin";

  const encoder = new TextEncoder();

  if (!API_KEY) {
    return new Response(
      `data: ${JSON.stringify({
        type: "error",
        message:
          "No AI key is set. Add OPENAI_API_KEY for OpenAI, or GROQ_API_KEY plus OPENAI_BASE_URL for Groq, then restart npm run dev.",
      })}\n\n`,
      {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
        },
      },
    );
  }

  if (API_KEY.startsWith("sk-ant-")) {
    return new Response(
      `data: ${JSON.stringify({
        type: "error",
        message: "That looks like an Anthropic key. Add your OpenAI key as OPENAI_API_KEY in .env.local and restart.",
      })}\n\n`,
      { status: 200, headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } },
    );
  }

  const openai = createOpenAIClient();

  const [memory, activeTasks] = await Promise.all([
    readMemory(userId),
    loadActiveTasks(userId),
  ]);

  const memoryBlock =
    memory.facts.length > 0
      ? `\n\n--- What you know about the boss ---\n${memory.facts.map((f) => `- ${f}`).join("\n")}`
      : "";

  const STATUS_LABEL: Record<string, string> = { doing: "DOING", planned: "PLANNED", scheduled: "SCHEDULED" };
  const tasksBlock =
    activeTasks.length > 0
      ? `\n\n--- Boss's active tasks ---\n${activeTasks.map((t) => `[${STATUS_LABEL[t.status] ?? t.status}] ${t.content}${t.scheduledAt ? ` (at ${t.scheduledAt})` : ""}`).join("\n")}\nUse this to give contextual answers about what the boss is working on or has planned.`
      : "";

  const dbBlock =
    body.selectedDb && body.selectedDb !== "auto"
      ? `\n\n--- Active database selection ---\nThe boss has explicitly selected the "${body.selectedDb}" database. Query ONLY that database. Do not query others unless the boss says so.`
      : "";

  const roleBlock = !isAdmin
    ? `\n\n--- Access level ---\nThis user does not have admin access. Do NOT query any GBM college databases for them. If they ask about college data, politely tell them they need admin access.`
    : "";

  // Non-admin users don't get DB tools
  const DB_TOOLS = ["list_db_collections", "query_database", "aggregate_database"];
  const activeTools = isAdmin
    ? openaiTools
    : openaiTools.filter((t) =>
        t.type === "function" && !DB_TOOLS.includes(t.function.name)
      );

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_BASE + memoryBlock + tasksBlock + dbBlock + roleBlock },
    ...body.messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  // The user message just sent (for saving to history after reply)
  const newUserMsg = body.messages[body.messages.length - 1];

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
        );
      };

      let finalAssistantText = "";

      try {
        for (let step = 0; step < 8; step++) {
          const completion = await openai.chat.completions.create({
            model: MODEL,
            messages,
            tools: activeTools,
            stream: true,
          });

          let textAccum = "";
          const toolCallsAccum: { id: string; name: string; args: string }[] =
            [];
          let finishReason: string | null = null;

          for await (const chunk of completion) {
            const choice = chunk.choices[0];
            if (!choice) continue;
            const delta = choice.delta;

            if (delta?.content) {
              textAccum += delta.content;
              finalAssistantText += delta.content;
              send({ type: "text", text: delta.content });
            }

            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0;
                if (!toolCallsAccum[idx]) {
                  toolCallsAccum[idx] = { id: "", name: "", args: "" };
                }
                if (tc.id) toolCallsAccum[idx].id = tc.id;
                if (tc.function?.name)
                  toolCallsAccum[idx].name = tc.function.name;
                if (tc.function?.arguments)
                  toolCallsAccum[idx].args += tc.function.arguments;
              }
            }

            if (choice.finish_reason) finishReason = choice.finish_reason;
          }

          if (finishReason === "tool_calls" && toolCallsAccum.length > 0) {
            // Push assistant turn with tool_calls, then results, then loop
            messages.push({
              role: "assistant",
              content: textAccum || null,
              tool_calls: toolCallsAccum.map((tc) => ({
                id: tc.id,
                type: "function" as const,
                function: { name: tc.name, arguments: tc.args },
              })),
            });

            for (const tc of toolCallsAccum) {
              send({ type: "tool_use", name: tc.name });
              let input: Record<string, unknown> = {};
              try {
                input = tc.args ? JSON.parse(tc.args) : {};
              } catch {
                // leave empty
              }
              let result: string;
              try {
                result = await executeTool(tc.name, input, userId);
              } catch (err) {
                result = `Tool error: ${err instanceof Error ? err.message : String(err)}`;
              }
              send({ type: "tool_result", name: tc.name, result });
              messages.push({
                role: "tool",
                tool_call_id: tc.id,
                content: result,
              });
            }
            continue;
          }

          // Groq failed_generation: model couldn't form a valid tool call.
          // Retry once without tools so the boss still gets a plain answer.
          if (finishReason === "failed_generation" && step === 0) {
            const fallback = await openai.chat.completions.create({
              model: MODEL,
              messages,
              stream: false,
            });
            const content =
              fallback.choices[0]?.message?.content?.trim() ??
              "Hit a snag with my tools, boss. Try again.";
            finalAssistantText = content;
            send({ type: "text", text: content });
            send({ type: "done", finish_reason: "stop" });
            break;
          }

          // Anything else (stop, length, content_filter): we're done
          send({ type: "done", finish_reason: finishReason ?? "stop" });
          break;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Groq throws this when the model can't form a valid tool call.
        // Fall back to a plain (no-tools) completion so the boss gets an answer.
        if (msg.includes("failed_generation") || msg.includes("tool call validation failed")) {
          try {
            const fallback = await openai.chat.completions.create({
              model: MODEL,
              messages,
              stream: false,
            });
            const content =
              fallback.choices[0]?.message?.content?.trim() ??
              "Hit a snag with my tools, boss. Try again.";
            finalAssistantText = content;
            send({ type: "text", text: content });
            send({ type: "done", finish_reason: "stop" });
          } catch {
            finalAssistantText = "Hit a snag with my tools, boss. Try again.";
            send({ type: "text", text: finalAssistantText });
            send({ type: "done", finish_reason: "stop" });
          }
        } else {
          send({ type: "error", message: msg });
        }
      } finally {
        controller.close();
        // Persist the new exchange to MongoDB (best-effort, non-blocking)
        if (!body.noPersist && newUserMsg && finalAssistantText.trim()) {
          const now = Date.now();
          appendHistory([
            { role: newUserMsg.role, content: newUserMsg.content, ts: now },
            { role: "assistant", content: finalAssistantText.trim(), ts: now + 1 },
          ], userId).catch(() => {});
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
