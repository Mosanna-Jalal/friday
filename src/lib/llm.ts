import OpenAI from "openai";

const OPENAI_KEY = process.env.OPENAI_API_KEY?.trim();
const GEMINI_KEY = process.env.GEMINI_API_KEY?.trim();
const GROQ_KEY = process.env.GROQ_API_KEY?.trim();

// Priority: OpenAI → Gemini → Groq
const provider = GEMINI_KEY ? "gemini" : OPENAI_KEY ? "openai" : "groq";

export const API_KEY =
  provider === "gemini" ? GEMINI_KEY :
  provider === "openai" ? OPENAI_KEY :
  GROQ_KEY;

export const MODEL =
  provider === "gemini" ? "gemini-2.5-flash" :
  provider === "openai" ? (process.env.OPENAI_MODEL || "gpt-4o-mini") :
  "llama-3.3-70b-versatile";

const BASE_URL =
  provider === "gemini" ? "https://generativelanguage.googleapis.com/v1beta/openai/" :
  provider === "groq"   ? "https://api.groq.com/openai/v1" :
  undefined;

export function createOpenAIClient() {
  return new OpenAI({ apiKey: API_KEY, baseURL: BASE_URL });
}
