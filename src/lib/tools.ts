import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { rememberFact, forgetFact, readMemory, saveTask, listTasks, updateTask, deleteTask, type TaskStatus } from "./memory";
import { listCollections, queryCollection, aggregateCollection, type DbAlias } from "./db";

export const openaiTools: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Search the web for real-time information: news, current events, prices, sports scores, anything that changes. Use when the boss asks about something recent or you don't have up-to-date knowledge.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query, e.g. 'latest news Iran May 2026'.",
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_db_collections",
      description:
        "List all collections in one of the GBM MongoDB databases. Call this first when the boss asks about college data so you know what collections exist before querying. Databases: alumni (alumni profiles/batch info), attendance (student attendance graph data), fest (GBM Fest 2026 registrations/events), internal (internal tools/test data).",
      parameters: {
        type: "object",
        properties: {
          database: {
            type: "string",
            enum: ["alumni", "attendance", "fest", "internal"],
            description: "Which GBM database to inspect.",
          },
        },
        required: ["database"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_database",
      description:
        "Query a collection in one of the GBM MongoDB databases. Use list_db_collections first if unsure of collection names. Returns up to `limit` documents matching `filter` (MongoDB query syntax). Use an empty filter {} to get a sample of all documents.",
      parameters: {
        type: "object",
        properties: {
          database: {
            type: "string",
            enum: ["alumni", "attendance", "fest", "internal"],
            description: "Which GBM database to query.",
          },
          collection: {
            type: "string",
            description: "Collection name inside that database.",
          },
          filter: {
            type: "object",
            description: "MongoDB filter object, e.g. {\"batch\": \"2023\"} or {} for all.",
          },
          limit: {
            type: "number",
            description: "Max documents to return (default 10, max 50).",
          },
        },
        required: ["database", "collection"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "aggregate_database",
      description:
        "Run a MongoDB aggregation pipeline on a GBM database collection. Use this instead of query_database whenever you need to group, average, sum, sort, or rank data — e.g. best department by attendance, total students per course, monthly trends. Always prefer this for any analytical question.",
      parameters: {
        type: "object",
        properties: {
          database: {
            type: "string",
            enum: ["alumni", "attendance", "fest", "internal"],
            description: "Which GBM database to query.",
          },
          collection: {
            type: "string",
            description: "Collection name inside that database.",
          },
          pipeline: {
            type: "array",
            description:
              "MongoDB aggregation pipeline stages as an array of objects. e.g. [{\"$match\":{\"monthKey\":\"2026-03\"}},{\"$group\":{\"_id\":\"$department\",\"avg\":{\"$avg\":\"$percentage\"}}},{\"$sort\":{\"avg\":-1}}]",
            items: { type: "object" },
          },
        },
        required: ["database", "collection", "pipeline"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_current_time",
      description:
        "Get the current local date and time. Use when the boss asks what time it is, today's date, day of week, etc.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "get_weather",
      description:
        "Get the current weather for a city. Returns temperature in Celsius, humidity, wind, and conditions.",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string", description: "City name, e.g. 'San Francisco'." },
        },
        required: ["city"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remember_fact",
      description:
        "Save a durable fact about the boss (name, role, location, preferences, projects, etc.) to long-term memory. Only for genuinely durable info you'd want to remember in future conversations. Never for ephemeral context.",
      parameters: {
        type: "object",
        properties: {
          fact: {
            type: "string",
            description:
              "A single self-contained sentence stating the fact. e.g. 'The boss prefers TypeScript over Python.'",
          },
        },
        required: ["fact"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "recall_facts",
      description:
        "List every fact you've stored in long-term memory about the boss. Use when asked what you remember, or when you need to ground a response in their preferences.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "forget_fact",
      description:
        "Remove a fact from long-term memory. Pass the exact fact string from recall_facts.",
      parameters: {
        type: "object",
        properties: {
          fact: { type: "string" },
        },
        required: ["fact"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_task",
      description:
        "Save a task, goal, or item to the boss's task list with a status tag. Use when they mention something they need to do, are doing, have done, or want to schedule.",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string", description: "The task description." },
          status: {
            type: "string",
            enum: ["done", "doing", "planned", "scheduled"],
            description: "'done'=completed, 'doing'=in progress now, 'planned'=will do (no fixed time), 'scheduled'=has a specific date/time.",
          },
          scheduledAt: {
            type: "string",
            description: "ISO date-time string for scheduled tasks, e.g. '2026-06-01T10:00:00'. Only for status=scheduled.",
          },
        },
        required: ["content", "status"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_tasks",
      description:
        "List the boss's tasks. Filter by status or pass 'all' to see everything.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["all", "done", "doing", "planned", "scheduled"],
          },
        },
        required: ["status"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_task",
      description:
        "Update the status of an existing task. Get the taskId from list_tasks first.",
      parameters: {
        type: "object",
        properties: {
          taskId: { type: "string", description: "The task _id from list_tasks." },
          status: {
            type: "string",
            enum: ["done", "doing", "planned", "scheduled"],
          },
          scheduledAt: {
            type: "string",
            description: "New ISO date-time for scheduled tasks. Optional.",
          },
        },
        required: ["taskId", "status"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_task",
      description: "Permanently delete a task by its ID.",
      parameters: {
        type: "object",
        properties: {
          taskId: { type: "string" },
        },
        required: ["taskId"],
        additionalProperties: false,
      },
    },
  },
];

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  userId = "anonymous",
): Promise<string> {
  switch (name) {
    case "web_search":
      return searchWeb(String(input.query ?? ""));

    case "list_db_collections": {
      const db = String(input.database ?? "") as DbAlias;
      const cols = await listCollections(db);
      return cols.length > 0
        ? `Collections in "${db}": ${cols.join(", ")}`
        : `No collections found in "${db}".`;
    }

    case "aggregate_database": {
      const db = String(input.database ?? "") as DbAlias;
      const col = String(input.collection ?? "");
      const pipeline = input.pipeline as Record<string, unknown>[];
      if (!Array.isArray(pipeline)) return "pipeline must be an array of stage objects.";
      const docs = await aggregateCollection(db, col, pipeline);
      if (docs.length === 0) return "No results from aggregation.";
      return JSON.stringify(docs, null, 2);
    }

    case "query_database": {
      const db = String(input.database ?? "") as DbAlias;
      const col = String(input.collection ?? "");
      const filter = (input.filter as Record<string, unknown>) ?? {};
      const limit = Math.min(Number(input.limit ?? 10), 50);
      const docs = await queryCollection(db, col, filter, limit);
      if (docs.length === 0) return "No documents matched that filter.";
      return JSON.stringify(docs, null, 2);
    }

    case "get_current_time":
      return new Date().toString();

    case "get_weather":
      return getWeather(String(input.city ?? ""));

    case "remember_fact": {
      const fact = String(input.fact ?? "").trim();
      if (!fact) return "No fact provided.";
      await rememberFact(fact, userId);
      return `Saved to memory: "${fact}"`;
    }

    case "recall_facts": {
      const m = await readMemory(userId);
      if (m.facts.length === 0) return "(no facts stored yet)";
      return m.facts.map((f, i) => `${i + 1}. ${f}`).join("\n");
    }

    case "forget_fact": {
      const fact = String(input.fact ?? "").trim();
      const removed = await forgetFact(fact, userId);
      return removed ? `Forgot: "${fact}"` : `No matching fact to forget.`;
    }

    case "save_task": {
      const content = String(input.content ?? "").trim();
      const status = String(input.status ?? "") as TaskStatus;
      const scheduledAt = input.scheduledAt ? String(input.scheduledAt) : undefined;
      if (!content) return "No task content provided.";
      const id = await saveTask(userId, content, status, scheduledAt);
      return `Task saved (id: ${id}): [${status.toUpperCase()}] ${content}${scheduledAt ? ` — scheduled for ${scheduledAt}` : ""}`;
    }

    case "list_tasks": {
      const status = String(input.status ?? "all") as TaskStatus | "all";
      const tasks = await listTasks(userId, status);
      if (tasks.length === 0) return status === "all" ? "No tasks yet." : `No tasks with status "${status}".`;
      return tasks
        .map((t) => `[${t.status.toUpperCase()}] ${t.content}${t.scheduledAt ? ` (scheduled: ${t.scheduledAt})` : ""} — id: ${t._id}`)
        .join("\n");
    }

    case "update_task": {
      const taskId = String(input.taskId ?? "");
      const status = String(input.status ?? "") as TaskStatus;
      const scheduledAt = input.scheduledAt ? String(input.scheduledAt) : undefined;
      const ok = await updateTask(userId, taskId, { status, scheduledAt });
      return ok ? `Task updated to [${status.toUpperCase()}].` : "Task not found.";
    }

    case "delete_task": {
      const taskId = String(input.taskId ?? "");
      const ok = await deleteTask(userId, taskId);
      return ok ? "Task deleted." : "Task not found.";
    }

    default:
      return `Unknown tool: ${name}`;
  }
}

async function getWeather(city: string): Promise<string> {
  if (!city) return "City name is required.";
  try {
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`,
    );
    const geo = await geoRes.json();
    const place = geo?.results?.[0];
    if (!place) return `Could not find a location matching "${city}".`;

    const { latitude, longitude, name, country, timezone } = place;
    const wRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m&timezone=${encodeURIComponent(timezone ?? "auto")}`,
    );
    const w = await wRes.json();
    const c = w?.current;
    if (!c) return `Got the location but the forecast was empty.`;

    return [
      `${name}, ${country}`,
      `Temp: ${c.temperature_2m}°C (feels ${c.apparent_temperature}°C)`,
      `Humidity: ${c.relative_humidity_2m}%`,
      `Wind: ${c.wind_speed_10m} km/h`,
      `Conditions: ${describeWeather(c.weather_code)}`,
    ].join(" | ");
  } catch (err) {
    return `Weather lookup failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function searchWeb(query: string): Promise<string> {
  if (!query) return "No search query provided.";
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return "TAVILY_API_KEY is not set. Add it to .env.local and restart.";
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "basic",
        max_results: 5,
        include_answer: true,
      }),
    });
    if (!res.ok) return `Search failed: HTTP ${res.status}`;
    const data = await res.json();
    const lines: string[] = [];
    if (data.answer) lines.push(`Summary: ${data.answer}`);
    if (Array.isArray(data.results)) {
      for (const r of data.results.slice(0, 5)) {
        lines.push(`• ${r.title} — ${r.url}\n  ${r.content?.slice(0, 200) ?? ""}`);
      }
    }
    return lines.length > 0 ? lines.join("\n\n") : "No results found.";
  } catch (err) {
    return `Search failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function describeWeather(code: number): string {
  const map: Record<number, string> = {
    0: "clear",
    1: "mostly clear",
    2: "partly cloudy",
    3: "overcast",
    45: "fog",
    48: "rime fog",
    51: "light drizzle",
    53: "drizzle",
    55: "heavy drizzle",
    61: "light rain",
    63: "rain",
    65: "heavy rain",
    71: "light snow",
    73: "snow",
    75: "heavy snow",
    80: "light showers",
    81: "showers",
    82: "violent showers",
    95: "thunderstorm",
    96: "thunderstorm with hail",
    99: "severe thunderstorm",
  };
  return map[code] ?? "unknown";
}
