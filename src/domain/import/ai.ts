/**
 * Converts the optional AI extraction result into the same ParsedPaper shape the
 * built-in parser produces, plus per-question key data. Confidence is capped so
 * AI output is always reviewed like any other import.
 */
import type { QuestionType } from "../types";
import { OPTION_KEYS } from "../util";
import type { ParsedPaper, ParsedQuestion } from "./parser";

interface AiQuestion {
  number: number;
  section: number;
  type: QuestionType;
  text: string;
  options: { key: string; text: string }[];
  answer_letters: string[];
  answer_value: number | null;
  answer_status: "keyed" | "missing" | "bonus" | "dropped";
  has_figure: boolean;
  chapter: string;
  confidence: number;
}
interface AiResult {
  sections: { name: string; subject: string; type: string }[];
  questions: AiQuestion[];
}

export interface AiKey {
  letters: string[];
  value?: number;
  bonus?: boolean;
  dropped?: boolean;
  chapter?: string;
}

const CAP = 0.85;

export function fromAiResult(raw: unknown): { paper: ParsedPaper; keys: AiKey[] } {
  const r = raw as AiResult;
  if (!r || !Array.isArray(r.questions)) throw new Error("Unexpected AI result");
  const sections = (r.sections?.length ? r.sections : [{ name: "Section 1", subject: "", type: "mixed" }]).map((s) => ({
    name: String(s.name || "Section"),
    subject: s.subject ? String(s.subject) : undefined,
    type: ["single", "multiple", "numerical"].includes(s.type) ? (s.type as QuestionType) : undefined,
  }));
  const keys: AiKey[] = [];
  const questions: ParsedQuestion[] = r.questions.map((q) => {
    const conf = Math.max(0, Math.min(CAP, Number(q.confidence) || 0.5));
    const type: QuestionType = ["single", "multiple", "numerical"].includes(q.type) ? q.type : "single";
    const options = type === "numerical" ? [] : (q.options ?? []).map((o, i) => ({ key: OPTION_KEYS[i] ?? String(o.key), text: String(o.text ?? "") }));
    keys.push({
      letters: (q.answer_letters ?? []).map((l) => String(l).toUpperCase()).filter((l) => options.some((o) => o.key === l)),
      value: typeof q.answer_value === "number" ? q.answer_value : undefined,
      bonus: q.answer_status === "bonus",
      dropped: q.answer_status === "dropped",
      chapter: q.chapter || undefined,
    });
    const notes = ["Structured by AI — verify against the paper"];
    if (q.answer_status === "missing") notes.push("No answer found in the key");
    return {
      number: Number(q.number) || 0,
      section: Math.max(0, Math.min(sections.length - 1, Number(q.section) || 0)),
      text: String(q.text ?? ""),
      options,
      type,
      hasFigure: !!q.has_figure,
      confidence: { number: conf, text: q.has_figure ? Math.min(conf, 0.7) : conf, options: type === "numerical" ? conf : options.length >= 2 ? conf : 0.3, type: conf },
      notes,
    };
  });
  return { paper: { sections, questions, warnings: [`AI structured ${questions.length} questions. Treat every field as a draft and review it.`] }, keys };
}
