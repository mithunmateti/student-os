/**
 * Optional AI adapter: structures messy extracted paper/key text with Google Gemini.
 *
 * - Disabled unless GEMINI_API_KEY is set on the server.
 * - The student must opt in per import; the UI says the text is sent to Google.
 * - Output is only a *draft*: it goes through the same review table, never straight to scoring.
 * - Uploaded document text is never logged.
 */
import { AiError, describeAiError, geminiCaller } from "@/lib/ai/gemini";
import { guardAiRequest, readJsonCapped, TooLarge } from "@/lib/ai/guard";
import { PAPER_MAX_CHARS, structurePaperWithAI } from "@/lib/ai/paper";

export const runtime = "nodejs";
export const maxDuration = 300;

const serverKey = () => process.env.GEMINI_API_KEY || "";

export async function GET() {
  return Response.json({ enabled: !!serverKey() });
}

export async function POST(req: Request) {
  if (!serverKey()) return Response.json({ error: "AI extraction is not configured on this server." }, { status: 503 });
  const refused = guardAiRequest(req);
  if (refused) return refused;
  let body: { paperText?: unknown; keyText?: unknown; subjects?: unknown };
  try {
    body = (await readJsonCapped(req, PAPER_MAX_CHARS * 4 + 64_000)) as typeof body;
    if (!body || typeof body !== "object") throw new Error();
  } catch (e) {
    return e instanceof TooLarge
      ? Response.json({ error: "This paper is too long to structure in one go." }, { status: 413 })
      : Response.json({ error: "Invalid request." }, { status: 400 });
  }
  const paper = typeof body.paperText === "string" ? body.paperText : "";
  const key = typeof body.keyText === "string" ? body.keyText : "";
  const subjects = Array.isArray(body.subjects) ? body.subjects.filter((s): s is string => typeof s === "string").slice(0, 12) : [];
  if (!paper.trim()) return Response.json({ error: "No paper text to structure." }, { status: 400 });
  if (paper.length + key.length > PAPER_MAX_CHARS) return Response.json({ error: "This paper is too long to structure in one go. Split it into sections, or use the built-in parser." }, { status: 413 });

  try {
    const r = await structurePaperWithAI(geminiCaller(serverKey()), paper, key, subjects);
    return Response.json({ result: r.result, model: r.model, chunks: r.chunks });
  } catch (e) {
    const status = e instanceof AiError ? (e.kind === "rate" ? 429 : e.kind === "auth" || e.kind === "server" || e.kind === "network" ? 502 : 422) : 500;
    return Response.json({ error: describeAiError(e) }, { status });
  }
}
