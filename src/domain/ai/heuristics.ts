/**
 * Deterministic "AI-assisted" helpers. They only ever SUGGEST — the UI shows the
 * evidence and the student accepts or ignores. They never change answers, keys or marks.
 */
import { CHAPTER_KEYWORDS } from "../syllabi";
import { parseNumerical, type QuestionResult } from "../scoring";
import type { QResponse, Question, SyllabusTopic } from "../types";
import { norm } from "../util";

export interface Classification {
  subject?: string;
  chapter?: string;
  topic?: string;
  /** 0..1 */
  confidence: number;
  evidence?: string;
}

/** Suggest subject/chapter/topic for a question from its text. */
export function classifyQuestion(text: string, subjectHint: string | undefined, topics: SyllabusTopic[], subjects: string[] = []): Classification {
  const t = ` ${norm(text)} `;
  if (t.trim().length < 8) return { subject: subjectHint, confidence: 0 };
  let best: Classification = { subject: subjectHint, confidence: 0 };
  let bestScore = 0;

  // 1. Match against the exam's own syllabus (chapter + topic names).
  for (const tp of topics) {
    if (subjectHint && tp.subject !== subjectHint) continue;
    let score = 0;
    const words = norm(`${tp.topic}`).split(" ").filter((w) => w.length > 3);
    for (const w of words) if (t.includes(` ${w}`)) score += 1.5;
    for (const w of norm(tp.chapter).split(" ").filter((w) => w.length > 3)) if (t.includes(` ${w}`)) score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = { subject: tp.subject, chapter: tp.chapter, topic: tp.topic, confidence: 0, evidence: `mentions “${tp.topic}”` };
    }
  }
  // 2. Built-in keyword hints.
  for (const [chapter, { subject, words }] of Object.entries(CHAPTER_KEYWORDS)) {
    if (subjectHint && subject !== subjectHint) continue;
    if (subjects.length && !subjects.includes(subject) && !subjectHint) continue;
    let score = 0;
    let hit = "";
    for (const w of words) {
      const nw = norm(w);
      const hitRaw = !nw && w.trim() && text.includes(w.trim());
      if ((nw && t.includes(` ${nw}`)) || hitRaw) {
        score += 2;
        hit ||= w;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = { subject, chapter, topic: bestTopic(t, topics.filter((x) => x.chapter === chapter)), confidence: 0, evidence: `keyword “${hit}”` };
    }
  }
  best.confidence = bestScore >= 4 ? 0.85 : bestScore >= 2 ? 0.65 : bestScore > 0 ? 0.45 : 0;
  if (!bestScore) best = { subject: subjectHint, confidence: 0 };
  return best;
}

/** Pick the chapter topic whose words overlap the question most (first topic if none do). */
function bestTopic(t: string, list: SyllabusTopic[]): string {
  let best = list[0]?.topic ?? "";
  let bestN = 0;
  for (const tp of list) {
    const n = norm(tp.topic).split(" ").filter((w) => w.length > 3 && t.includes(` ${w.replace(/s$/, "")}`)).length;
    if (n > bestN) {
      bestN = n;
      best = tp.topic;
    }
  }
  return best;
}

export interface ErrorSuggestion {
  category: string;
  confidence: number;
  why: string;
}

/**
 * Suggest a likely error reason from response metadata and answer shape.
 * Returns null when there isn't enough evidence to say anything useful.
 */
export function suggestError(q: Question, r: QResponse | undefined, result: QuestionResult | undefined, topic?: SyllabusTopic): ErrorSuggestion | null {
  if (!result || !["wrong", "unattempted", "partial"].includes(result.status)) return null;
  if (r?.outOfTime) return { category: "time", confidence: 0.8, why: "You flagged that you ran out of time on this question." };
  if (result.status === "wrong" && r?.guessed) return { category: "guess", confidence: 0.8, why: "You marked this answer as a guess." };
  if (result.status === "unattempted") {
    if (topic?.coverage === "not_started") return { category: "not_studied", confidence: 0.7, why: `“${topic.topic}” is still marked not started in your syllabus.` };
    return null;
  }
  if (result.status === "wrong" && r) {
    if (q.type === "numerical") {
      const v = parseNumerical(r.numerical);
      const k = q.numericalAnswer?.value;
      if (v !== null && k !== undefined && k !== 0) {
        if (Math.abs(v + k) < 1e-9) return { category: "unit_sign", confidence: 0.75, why: `Your answer ${v} is the negative of the key ${k}.` };
        const ratio = v / k;
        if ([10, 100, 1000, 0.1, 0.01, 0.001].some((x) => Math.abs(ratio - x) < 1e-9)) return { category: "unit_sign", confidence: 0.7, why: `Your answer differs from ${k} by a power of ten — often a unit conversion slip.` };
        if (Math.abs(ratio - 2) < 1e-9 || Math.abs(ratio - 0.5) < 1e-9) return { category: "calculation", confidence: 0.55, why: `Your answer is exactly ${ratio === 2 ? "double" : "half"} the key — a missed factor of 2 is a common calculation slip.` };
        if (Math.abs(v - k) / Math.abs(k) < 0.05) return { category: "calculation", confidence: 0.6, why: `Your answer ${v} is within 5% of the key ${k} — the method was probably right.` };
      }
    }
    if (q.type !== "numerical" && r.selected.length === 1 && q.correctAnswer.length) {
      const sel = q.options.find((o) => o.key === r.selected[0])?.text ?? "";
      const key = q.options.find((o) => o.key === q.correctAnswer[0])?.text ?? "";
      const sv = parseNumerical(sel.replace(/[^\d.\-−/]/g, ""));
      const kv = parseNumerical(key.replace(/[^\d.\-−/]/g, ""));
      if (sv !== null && kv !== null && kv !== 0 && sel && key) {
        if (Math.abs(sv + kv) < 1e-9) return { category: "unit_sign", confidence: 0.7, why: `You chose ${r.selected[0]} (${sel}), the negative of the correct ${q.correctAnswer[0]} (${key}).` };
        const ratio = sv / kv;
        if ([10, 100, 0.1, 0.01].some((x) => Math.abs(ratio - x) < 1e-9)) return { category: "unit_sign", confidence: 0.6, why: `Option ${r.selected[0]} differs from the correct option by a power of ten.` };
        if (Math.abs(ratio - 2) < 1e-9 || Math.abs(ratio - 0.5) < 1e-9) return { category: "calculation", confidence: 0.5, why: `Option ${r.selected[0]} is exactly ${ratio === 2 ? "double" : "half"} the correct value.` };
      }
    }
    if (q.type === "single" && r.selected.length > 1) return { category: "bubbling", confidence: 0.7, why: "More than one option was marked on a single-choice question." };
    if (topic?.coverage === "not_started") return { category: "not_studied", confidence: 0.5, why: `“${topic.topic}” is still marked not started.` };
  }
  return null;
}
