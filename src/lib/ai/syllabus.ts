/**
 * Syllabus extraction with a fast, cheap model (Google Gemini Flash-Lite).
 *
 * Syllabus documents are usually notices: headers, session/batch details, test
 * dates, timings, instructions — and somewhere in there, the actual syllabus,
 * often as a table whose subject label sits in the middle of wrapped chapter lists.
 * Rules can't reliably tell those apart; a small LLM can, for a fraction of a cent.
 *
 * Shared by the Next.js server route and the standalone build (browser + user key).
 * Output is a draft: the student reviews every row before anything is saved.
 */
import { AiError, parseJsonReply, type JsonCaller } from "./gemini";

export { describeAiError } from "./gemini";
/** Syllabus notices are short; cap input so a wrong file can't run up a bill. */
export const SYLLABUS_MAX_CHARS = 60_000;

export interface SyllabusExamInfo {
  name: string | null;
  date: string | null;
  pattern: string | null;
  durationMinutes: number | null;
}

export interface SyllabusExtraction {
  topics: { subject: string; chapter: string; topic: string }[];
  ignored: string[];
  examInfo: SyllabusExamInfo;
  model: string;
}

const SYSTEM = `You extract the syllabus from text copied out of a school or coaching-institute document (test notice, syllabus PDF, timetable).

Most of the text is usually NOT syllabus: institute and course headers, session, batch or phase details, test names, dates, timings, mode, venue, instructions, notes, signatures. Report those lines in "ignored" and never turn them into topics.

The syllabus itself is often a table: subject | chapter names. Text extraction flattens tables, so a subject name can appear in the middle of its own wrapped chapter list (chapters printed above and below the subject label belong to that subject), and one chapter name can be split across lines ("FORCE AND" / "LAWS OF MOTION" is one chapter; "INTEGRAL" / "CALCULUS" may be one chapter split around a subject label). Rejoin such fragments.

Rules:
- Only include chapters/topics that are actually in the text. Never add chapters that are not listed.
- Use one of the student's subjects when it matches (e.g. "MATHS" -> "Mathematics").
- When only chapter names are listed, set topic equal to chapter. When a chapter lists sub-topics, emit one row per sub-topic.
- Convert ALL-CAPS names to normal title case ("MOTION UNDER GRAVITY" -> "Motion Under Gravity"; keep acronyms and "&").
- exam_info: fill from the document if present (date as YYYY-MM-DD; duration in minutes from the timing if you can compute it — a timing like "9:00 AM TO 12:00 AM" means 9 AM to 12 noon), otherwise null.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["topics", "ignored", "exam_info"],
  properties: {
    topics: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["subject", "chapter", "topic"],
        properties: { subject: { type: "string" }, chapter: { type: "string" }, topic: { type: "string" } },
      },
    },
    ignored: { type: "array", items: { type: "string" } },
    exam_info: {
      type: "object",
      additionalProperties: false,
      required: ["name", "date", "pattern", "duration_minutes"],
      properties: {
        name: { type: ["string", "null"] },
        date: { type: ["string", "null"] },
        pattern: { type: ["string", "null"] },
        duration_minutes: { type: ["integer", "null"] },
      },
    },
  },
} as const;

function userMessage(text: string, subjects: string[]) {
  return `The student's subjects: ${subjects.length ? subjects.join(", ") : "unknown"}\n\n<document>\n${text}\n</document>`;
}

function parse(raw: unknown, model: string): SyllabusExtraction {
  const r = raw as { topics?: unknown; ignored?: unknown; exam_info?: Record<string, unknown> };
  if (!r || !Array.isArray(r.topics)) throw new Error("Unexpected AI response");
  const clean = (s: unknown) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "");
  const seen = new Set<string>();
  const topics = r.topics
    .map((t) => {
      const x = t as Record<string, unknown>;
      const chapter = clean(x.chapter);
      return { subject: clean(x.subject) || "General", chapter, topic: clean(x.topic) || chapter };
    })
    .filter((t) => t.chapter && t.topic)
    .filter((t) => {
      const k = `${t.subject}|${t.chapter}|${t.topic}`.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  const info = r.exam_info ?? {};
  const date = typeof info.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(info.date) ? info.date : null;
  const dur = typeof info.duration_minutes === "number" && info.duration_minutes > 0 && info.duration_minutes <= 720 ? Math.round(info.duration_minutes) : null;
  return {
    topics,
    ignored: Array.isArray(r.ignored) ? r.ignored.map(clean).filter(Boolean).slice(0, 40) : [],
    examInfo: { name: clean(info.name) || null, date, pattern: clean(info.pattern) || null, durationMinutes: dur },
    model,
  };
}

/** Runs the extraction. The caller handles the API (Gemini in the app, a fake in tests). */
export async function extractSyllabusWithAI(call: JsonCaller, text: string, subjects: string[]): Promise<SyllabusExtraction> {
  const doc = text.trim();
  if (!doc) throw new Error("No text to read.");
  if (doc.length > SYLLABUS_MAX_CHARS) throw new Error("This document is too long to be a syllabus. Upload just the syllabus pages.");
  try {
    const reply = await call({ system: SYSTEM, user: userMessage(doc, subjects), schema: SCHEMA, name: "syllabus", maxTokens: 8000 });
    return parse(parseJsonReply(reply.text), reply.model);
  } catch (e) {
    if (e instanceof AiError && e.kind === "too_long") throw new AiError("too_long", "The syllabus was too long for one pass. Upload fewer pages.");
    if (e instanceof Error && e.message === "Unexpected AI response") throw new AiError("unreadable", "The AI response couldn't be read.");
    throw e;
  }
}
