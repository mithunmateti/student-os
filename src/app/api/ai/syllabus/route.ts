/** Server-side syllabus extraction with Gemini (uses GEMINI_API_KEY on the server). */
import { AiError, describeAiError, geminiCaller } from "@/lib/ai/gemini";
import { guardAiRequest, readJsonCapped, TooLarge } from "@/lib/ai/guard";
import { extractSyllabusWithAI, SYLLABUS_MAX_CHARS } from "@/lib/ai/syllabus";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return Response.json({ error: "AI extraction is not configured on this server." }, { status: 503 });
  const refused = guardAiRequest(req);
  if (refused) return refused;
  let body: { text?: unknown; subjects?: unknown };
  try {
    body = (await readJsonCapped(req, SYLLABUS_MAX_CHARS * 4 + 16_000)) as typeof body;
    if (!body || typeof body !== "object") throw new Error();
  } catch (e) {
    return e instanceof TooLarge
      ? Response.json({ error: "This document is too long to be a syllabus." }, { status: 413 })
      : Response.json({ error: "Invalid request." }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text : "";
  const subjects = Array.isArray(body.subjects) ? body.subjects.filter((s): s is string => typeof s === "string").slice(0, 12) : [];
  if (!text.trim()) return Response.json({ error: "No text to read." }, { status: 400 });
  if (text.length > SYLLABUS_MAX_CHARS) return Response.json({ error: "This document is too long to be a syllabus." }, { status: 413 });
  try {
    const result = await extractSyllabusWithAI(geminiCaller(apiKey), text, subjects);
    return Response.json({ result });
  } catch (e) {
    return Response.json({ error: describeAiError(e) }, { status: e instanceof AiError && (e.kind === "auth" || e.kind === "server" || e.kind === "network") ? 502 : 422 });
  }
}
