/**
 * Deterministic scoring engine.
 *
 * Pure functions only: identical (sections, questions, responses) always produce
 * identical results. No UI, storage, or clock access. Every number the app shows
 * about a score is derived from here.
 *
 * Metric definitions (also shown in the UI):
 *  - score percentage  = net score ÷ maximum score × 100
 *  - attempt rate      = attempted ÷ gradable questions
 *  - attempt accuracy  = correct ÷ attempted  (null when nothing attempted)
 *  - negative impact   = |sum of penalties from wrong answers|
 *  - gradable          = questions that are keyed, not bonus, not dropped, and counted
 */
import type { ExamSection, MarkingRule, OptionKey, QResponse, Question, ResultStatus } from "./types";
import { round2 } from "./util";

export const DEFAULT_RULE: MarkingRule = { correct: 4, wrong: 1, unattempted: 0 };

export interface QuestionResult {
  questionId: string;
  status: ResultStatus;
  /** Net marks for this question (can be negative). */
  awarded: number;
  /** Maximum achievable marks for this question (0 when dropped/unkeyed). */
  max: number;
  /** Positive part of awarded. */
  gained: number;
  /** Penalty applied, as a positive number. */
  penalty: number;
  /** Marks short of full marks (max − awarded), ≥ 0. "Where did I lose marks." */
  forfeited: number;
  rule: MarkingRule;
  attempted: boolean;
}

export interface ScoreSummary {
  results: QuestionResult[];
  byId: Record<string, QuestionResult>;
  score: number;
  maxScore: number;
  /** 0..100, null when maxScore is 0. */
  percentage: number | null;
  correct: number;
  wrong: number;
  unattempted: number;
  partial: number;
  bonus: number;
  dropped: number;
  unkeyed: number;
  notCounted: number;
  /** Responses the student never explicitly entered (scored as unattempted). */
  notEntered: number;
  gradable: number;
  attempted: number;
  /** attempted ÷ gradable (0..1). */
  attemptRate: number;
  /** correct ÷ attempted (0..1), null if 0 attempted. */
  accuracy: number | null;
  grossPositive: number;
  /** Sum of penalties as a negative number. */
  grossNegative: number;
  /** |grossNegative|. */
  negativeImpact: number;
  /** Marks forfeited on wrong answers (lost opportunity + penalty). */
  forfeitedWrong: number;
  /** Marks forfeited on unattempted questions. */
  forfeitedUnattempted: number;
  forfeitedPartial: number;
}

/** Resolve the effective rule: question override → section rule → default. */
export function resolveRule(q: Question, sections: ExamSection[]): MarkingRule {
  const section = sections.find((s) => s.id === q.sectionId);
  const base = section?.rule ?? DEFAULT_RULE;
  const o = q.ruleOverride;
  if (!o) return base;
  return {
    correct: o.correct ?? base.correct,
    wrong: o.wrong ?? base.wrong,
    unattempted: o.unattempted ?? base.unattempted,
    partial: o.partial ?? base.partial,
  };
}

export function isKeyed(q: Question): boolean {
  if (q.bonus || q.dropped) return true;
  if (q.type === "numerical") return !!q.numericalAnswer && Number.isFinite(q.numericalAnswer.value);
  return q.correctAnswer.length > 0;
}

export function isAttempted(q: Question, r: QResponse | undefined): boolean {
  if (!r) return false;
  if (q.type === "numerical") return (r.numerical ?? "").trim() !== "";
  return r.selected.length > 0;
}

function sameSet(a: OptionKey[], b: OptionKey[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}

export function parseNumerical(s: string | undefined): number | null {
  if (s === undefined) return null;
  const t = s.trim().replace(/,/g, "").replace(/−/g, "-");
  if (t === "") return null;
  // Allow simple fractions like 3/4
  const frac = t.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (frac) {
    const den = Number(frac[2]);
    return den === 0 ? null : Number(frac[1]) / den;
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Score one question. `counted` is false when an optional section's attempt
 * limit has already been reached (the question is attempted but not counted).
 */
export function scoreQuestion(q: Question, r: QResponse | undefined, rule: MarkingRule, counted = true): QuestionResult {
  const attempted = isAttempted(q, r);
  const base = { questionId: q.id, rule, attempted };
  const make = (status: ResultStatus, awarded: number, max: number): QuestionResult => {
    const a = round2(awarded);
    return {
      ...base,
      status,
      awarded: a,
      max,
      gained: a > 0 ? a : 0,
      penalty: a < 0 ? -a : 0,
      forfeited: Math.max(0, round2(max - a)),
    };
  };

  if (q.dropped) return make("dropped", 0, 0);
  if (q.bonus) return make("bonus", rule.correct, rule.correct);
  if (!isKeyed(q)) return make("unkeyed", 0, 0);
  if (!counted) return { ...make("not_counted", 0, 0), attempted: true };
  if (!attempted) return make("unattempted", rule.unattempted, rule.correct);

  const max = rule.correct;
  if (q.type === "numerical") {
    const v = parseNumerical(r!.numerical);
    const key = q.numericalAnswer!;
    const ok = v !== null && Math.abs(v - key.value) <= Math.max(key.tolerance, 1e-9);
    return ok ? make("correct", rule.correct, max) : make("wrong", -rule.wrong, max);
  }

  const sel = r!.selected;
  if (q.type === "single") {
    const ok = sel.length === 1 && q.correctAnswer.includes(sel[0]);
    return ok ? make("correct", rule.correct, max) : make("wrong", -rule.wrong, max);
  }

  // multiple-correct
  if (sameSet(sel, q.correctAnswer)) return make("correct", rule.correct, max);
  const correctSet = new Set(q.correctAnswer);
  const anyWrong = sel.some((k) => !correctSet.has(k));
  if (!anyWrong && rule.partial?.enabled) {
    const marks = Math.min(rule.correct, sel.length * rule.partial.perCorrectOption);
    return make("partial", marks, max);
  }
  return make("wrong", -rule.wrong, max);
}

/** Score a full paper. Pure and deterministic. */
export function scorePaper(
  sections: ExamSection[],
  questions: Question[],
  responses: Record<string, QResponse>,
): ScoreSummary {
  const ordered = [...questions].sort((a, b) => a.index - b.index);
  const attemptsInSection: Record<string, number> = {};
  const results: QuestionResult[] = [];
  let notEntered = 0;

  for (const q of ordered) {
    const r = responses[q.id];
    if (!r?.entered && !q.dropped && !q.bonus) notEntered++;
    const rule = resolveRule(q, sections);
    const section = sections.find((s) => s.id === q.sectionId);
    let counted = true;
    if (section?.maxAttemptsCounted && isAttempted(q, r) && isKeyed(q) && !q.bonus && !q.dropped) {
      const n = (attemptsInSection[section.id] ?? 0) + 1;
      attemptsInSection[section.id] = n;
      counted = n <= section.maxAttemptsCounted;
    }
    results.push(scoreQuestion(q, r, rule, counted));
  }
  return summarize(results, notEntered);
}

export function summarize(results: QuestionResult[], notEntered = 0): ScoreSummary {
  const byId: Record<string, QuestionResult> = {};
  const c = { correct: 0, wrong: 0, unattempted: 0, partial: 0, bonus: 0, dropped: 0, unkeyed: 0, not_counted: 0 };
  let score = 0, maxScore = 0, pos = 0, neg = 0, fW = 0, fU = 0, fP = 0;

  for (const r of results) {
    byId[r.questionId] = r;
    c[r.status as keyof typeof c]++;
    score += r.awarded;
    maxScore += r.max;
    pos += r.gained;
    neg -= r.penalty;
    if (r.status === "wrong") fW += r.forfeited;
    if (r.status === "unattempted") fU += r.forfeited;
    if (r.status === "partial") fP += r.forfeited;
  }
  const gradable = c.correct + c.wrong + c.unattempted + c.partial;
  const attempted = c.correct + c.wrong + c.partial;
  score = round2(score);
  maxScore = round2(maxScore);
  return {
    results,
    byId,
    score,
    maxScore,
    percentage: maxScore > 0 ? round2((score / maxScore) * 100) : null,
    correct: c.correct,
    wrong: c.wrong,
    unattempted: c.unattempted,
    partial: c.partial,
    bonus: c.bonus,
    dropped: c.dropped,
    unkeyed: c.unkeyed,
    notCounted: c.not_counted,
    notEntered,
    gradable,
    attempted,
    attemptRate: gradable > 0 ? attempted / gradable : 0,
    accuracy: attempted > 0 ? c.correct / attempted : null,
    grossPositive: round2(pos),
    grossNegative: round2(neg),
    negativeImpact: round2(-neg),
    forfeitedWrong: round2(fW),
    forfeitedUnattempted: round2(fU),
    forfeitedPartial: round2(fP),
  };
}

/* ----------------------------- display ---------------------------- */

export function formatKey(q: Question): string {
  if (q.dropped) return "Dropped";
  if (q.bonus) return "Bonus";
  if (q.type === "numerical") {
    if (!q.numericalAnswer) return "—";
    const { value, tolerance } = q.numericalAnswer;
    return tolerance > 0 ? `${value} (±${tolerance})` : String(value);
  }
  return q.correctAnswer.length ? q.correctAnswer.join(q.type === "multiple" ? "," : " / ") : "—";
}

export function formatResponse(q: Question, r: QResponse | undefined): string {
  if (!r || !r.entered) return "Not entered";
  if (q.type === "numerical") return (r.numerical ?? "").trim() || "Unattempted";
  return r.selected.length ? r.selected.join(",") : "Unattempted";
}

export const STATUS_LABEL: Record<ResultStatus, string> = {
  correct: "Correct",
  wrong: "Wrong",
  unattempted: "Unattempted",
  partial: "Partial",
  bonus: "Bonus",
  dropped: "Dropped",
  unkeyed: "No key",
  not_counted: "Not counted",
};

export function describeRule(rule: MarkingRule): string {
  const w = rule.wrong === 0 ? "0" : `−${rule.wrong}`;
  const u = rule.unattempted === 0 ? "0" : rule.unattempted > 0 ? `+${rule.unattempted}` : `${rule.unattempted}`;
  let s = `+${rule.correct} / ${w} / ${u}`;
  if (rule.partial?.enabled) s += ` · partial +${rule.partial.perCorrectOption}/option`;
  return s;
}
