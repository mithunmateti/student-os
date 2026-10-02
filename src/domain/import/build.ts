/**
 * Builds Analysis drafts from parsed imports, manual structure, or a previous paper.
 * Also merges answer keys onto questions with explicit, reported mapping rules.
 */
import { classifyQuestion } from "../ai/heuristics";
import type { Analysis, ExamSection, FileRef, MarkingRule, Question, QuestionType, SyllabusTopic } from "../types";
import { OPTION_KEYS, today, uid } from "../util";
import type { KeyEntry, ParsedPaper } from "./parser";

export interface DraftMeta {
  examId: string;
  title: string;
  takenOn?: string;
  rule: MarkingRule;
  subjects: string[];
  topics: SyllabusTopic[];
  sources?: FileRef[];
  importMethod: Analysis["importMethod"];
}

function emptyAnalysis(meta: DraftMeta, sections: ExamSection[], questions: Question[], warnings: string[]): Analysis {
  const now = new Date().toISOString();
  return {
    id: uid("an"),
    examId: meta.examId,
    title: meta.title,
    takenOn: meta.takenOn ?? today(),
    createdAt: now,
    updatedAt: now,
    stage: "review",
    sections,
    questions,
    responses: {},
    sources: meta.sources ?? [],
    importWarnings: warnings,
    importMethod: meta.importMethod,
    changes: [],
  };
}

export function buildFromParsed(parsed: ParsedPaper, meta: DraftMeta): Analysis {
  const sections: ExamSection[] = (parsed.sections.length ? parsed.sections : [{ name: "Section 1" }]).map((s, i) => ({
    id: uid("sec"),
    name: s.name,
    subject: s.subject ?? (meta.subjects.length === 1 ? meta.subjects[0] : undefined),
    ordering: i,
    rule: { ...meta.rule },
  }));
  const questions: Question[] = parsed.questions.map((pq, i) => {
    const section = sections[pq.section] ?? sections[0];
    const cls = classifyQuestion(pq.text, section.subject, meta.topics, meta.subjects);
    return {
      id: uid("q"),
      index: i + 1,
      number: pq.number,
      sectionId: section.id,
      subject: section.subject ?? cls.subject ?? meta.subjects[0] ?? "General",
      chapter: cls.chapter ?? "",
      topic: cls.topic ?? "",
      type: pq.type,
      text: pq.text,
      options: pq.options.length ? pq.options : pq.type === "numerical" ? [] : OPTION_KEYS.slice(0, 4).map((k) => ({ key: k, text: "" })),
      correctAnswer: [],
      confidence: { number: pq.confidence.number, text: pq.confidence.text, options: pq.confidence.options, type: pq.confidence.type, topic: cls.confidence, answer: 0 },
      reviewed: false,
      hasFigure: pq.hasFigure,
      source: meta.sources?.[0] ? { file: meta.sources[0].name, page: pq.page } : undefined,
      importNotes: pq.notes.length ? pq.notes : undefined,
    };
  });
  return emptyAnalysis(meta, sections, questions, [...parsed.warnings]);
}

export interface ManualSectionSpec {
  name: string;
  subject: string;
  count: number;
  type: QuestionType;
  rule: MarkingRule;
  optionCount?: number;
}

export function buildManual(specs: ManualSectionSpec[], meta: DraftMeta, restartNumbering = false): Analysis {
  const sections: ExamSection[] = specs.map((s, i) => ({ id: uid("sec"), name: s.name, subject: s.subject, ordering: i, rule: { ...s.rule } }));
  const questions: Question[] = [];
  let index = 0;
  specs.forEach((s, si) => {
    for (let k = 0; k < s.count; k++) {
      index++;
      questions.push({
        id: uid("q"),
        index,
        number: restartNumbering ? k + 1 : index,
        sectionId: sections[si].id,
        subject: s.subject,
        chapter: "",
        topic: "",
        type: s.type,
        text: "",
        options: s.type === "numerical" ? [] : OPTION_KEYS.slice(0, s.optionCount ?? 4).map((key) => ({ key, text: "" })),
        correctAnswer: [],
        confidence: {},
        reviewed: false,
      });
    }
  });
  return emptyAnalysis(meta, sections, questions, []);
}

/** Flow C: reuse a previous paper's structure (and optionally its content + key). */
export function duplicateStructure(prev: Analysis, meta: Omit<DraftMeta, "rule" | "subjects" | "topics">, keepContent: boolean): Analysis {
  const secMap = new Map<string, string>();
  const sections = prev.sections.map((s) => {
    const id = uid("sec");
    secMap.set(s.id, id);
    return { ...s, id, rule: { ...s.rule } };
  });
  const questions: Question[] = prev.questions.map((q) => ({
    ...q,
    id: uid("q"),
    sectionId: secMap.get(q.sectionId) ?? sections[0].id,
    text: keepContent ? q.text : "",
    options: keepContent ? q.options.map((o) => ({ ...o })) : q.options.map((o) => ({ key: o.key, text: "" })),
    chapter: keepContent ? q.chapter : "",
    topic: keepContent ? q.topic : "",
    correctAnswer: keepContent ? [...q.correctAnswer] : [],
    numericalAnswer: keepContent ? q.numericalAnswer : undefined,
    bonus: keepContent ? q.bonus : undefined,
    dropped: keepContent ? q.dropped : undefined,
    confidence: {},
    reviewed: keepContent,
    archived: undefined,
    bankNote: undefined,
  }));
  return {
    ...emptyAnalysis({ ...meta, rule: sections[0]?.rule ?? { correct: 4, wrong: 1, unattempted: 0 }, subjects: [], topics: [] }, sections, questions, []),
    importWarnings: [keepContent ? `Copied ${questions.length} questions, answer key and marking from “${prev.title}”.` : `Reused the structure and marking of “${prev.title}”. Enter the new answer key in review.`],
  };
}

export interface KeyMergeResult {
  questions: Question[];
  warnings: string[];
  matched: number;
  strategy: "number" | "order";
}

/**
 * Apply parsed key entries. Maps by printed number when numbers are unique on both
 * sides; otherwise (restarted numbering, duplicates) maps by order and says so.
 */
export function mergeKey(questions: Question[], entries: KeyEntry[]): KeyMergeResult {
  const warnings: string[] = [];
  const qNums = questions.map((q) => q.number);
  const kNums = entries.map((e) => e.number);
  const uniqueQ = new Set(qNums).size === qNums.length;
  const uniqueK = new Set(kNums).size === kNums.length;
  const strategy: "number" | "order" = uniqueQ && uniqueK ? "number" : "order";
  if (strategy === "order") warnings.push("Question numbers repeat (sections restart numbering), so the key was matched in paper order. Spot-check a few answers.");

  const byNumber = new Map(entries.map((e) => [e.number, e]));
  let matched = 0;
  const sorted = [...questions].sort((a, b) => a.index - b.index);
  const out = sorted.map((q, i) => {
    const e = strategy === "number" ? byNumber.get(q.number) : entries[i];
    if (!e) return { ...q, confidence: { ...q.confidence, answer: 0 } };
    matched++;
    const next: Question = { ...q, confidence: { ...q.confidence } };
    if (e.bonus) {
      next.bonus = true;
      next.confidence.answer = 0.9;
    } else if (e.dropped) {
      next.dropped = true;
      next.confidence.answer = 0.9;
    } else if (q.type === "numerical") {
      if (e.value !== undefined) {
        next.numericalAnswer = { value: e.value, tolerance: 0 };
        next.confidence.answer = 0.9;
      } else {
        next.confidence.answer = 0.3;
        next.importNotes = [...(q.importNotes ?? []), `Key “${e.raw}” is not a number for a numerical question`];
      }
    } else {
      const valid = e.letters.filter((l) => q.options.some((o) => o.key === l) || q.options.length === 0);
      next.correctAnswer = valid;
      next.confidence.answer = valid.length === e.letters.length ? e.confidence : 0.4;
      if (valid.length > 1 && q.type === "single") {
        next.type = "multiple";
        next.confidence.type = 0.6;
        next.importNotes = [...(q.importNotes ?? []), "Key lists several answers — marked as multiple-correct; change to single if the key accepts either"];
      }
      if (!valid.length) next.importNotes = [...(q.importNotes ?? []), `Key “${e.raw}” doesn't match any option`];
    }
    return next;
  });
  const missing = sorted.length - matched;
  if (missing > 0) warnings.push(`${missing} question${missing === 1 ? " has" : "s have"} no answer in the key — fill ${missing === 1 ? "it" : "them"} in or mark as dropped.`);
  if (entries.length > sorted.length) warnings.push(`The key has ${entries.length} answers but the paper has ${sorted.length} questions. Extra key entries were not applied.`);
  return { questions: out, warnings, matched, strategy };
}

/** Questions needing attention before scoring. */
export function unresolvedReasons(q: Question, threshold = 0.75): string[] {
  const r: string[] = [];
  if (!q.dropped && !q.bonus) {
    if (q.type === "numerical" ? !q.numericalAnswer : q.correctAnswer.length === 0) r.push("No answer key");
  }
  for (const [f, v] of Object.entries(q.confidence)) {
    if (v !== undefined && v < threshold && !(f === "answer" && (q.correctAnswer.length || q.numericalAnswer || q.bonus || q.dropped) && q.reviewed)) {
      if (f === "answer" && r.includes("No answer key")) continue;
      r.push(`Low confidence: ${f}`);
    }
  }
  if (q.type === "single" && q.correctAnswer.length > 1) r.push("Single-choice with several accepted answers");
  return q.reviewed ? r.filter((x) => x === "No answer key") : r;
}
