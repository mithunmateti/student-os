/**
 * Analysis engine: breakdowns, pattern detection, change explanation and
 * evidence-linked recommendations. Pure functions over analyses + scoring.
 *
 * Rule: every observation carries the counts and question references that
 * produced it, and is only emitted when a minimum amount of evidence exists.
 */
import { UNKNOWN_ERROR } from "./catalog";
import { scorePaper, type ScoreSummary, type QuestionResult } from "./scoring";
import type { Analysis, AnalysisSnapshot, ErrorCategory, ErrorGroup, Priority, Question, TaskType } from "./types";
import { fmtNum, pct, plural, round2, fmtPct1 } from "./util";

/* ------------------------------------------------------------------ */
/* Scoring wrappers                                                    */
/* ------------------------------------------------------------------ */

export function scoreAnalysis(a: Analysis): ScoreSummary {
  return scorePaper(a.sections, a.questions, a.responses);
}

export function buildSnapshot(a: Analysis, s: ScoreSummary = scoreAnalysis(a), at = new Date().toISOString()): AnalysisSnapshot {
  const bySubject: AnalysisSnapshot["bySubject"] = {};
  for (const q of a.questions) {
    const r = s.byId[q.id];
    if (!r) continue;
    const row = (bySubject[q.subject || "General"] ||= { score: 0, max: 0, correct: 0, wrong: 0, unattempted: 0 });
    row.score = round2(row.score + r.awarded);
    row.max = round2(row.max + r.max);
    if (r.status === "correct") row.correct++;
    if (r.status === "wrong") row.wrong++;
    if (r.status === "unattempted") row.unattempted++;
  }
  return {
    score: s.score,
    maxScore: s.maxScore,
    percentage: s.percentage ?? 0,
    accuracy: s.accuracy,
    attemptRate: s.attemptRate,
    correct: s.correct,
    wrong: s.wrong,
    unattempted: s.unattempted,
    partial: s.partial,
    grossPositive: s.grossPositive,
    grossNegative: s.grossNegative,
    negativeMarkLoss: s.negativeImpact,
    totalQuestions: a.questions.length,
    bySubject,
    createdAt: at,
  };
}

/* ------------------------------------------------------------------ */
/* Breakdowns                                                          */
/* ------------------------------------------------------------------ */

export interface BreakdownRow {
  key: string;
  subject: string;
  chapter?: string;
  questions: number;
  correct: number;
  wrong: number;
  unattempted: number;
  partial: number;
  attempted: number;
  score: number;
  max: number;
  forfeited: number;
  penalty: number;
  accuracy: number | null;
  attemptRate: number;
  questionIds: string[];
}

export type BreakdownKey = "subject" | "chapter" | "topic" | "section";

export function breakdown(a: Analysis, s: ScoreSummary, by: BreakdownKey): BreakdownRow[] {
  const rows = new Map<string, BreakdownRow>();
  for (const q of a.questions) {
    const r = s.byId[q.id];
    if (!r || r.status === "dropped" || r.status === "unkeyed") continue;
    const key =
      by === "subject" ? q.subject || "General"
      : by === "chapter" ? `${q.subject}::${q.chapter || "Unclassified"}`
      : by === "topic" ? `${q.subject}::${q.chapter || "Unclassified"}::${q.topic || "—"}`
      : a.sections.find((x) => x.id === q.sectionId)?.name ?? "Section";
    let row = rows.get(key);
    if (!row) {
      row = {
        key, subject: q.subject || "General", chapter: by === "subject" || by === "section" ? undefined : q.chapter || "Unclassified",
        questions: 0, correct: 0, wrong: 0, unattempted: 0, partial: 0, attempted: 0,
        score: 0, max: 0, forfeited: 0, penalty: 0, accuracy: null, attemptRate: 0, questionIds: [],
      };
      rows.set(key, row);
    }
    addResult(row, r);
    row.questionIds.push(q.id);
  }
  return finalizeRows([...rows.values()]);
}

function addResult(row: BreakdownRow, r: QuestionResult) {
  if (r.status === "bonus" || r.status === "not_counted") {
    row.score = round2(row.score + r.awarded);
    row.max = round2(row.max + r.max);
    return;
  }
  row.questions++;
  if (r.status === "correct") row.correct++;
  if (r.status === "wrong") row.wrong++;
  if (r.status === "unattempted") row.unattempted++;
  if (r.status === "partial") row.partial++;
  row.score = round2(row.score + r.awarded);
  row.max = round2(row.max + r.max);
  row.forfeited = round2(row.forfeited + r.forfeited);
  row.penalty = round2(row.penalty + r.penalty);
}

function finalizeRows(rows: BreakdownRow[]): BreakdownRow[] {
  for (const row of rows) {
    row.attempted = row.correct + row.wrong + row.partial;
    row.accuracy = row.attempted ? row.correct / row.attempted : null;
    row.attemptRate = row.questions ? row.attempted / row.questions : 0;
  }
  return rows.sort((x, y) => y.forfeited - x.forfeited);
}

export interface ErrorRow {
  category: string;
  label: string;
  group: ErrorGroup | "undiagnosed";
  count: number;
  forfeited: number;
  questionIds: string[];
}

/** Lost = wrong, unattempted or partial. */
export function lostQuestions(a: Analysis, s: ScoreSummary): Question[] {
  return a.questions
    .filter((q) => {
      const st = s.byId[q.id]?.status;
      return st === "wrong" || st === "unattempted" || st === "partial";
    })
    .sort((x, y) => x.index - y.index);
}

export function errorBreakdown(a: Analysis, s: ScoreSummary, categories: ErrorCategory[]): ErrorRow[] {
  const map = new Map<string, ErrorRow>();
  const catById = new Map(categories.map((c) => [c.id, c]));
  for (const q of lostQuestions(a, s)) {
    const resp = a.responses[q.id];
    const id = resp?.errorPrimary || "__undiagnosed";
    let row = map.get(id);
    if (!row) {
      const cat = catById.get(id);
      row = {
        category: id,
        label: id === "__undiagnosed" ? "Not yet diagnosed" : id === UNKNOWN_ERROR ? "Unknown / review later" : cat?.label ?? id,
        group: id === "__undiagnosed" || id === UNKNOWN_ERROR ? "undiagnosed" : cat?.group ?? "other",
        count: 0, forfeited: 0, questionIds: [],
      };
      map.set(id, row);
    }
    row.count++;
    row.forfeited = round2(row.forfeited + (s.byId[q.id]?.forfeited ?? 0));
    row.questionIds.push(q.id);
  }
  return [...map.values()].sort((x, y) => y.forfeited - x.forfeited);
}

export interface LossSource {
  subject: string;
  chapter: string;
  forfeited: number;
  wrong: number;
  unattempted: number;
  questions: number;
  dominantError?: { id: string; label: string; count: number };
  questionIds: string[];
}

export function topLossSources(a: Analysis, s: ScoreSummary, categories: ErrorCategory[], n = 5): LossSource[] {
  const catById = new Map(categories.map((c) => [c.id, c]));
  return breakdown(a, s, "chapter")
    .filter((r) => r.forfeited > 0)
    .slice(0, n)
    .map((r) => {
      const counts: Record<string, number> = {};
      for (const id of r.questionIds) {
        const e = a.responses[id]?.errorPrimary;
        const st = s.byId[id]?.status;
        if (e && e !== UNKNOWN_ERROR && (st === "wrong" || st === "unattempted" || st === "partial")) counts[e] = (counts[e] ?? 0) + 1;
      }
      const top = Object.entries(counts).sort((x, y) => y[1] - x[1])[0];
      return {
        subject: r.subject,
        chapter: r.chapter ?? "Unclassified",
        forfeited: r.forfeited,
        wrong: r.wrong,
        unattempted: r.unattempted,
        questions: r.questions,
        dominantError: top ? { id: top[0], label: catById.get(top[0])?.label ?? top[0], count: top[1] } : undefined,
        questionIds: r.questionIds,
      };
    });
}

/* ------------------------------------------------------------------ */
/* Patterns                                                            */
/* ------------------------------------------------------------------ */

export type ObservationKind =
  | "recurring_error"
  | "weak_chapter"
  | "unattempted_cluster"
  | "guessing"
  | "execution_over_knowledge"
  | "attempt_strategy"
  | "low_accuracy"
  | "bubbling"
  | "time_pressure"
  | "strength"
  | "undiagnosed";

export interface EvidenceRef {
  analysisId: string;
  questionId: string;
  label: string;
}

export interface Observation {
  id: string;
  kind: ObservationKind;
  severity: "high" | "medium" | "low" | "positive";
  title: string;
  evidence: string;
  refs: EvidenceRef[];
  subject?: string;
  chapter?: string;
  errorType?: string;
  /** Marks associated with this pattern (forfeited). */
  marks: number;
}

interface LostItem {
  a: Analysis;
  q: Question;
  r: QuestionResult;
  error?: string;
}

export function shortTitle(title: string): string {
  const m = title.match(/(test|mock|paper|exam)\s*#?\s*(\d+)/i);
  if (m) return `${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()} ${m[2]}`;
  return title.length > 18 ? title.slice(0, 16) + "…" : title;
}

function refLabel(a: Analysis, q: Question): string {
  return `${shortTitle(a.title)} · Q${q.index}`;
}

const EXECUTION = new Set(["calculation", "algebra", "misread", "misinterpreted", "careless", "unit_sign", "incomplete"]);

/**
 * Detect evidence-backed patterns across a window of finalized analyses
 * (sorted oldest → newest). The newest analysis drives "latest" patterns.
 */
export function detectPatterns(analyses: Analysis[], categories: ErrorCategory[], windowSize = 3): Observation[] {
  const done = analyses.filter((a) => a.finalizedAt || a.stage === "report" || a.stage === "errors" || a.stage === "results");
  if (!done.length) return [];
  const window = done.slice(-windowSize);
  const latest = window[window.length - 1];
  const catById = new Map(categories.map((c) => [c.id, c]));
  const label = (id: string) => catById.get(id)?.label ?? id;
  const obs: Observation[] = [];

  const scored = window.map((a) => ({ a, s: scoreAnalysis(a) }));
  const lost: LostItem[] = [];
  for (const { a, s } of scored) {
    for (const q of a.questions) {
      const r = s.byId[q.id];
      if (r && (r.status === "wrong" || r.status === "unattempted" || r.status === "partial")) {
        lost.push({ a, q, r, error: a.responses[q.id]?.errorPrimary });
      }
    }
  }
  const nTests = window.length;
  const across = nTests > 1 ? `across your last ${nTests} tests` : `in ${latest.title}`;

  // 1. Recurring error type within a chapter.
  const byChapter = new Map<string, LostItem[]>();
  for (const it of lost) {
    const k = `${it.q.subject}::${it.q.chapter}`;
    if (!it.q.chapter) continue;
    (byChapter.get(k) ?? byChapter.set(k, []).get(k)!).push(it);
  }
  for (const [k, items] of byChapter) {
    const [subject, chapter] = k.split("::");
    const byErr = new Map<string, LostItem[]>();
    for (const it of items) if (it.error && it.error !== UNKNOWN_ERROR) (byErr.get(it.error) ?? byErr.set(it.error, []).get(it.error)!).push(it);
    for (const [err, errItems] of byErr) {
      // Skip reasons that describe leaving a question (covered by the unattempted/time patterns).
      if (PAPER_LEVEL.has(err)) continue;
      const tests = new Set(errItems.map((i) => i.a.id)).size;
      const share = errItems.length / items.length;
      if ((errItems.length >= 3 && tests >= 2 && share >= 0.3) || errItems.length >= 4) {
        const marks = round2(errItems.reduce((m, i) => m + i.r.forfeited, 0));
        obs.push({
          id: `recurring:${k}:${err}`,
          kind: "recurring_error",
          severity: errItems.length >= 4 || share >= 0.5 ? "high" : "medium",
          title: `Recurring ${label(err).toLowerCase()} in ${chapter}`,
          evidence: `${errItems.length} of your ${items.length} lost ${chapter} questions ${across} were tagged “${label(err)}” (${fmtNum(marks)} marks forfeited).`,
          refs: errItems.map((i) => ({ analysisId: i.a.id, questionId: i.q.id, label: refLabel(i.a, i.q) })),
          subject, chapter, errorType: err, marks,
        });
      }
    }
  }

  // 2. Weak chapters in the latest paper.
  const latestScore = scored[scored.length - 1].s;
  const totalForfeited = latestScore.forfeitedWrong + latestScore.forfeitedUnattempted + latestScore.forfeitedPartial;
  for (const row of breakdown(latest, latestScore, "chapter").slice(0, 6)) {
    const share = totalForfeited ? row.forfeited / totalForfeited : 0;
    if (row.questions >= 2 && row.forfeited >= Math.max(8, totalForfeited * 0.08) && (row.accuracy === null || row.accuracy < 0.6 || row.unattempted >= 2)) {
      obs.push({
        id: `weak:${row.key}`,
        kind: "weak_chapter",
        severity: share >= 0.12 ? "high" : "medium",
        title: `${row.chapter} is a top mark-loss source`,
        evidence: `${row.chapter} cost ${fmtNum(row.forfeited)} marks in ${latest.title} (${pct(share)} of all marks lost): ${row.correct} correct, ${row.wrong} wrong, ${row.unattempted} unattempted of ${row.questions}.`,
        refs: row.questionIds
          .filter((id) => ["wrong", "unattempted", "partial"].includes(latestScore.byId[id]?.status))
          .map((id) => ({ analysisId: latest.id, questionId: id, label: refLabel(latest, latest.questions.find((q) => q.id === id)!) })),
        subject: row.subject, chapter: row.chapter, marks: row.forfeited,
      });
    }
  }

  // 3. Repeated unattempted questions from one chapter.
  for (const [k, items] of byChapter) {
    const un = items.filter((i) => i.r.status === "unattempted" && !(i.a.id === latest.id && latest.responses[i.q.id]?.errorPrimary === "time"));
    const tests = new Set(un.map((i) => i.a.id)).size;
    if (un.length >= 4 && tests >= 2) {
      const [subject, chapter] = k.split("::");
      const marks = round2(un.reduce((m, i) => m + i.r.forfeited, 0));
      obs.push({
        id: `unattempted:${k}`,
        kind: "unattempted_cluster",
        severity: un.length >= 5 ? "high" : "medium",
        title: `You keep skipping ${chapter}`,
        evidence: `You left ${un.length} ${chapter} questions unattempted ${across} (${fmtNum(marks)} marks not earned).`,
        refs: un.map((i) => ({ analysisId: i.a.id, questionId: i.q.id, label: refLabel(i.a, i.q) })),
        subject, chapter, marks,
      });
    }
  }

  // 4. Guessing outcome in the latest paper.
  const guessed = latest.questions.filter((q) => latest.responses[q.id]?.guessed && ["correct", "wrong", "partial"].includes(latestScore.byId[q.id]?.status));
  if (guessed.length >= 3) {
    const right = guessed.filter((q) => latestScore.byId[q.id].status === "correct");
    const net = round2(guessed.reduce((m, q) => m + latestScore.byId[q.id].awarded, 0));
    const wrongGuesses = guessed.filter((q) => latestScore.byId[q.id].status === "wrong");
    obs.push({
      id: `guessing:${latest.id}`,
      kind: "guessing",
      severity: net < 0 ? "high" : net <= 4 ? "medium" : "low",
      title: net < 0 ? "Guessing cost you marks" : "Your guesses were net positive",
      evidence: `Of ${guessed.length} guessed answers in ${latest.title}, ${right.length} ${right.length === 1 ? "was" : "were"} right and ${wrongGuesses.length} wrong — net ${net >= 0 ? "+" : "−"}${fmtNum(Math.abs(net))} marks.`,
      refs: wrongGuesses.map((q) => ({ analysisId: latest.id, questionId: q.id, label: refLabel(latest, q) })),
      marks: Math.abs(Math.min(0, net)),
    });
  }

  // 5. Execution errors outweigh knowledge errors (latest paper).
  const diagnosed = lost.filter((i) => i.a.id === latest.id && i.r.status === "wrong" && i.error && i.error !== UNKNOWN_ERROR);
  const exec = diagnosed.filter((i) => EXECUTION.has(i.error!));
  const know = diagnosed.filter((i) => ["conceptual", "recall", "not_studied"].includes(i.error!));
  if (exec.length >= 4 && exec.length > know.length) {
    const marks = round2(exec.reduce((m, i) => m + i.r.forfeited, 0));
    obs.push({
      id: `execution:${latest.id}`,
      kind: "execution_over_knowledge",
      severity: exec.length >= 8 ? "high" : "medium",
      title: "Strong knowledge, weak execution",
      evidence: `${exec.length} of ${diagnosed.length} diagnosed wrong answers in ${latest.title} were execution errors (calculation, careless, misread, sign…) versus ${know.length} knowledge gaps — ${fmtNum(marks)} marks lost on questions you knew how to approach.`,
      refs: exec.map((i) => ({ analysisId: i.a.id, questionId: i.q.id, label: refLabel(i.a, i.q) })),
      marks,
    });
  }

  // 6. Attempt strategy: accurate but under-attempting / attempting too much.
  if (latestScore.accuracy !== null && latestScore.gradable >= 10) {
    const rule = latest.sections[0]?.rule;
    const breakEven = rule && rule.correct + rule.wrong > 0 ? rule.wrong / (rule.correct + rule.wrong) : 0;
    if (latestScore.accuracy >= 0.75 && latestScore.attemptRate < 0.72) {
      obs.push({
        id: `attempt:${latest.id}`,
        kind: "attempt_strategy",
        severity: "high",
        title: "High accuracy, low attempt rate",
        evidence: `You were right on ${pct(latestScore.accuracy)} of attempted questions but attempted only ${pct(latestScore.attemptRate)} (${latestScore.attempted}/${latestScore.gradable}). With this marking, attempting pays off above ${pct(breakEven)} accuracy.`,
        refs: [],
        marks: latestScore.forfeitedUnattempted,
      });
    } else if (latestScore.accuracy < 0.55 && latestScore.negativeImpact >= 10) {
      obs.push({
        id: `lowacc:${latest.id}`,
        kind: "low_accuracy",
        severity: "high",
        title: "Negative marks are eating your score",
        evidence: `Only ${pct(latestScore.accuracy)} of attempted answers were correct; wrong answers cost ${fmtNum(latestScore.negativeImpact)} marks in penalties alone.`,
        refs: [],
        marks: latestScore.negativeImpact,
      });
    }
  }

  // 7. Bubbling / marking-sheet errors (process, not concept).
  const bubbling = lost.filter((i) => i.error === "bubbling");
  if (bubbling.length >= 1) {
    const marks = round2(bubbling.reduce((m, i) => m + i.r.forfeited, 0));
    obs.push({
      id: "bubbling",
      kind: "bubbling",
      severity: bubbling.length >= 2 ? "high" : "medium",
      title: "Marking-sheet errors",
      evidence: `${plural(bubbling.length, "answer")} ${across} ${bubbling.length === 1 ? "was" : "were"} lost to bubbling/entry mistakes (${fmtNum(marks)} marks) — a process fix, not a concept problem.`,
      refs: bubbling.map((i) => ({ analysisId: i.a.id, questionId: i.q.id, label: refLabel(i.a, i.q) })),
      marks,
    });
  }

  // 8. Time pressure: flags/tags or unattempted clustered at the end of the paper.
  const latestLost = lost.filter((i) => i.a.id === latest.id);
  const timeItems = latestLost.filter((i) => i.error === "time" || latest.responses[i.q.id]?.outOfTime);
  const n = latest.questions.length;
  const lastQuarterUn = latestLost.filter((i) => i.r.status === "unattempted" && i.q.index > n * 0.75);
  const totalUn = latestLost.filter((i) => i.r.status === "unattempted").length;
  if (timeItems.length >= 3 || (lastQuarterUn.length >= 4 && lastQuarterUn.length / Math.max(1, totalUn) >= 0.5)) {
    const items = timeItems.length >= 3 ? timeItems : lastQuarterUn;
    const marks = round2(items.reduce((m, i) => m + i.r.forfeited, 0));
    obs.push({
      id: `time:${latest.id}`,
      kind: "time_pressure",
      severity: items.length >= 6 ? "high" : "medium",
      title: "Time pressure is costing marks",
      evidence: timeItems.length >= 3
        ? `${plural(timeItems.length, "question")} in ${latest.title} ${timeItems.length === 1 ? "was" : "were"} lost to time pressure (${fmtNum(marks)} marks).`
        : `${lastQuarterUn.length} of your ${totalUn} unattempted questions were in the last quarter of the paper — a sign you ran short of time.`,
      refs: items.map((i) => ({ analysisId: latest.id, questionId: i.q.id, label: refLabel(latest, i.q) })),
      marks,
    });
  }

  // 9. Strengths across the window.
  const allChapter = new Map<string, { c: number; t: number; subject: string; chapter: string }>();
  for (const { a, s } of scored) {
    for (const q of a.questions) {
      const r = s.byId[q.id];
      if (!r || !q.chapter || !["correct", "wrong", "unattempted", "partial"].includes(r.status)) continue;
      const k = `${q.subject}::${q.chapter}`;
      const v = allChapter.get(k) ?? { c: 0, t: 0, subject: q.subject, chapter: q.chapter };
      v.t++;
      if (r.status === "correct") v.c++;
      allChapter.set(k, v);
    }
  }
  const strengths = [...allChapter.values()].filter((v) => v.t >= 4 && v.c / v.t >= 0.85).sort((x, y) => y.c - x.c).slice(0, 2);
  for (const v of strengths) {
    obs.push({
      id: `strength:${v.subject}:${v.chapter}`,
      kind: "strength",
      severity: "positive",
      title: `${v.chapter} is a strength`,
      evidence: `${v.c} of ${v.t} ${v.chapter} questions correct ${across}. Maintain with light revision instead of new practice.`,
      refs: [],
      subject: v.subject, chapter: v.chapter, marks: 0,
    });
  }

  // 10. Undiagnosed questions waiting for review.
  const unknown = latestLost.filter((i) => i.r.status !== "unattempted" && (!i.error || i.error === UNKNOWN_ERROR));
  if (unknown.length >= 3) {
    obs.push({
      id: `undiagnosed:${latest.id}`,
      kind: "undiagnosed",
      severity: "low",
      title: "Mistakes waiting for diagnosis",
      evidence: `${unknown.length} wrong answers in ${latest.title} have no error reason yet. Patterns get sharper once they're tagged.`,
      refs: unknown.map((i) => ({ analysisId: latest.id, questionId: i.q.id, label: refLabel(latest, i.q) })),
      marks: round2(unknown.reduce((m, i) => m + i.r.forfeited, 0)),
    });
  }

  const sev = { high: 0, medium: 1, low: 2, positive: 3 };
  obs.sort((x, y) => sev[x.severity] - sev[y.severity] || y.marks - x.marks);
  // At most two observations per chapter keeps the list focused.
  const perChapter = new Map<string, number>();
  return obs.filter((o) => {
    if (!o.chapter) return true;
    const k = `${o.subject}::${o.chapter}`;
    const n = (perChapter.get(k) ?? 0) + 1;
    perChapter.set(k, n);
    return n <= 2;
  });
}

/** Error reasons that describe leaving/abandoning a question rather than a chapter weakness. */
const PAPER_LEVEL = new Set(["time", "selection", "guess", "bubbling", "not_studied"]);

/* ------------------------------------------------------------------ */
/* Change explanation                                                  */
/* ------------------------------------------------------------------ */

export interface ChangeExplanation {
  /** False when the two papers have different maximum scores — compare percentages, not raw marks. */
  comparable: boolean;
  scoreDelta: number;
  percentageDelta: number;
  gainsDelta: number;
  penaltyDelta: number;
  attemptedDelta: number;
  attemptRateDelta: number;
  accuracyDelta: number | null;
  narrative: string;
}

export function explainChange(cur: ScoreSummary, prev: ScoreSummary): ChangeExplanation {
  const comparable = Math.abs(cur.maxScore - prev.maxScore) < 0.01;
  const scoreDelta = round2(cur.score - prev.score);
  const gainsDelta = round2(cur.grossPositive - prev.grossPositive);
  const penaltyDelta = round2(cur.negativeImpact - prev.negativeImpact);
  const attemptedDelta = cur.attempted - prev.attempted;
  const attemptRateDelta = cur.attemptRate - prev.attemptRate;
  const accuracyDelta = cur.accuracy !== null && prev.accuracy !== null ? cur.accuracy - prev.accuracy : null;
  const percentageDelta = round2((cur.percentage ?? 0) - (prev.percentage ?? 0));
  const base = { comparable, scoreDelta, percentageDelta, gainsDelta, penaltyDelta, attemptedDelta, attemptRateDelta, accuracyDelta };

  if (!comparable) {
    // Different paper sizes: explain in shares, never raw marks.
    const pp = (x: number) => `${Math.abs(Math.round(x * 10) / 10)} pts`;
    const dir = percentageDelta > 0 ? "rose" : percentageDelta < 0 ? "fell" : "held steady";
    const penShare = (cur.maxScore ? cur.negativeImpact / cur.maxScore : 0) - (prev.maxScore ? prev.negativeImpact / prev.maxScore : 0);
    const drivers = [
      { k: "penalties", v: Math.abs(penShare) * 100, text: `wrong-answer penalties ${penShare < 0 ? "shrank" : "grew"} as a share of the paper (${pp(penShare * 100)})` },
      { k: "accuracy", v: accuracyDelta === null ? 0 : Math.abs(accuracyDelta) * 100, text: `attempt accuracy ${accuracyDelta !== null && accuracyDelta >= 0 ? "rose" : "fell"} from ${pct(prev.accuracy)} to ${pct(cur.accuracy)}` },
      { k: "attempts", v: Math.abs(attemptRateDelta) * 100, text: `you attempted ${pct(cur.attemptRate)} of questions versus ${pct(prev.attemptRate)}` },
    ].sort((a, b) => b.v - a.v);
    const narrative = percentageDelta === 0
      ? `Your score % held steady at ${fmtPct1(cur.percentage)} (the papers have different maximums, so percentages are compared).`
      : `Your score % ${dir} from ${fmtPct1(prev.percentage)} to ${fmtPct1(cur.percentage)} (different paper sizes, so compared as percentages), mainly because ${drivers[0].text}.`;
    return { ...base, narrative };
  }

  let narrative: string;
  const dir = scoreDelta > 0 ? "increased" : scoreDelta < 0 ? "dropped" : "stayed the same";
  if (scoreDelta === 0) {
    narrative = "Your score stayed the same.";
  } else if (Math.abs(penaltyDelta) >= Math.abs(gainsDelta)) {
    narrative = `Your score ${dir} by ${fmtNum(Math.abs(scoreDelta))} mainly because wrong-answer penalties ${penaltyDelta < 0 ? "fell" : "rose"} by ${fmtNum(Math.abs(penaltyDelta))} marks, not because of how many questions you attempted.`;
  } else if (Math.abs(attemptedDelta) >= 3 && accuracyDelta !== null && Math.abs(accuracyDelta) < 0.05) {
    narrative = `Your score ${dir} by ${fmtNum(Math.abs(scoreDelta))} mainly because you attempted ${Math.abs(attemptedDelta)} ${attemptedDelta > 0 ? "more" : "fewer"} questions at similar accuracy.`;
  } else if (accuracyDelta !== null) {
    narrative = `Your score ${dir} by ${fmtNum(Math.abs(scoreDelta))} mainly because attempt accuracy ${accuracyDelta >= 0 ? "rose" : "fell"} from ${pct(prev.accuracy)} to ${pct(cur.accuracy)}${attemptedDelta ? ` (and you attempted ${Math.abs(attemptedDelta)} ${attemptedDelta > 0 ? "more" : "fewer"})` : ""}.`;
  } else {
    narrative = `Your score ${dir} by ${fmtNum(Math.abs(scoreDelta))}.`;
  }
  return { ...base, narrative };
}

/* ------------------------------------------------------------------ */
/* Recommendations                                                     */
/* ------------------------------------------------------------------ */

export interface Recommendation {
  id: string;
  title: string;
  detail: string;
  taskType: TaskType;
  subject?: string;
  chapter?: string;
  minutes: number;
  priority: Priority;
  reason: string;
  observationId: string;
  /** Spread across this many sessions. */
  sessions: number;
  checklist?: string[];
  refs: EvidenceRef[];
}

const PROCESS_CHECKLIST = [
  "Bubble / enter answers after every 5–10 questions, not at the end",
  "Say the question number out loud before marking",
  "Reserve the last 5 minutes to scan for blank or double-marked answers",
  "Mark doubtful questions in the paper, never on the answer sheet",
];

export function recommend(observations: Observation[], categories: ErrorCategory[]): Recommendation[] {
  const catById = new Map(categories.map((c) => [c.id, c]));
  const out: Recommendation[] = [];
  const prio = (o: Observation): Priority => (o.severity === "high" ? "high" : o.severity === "medium" ? "medium" : "low");
  const qs = (o: Observation, n = 4) => o.refs.slice(0, n).map((r) => r.label).join(", ");

  for (const o of observations) {
    const base = { observationId: o.id, subject: o.subject, chapter: o.chapter, priority: prio(o), reason: o.evidence, refs: o.refs };
    switch (o.kind) {
      case "recurring_error": {
        const e = o.errorType!;
        const group = catById.get(e)?.group;
        if (e === "calculation" || e === "algebra" || e === "unit_sign") {
          out.push({ ...base, id: `rec:${o.id}`, taskType: "practice", minutes: 40, sessions: 2,
            title: `${e === "unit_sign" ? "Units & signs" : "Calculation"} drill: ${o.chapter}`,
            detail: `Solve 8 calculation-heavy ${o.chapter} problems. Write every step and check ${e === "unit_sign" ? "units and signs" : "arithmetic"} before choosing an option.` });
        } else if (e === "recall") {
          out.push({ ...base, id: `rec:${o.id}`, taskType: "formula_review", minutes: 20, sessions: 3,
            title: `Formula sheet from memory: ${o.chapter}`,
            detail: `Write the ${o.chapter} formula/fact sheet from memory, check against notes, repeat after 24 hours and 3 days.` });
        } else if (e === "conceptual" || e === "not_studied") {
          out.push({ ...base, id: `rec:${o.id}`, taskType: "learn", minutes: 60, sessions: 1,
            title: `Rebuild the concept: ${o.chapter}`,
            detail: `Re-learn the core ideas of ${o.chapter}, then do 6 conceptual questions. Redo ${qs(o, 3)}.` });
        } else if (e === "misread" || e === "misinterpreted" || e === "careless") {
          out.push({ ...base, id: `rec:${o.id}`, taskType: "strategy", minutes: 20, sessions: 2,
            title: `Read-twice drill: ${o.chapter}`,
            detail: `Do a 10-question ${o.chapter} set where you underline what is asked and the given data before solving.`,
            checklist: ["Underline what the question asks", "Circle given values and units", "Re-read the question before marking"] });
        } else if (e === "time" || e === "selection") {
          out.push({ ...base, id: `rec:${o.id}`, taskType: "timed_set", minutes: 30, sessions: 2,
            title: `Timed set: ${o.chapter}`, detail: `10 ${o.chapter} questions in 20 minutes; skip anything taking > 3 minutes on the first pass.` });
        } else if (group !== "process") {
          out.push({ ...base, id: `rec:${o.id}`, taskType: "practice", minutes: 40, sessions: 1,
            title: `Targeted practice: ${o.chapter}`, detail: `Solve 8 targeted ${o.chapter} questions focused on ${catById.get(e)?.label.toLowerCase() ?? e}.` });
        }
        break;
      }
      case "weak_chapter":
        out.push({ ...base, id: `rec:${o.id}`, taskType: "redo_mistakes", minutes: 30, sessions: 1,
          title: `Redo lost ${o.chapter} questions after 24 hours`, detail: `Redo ${qs(o)} without looking at the solution, then compare approaches.` });
        out.push({ ...base, id: `rec2:${o.id}`, taskType: "practice", minutes: 45, sessions: 1,
          title: `Targeted practice: ${o.chapter}`, detail: `Solve 8 targeted ${o.chapter} questions at exam difficulty.` });
        break;
      case "unattempted_cluster":
        out.push({ ...base, id: `rec:${o.id}`, taskType: "learn", minutes: 50, sessions: 1,
          title: `Close the gap: ${o.chapter}`, detail: `Learn/review ${o.chapter} and attempt 6 entry-level questions so it stops being a skip-chapter.` });
        break;
      case "guessing":
        if (o.severity !== "low")
          out.push({ ...base, id: `rec:${o.id}`, taskType: "strategy", minutes: 15, sessions: 1,
            title: "Set a guessing rule", detail: "Guess only after eliminating at least two options. Track guesses in your next mock.",
            checklist: ["Eliminate 2 options before guessing", "Mark guesses with ‘?’ on the paper", "Review guess accuracy after the mock"] });
        break;
      case "execution_over_knowledge":
        out.push({ ...base, id: `rec:${o.id}`, taskType: "timed_set", minutes: 30, sessions: 2,
          title: "Accuracy-first timed set", detail: "15 mixed questions in 30 minutes with a 20-second self-check before every answer. Goal: zero execution errors.",
          checklist: ["Re-read the question stem", "Check units and signs", "Recompute the last arithmetic step"] });
        break;
      case "attempt_strategy":
        out.push({ ...base, id: `rec:${o.id}`, taskType: "strategy", minutes: 20, sessions: 1,
          title: "Two-pass question selection", detail: "In the next mock: pass 1 answers everything solvable in < 2 min, pass 2 attempts the rest. Your accuracy supports attempting more." });
        break;
      case "low_accuracy":
        out.push({ ...base, id: `rec:${o.id}`, taskType: "strategy", minutes: 20, sessions: 1,
          title: "Attempt fewer, surer questions", detail: "Skip questions where you can't eliminate options; negative marks outweigh the expected gain." });
        break;
      case "bubbling":
        out.push({ ...base, id: `rec:${o.id}`, taskType: "strategy", minutes: 10, sessions: 1,
          title: "Answer-sheet process checklist", detail: "Practise the answer-marking routine during your next timed set. This is a process fix — no new theory needed.",
          checklist: PROCESS_CHECKLIST });
        break;
      case "time_pressure":
        out.push({ ...base, id: `rec:${o.id}`, taskType: "timed_set", minutes: 40, sessions: 2,
          title: "Pacing drill with checkpoints", detail: "Timed section with checkpoints every 15 minutes; move on from any question past 3 minutes." });
        break;
      case "undiagnosed":
        out.push({ ...base, id: `rec:${o.id}`, taskType: "exam_analysis", minutes: 20, sessions: 1,
          title: "Finish diagnosing your mistakes", detail: `Tag the reason for ${o.refs.length} wrong answers so the plan can target them.` });
        break;
      default:
        break;
    }
  }
  const p = { high: 0, medium: 1, low: 2 };
  const seen = new Set<string>();
  return out
    .sort((a, b) => p[a.priority] - p[b.priority])
    .filter((r) => {
      const k = r.chapter ? `${r.subject}::${r.chapter}::${r.taskType === "practice" || r.taskType === "redo_mistakes" ? r.taskType : "core"}` : r.id;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, MAX_RECOMMENDATIONS);
}

export const MAX_RECOMMENDATIONS = 10;

/** Score trend label from a list of percentages (oldest → newest). */
export function trendLabel(values: number[]): "improving" | "declining" | "flat" | "insufficient" {
  if (values.length < 2) return "insufficient";
  const recent = values.slice(-3);
  const slope = (recent[recent.length - 1] - recent[0]) / (recent.length - 1);
  if (slope > 1.5) return "improving";
  if (slope < -1.5) return "declining";
  return "flat";
}
