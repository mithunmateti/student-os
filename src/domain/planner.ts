/**
 * Student OS planning engine.
 *
 * generatePlan() is deterministic for a given input + `today`: it keeps history and
 * user-owned tasks, carries over unfinished work, protects revision time, schedules
 * evidence-based tasks from exam analysis, and fills the remaining capacity with
 * the highest-priority syllabus topics. Every task carries a human-readable reason.
 */
import { detectPatterns, recommend, scoreAnalysis, breakdown, type Recommendation, type Observation } from "./analysis";
import { TASK_TYPE_META } from "./catalog";
import type {
  Analysis, ErrorCategory, Exam, NotebookEntry, PlannerPreferences, Priority, RevisionItem,
  RevisionScheduleConfig, StudyTask, SyllabusTopic, TaskType,
} from "./types";
import { addDays, daysBetween, parseISODate, round2, uid } from "./util";

/* ------------------------------------------------------------------ */
/* Topic priorities (explainable)                                      */
/* ------------------------------------------------------------------ */

export interface PrioritySignal {
  label: string;
  points: number;
}

export interface TopicPriority {
  topic: SyllabusTopic;
  score: number;
  signals: PrioritySignal[];
  chapterForfeited: number;
  chapterAccuracy: number | null;
  patterns: string[];
}

export interface ChapterPerformance {
  forfeited: number;
  correct: number;
  attempted: number;
  questions: number;
  accuracy: number | null;
  errors: Record<string, number>;
}

const chapterKey = (subject: string, chapter: string) => `${subject.toLowerCase()}::${chapter.toLowerCase()}`;

/** Aggregate chapter performance across the most recent analyses. */
export function chapterPerformance(analyses: Analysis[], window = 3): Map<string, ChapterPerformance> {
  const map = new Map<string, ChapterPerformance>();
  for (const a of analyses.slice(-window)) {
    const s = scoreAnalysis(a);
    for (const row of breakdown(a, s, "chapter")) {
      const k = chapterKey(row.subject, row.chapter ?? "");
      const p = map.get(k) ?? { forfeited: 0, correct: 0, attempted: 0, questions: 0, accuracy: null, errors: {} };
      p.forfeited = round2(p.forfeited + row.forfeited);
      p.correct += row.correct;
      p.attempted += row.attempted;
      p.questions += row.questions;
      for (const id of row.questionIds) {
        const e = a.responses[id]?.errorPrimary;
        if (e && ["wrong", "unattempted", "partial"].includes(s.byId[id]?.status)) p.errors[e] = (p.errors[e] ?? 0) + 1;
      }
      p.accuracy = p.attempted ? p.correct / p.attempted : null;
      map.set(k, p);
    }
  }
  return map;
}

export function topicPriorities(
  topics: SyllabusTopic[],
  perf: Map<string, ChapterPerformance>,
  observations: Observation[],
  recentTasks: StudyTask[],
  today: string,
  finalPrep: boolean,
): TopicPriority[] {
  const obsByChapter = new Map<string, Observation[]>();
  for (const o of observations) {
    if (!o.chapter || !o.subject || o.severity === "positive") continue;
    const k = chapterKey(o.subject, o.chapter);
    (obsByChapter.get(k) ?? obsByChapter.set(k, []).get(k)!).push(o);
  }
  const chapterTopicCount = new Map<string, number>();
  for (const t of topics) chapterTopicCount.set(chapterKey(t.subject, t.chapter), (chapterTopicCount.get(chapterKey(t.subject, t.chapter)) ?? 0) + 1);

  return topics.map((t) => {
    const signals: PrioritySignal[] = [];
    signals.push({ label: `${cap(t.priority)} exam weightage`, points: t.priority === "high" ? 30 : t.priority === "medium" ? 18 : 8 });
    const cov = { not_started: 25, learning: 15, covered: 5, revised: 0 }[t.coverage];
    if (cov) signals.push({ label: t.coverage === "not_started" ? "Not started yet" : t.coverage === "learning" ? "Still learning" : "Covered, needs consolidation", points: cov });
    if (t.difficulty !== "easy") signals.push({ label: `${cap(t.difficulty)} difficulty`, points: t.difficulty === "hard" ? 8 : 4 });

    const k = chapterKey(t.subject, t.chapter);
    const p = perf.get(k);
    const share = 1 / (chapterTopicCount.get(k) ?? 1);
    let chapterForfeited = 0;
    if (p && p.forfeited > 0) {
      chapterForfeited = p.forfeited;
      const pts = Math.round(Math.min(30, p.forfeited * 1.2) * Math.max(0.5, share * 2));
      signals.push({ label: `Lost ${p.forfeited} marks in this chapter in recent tests`, points: pts });
    }
    if (p && p.accuracy !== null && p.attempted >= 2 && p.accuracy < 0.5) {
      signals.push({ label: `Low recent accuracy (${Math.round(p.accuracy * 100)}%)`, points: 10 });
    }
    if (p && p.attempted >= 3 && p.accuracy !== null && p.accuracy >= 0.85) {
      signals.push({ label: `Strong recent accuracy (${Math.round(p.accuracy * 100)}%)`, points: -12 });
    }
    const obs = obsByChapter.get(k) ?? [];
    for (const o of obs.slice(0, 2)) signals.push({ label: o.title, points: o.severity === "high" ? 15 : 8 });

    const recent = recentTasks.find((x) => x.topicId === t.id && x.status === "done" && x.completedAt && daysBetween(x.completedAt.slice(0, 10), today) <= 1);
    if (recent) signals.push({ label: "Studied in the last day (spacing)", points: -15 });
    if (finalPrep && t.coverage === "not_started" && t.priority !== "high") signals.push({ label: "Final week: avoid new low-yield topics", points: -30 });

    const score = signals.reduce((m, s) => m + s.points, 0);
    return { topic: t, score, signals, chapterForfeited, chapterAccuracy: p?.accuracy ?? null, patterns: obs.map((o) => o.title) };
  }).sort((a, b) => b.score - a.score);
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ------------------------------------------------------------------ */
/* Revision checkpoints                                                */
/* ------------------------------------------------------------------ */

export function checkpointLabel(offset: number): string {
  if (offset === 0) return "Same-day quick review";
  if (offset === 1) return "Next-day review";
  if (offset === 3 || offset === 4) return "3–4 day review";
  if (offset === 7) return "7-day review";
  return `${offset}-day review`;
}

export function revisionItemsForTopic(topic: SyllabusTopic, studiedOn: string, cfg: RevisionScheduleConfig, examDate: string): RevisionItem[] {
  const items: RevisionItem[] = [];
  for (const off of cfg.offsets) {
    const due = addDays(studiedOn, off);
    if (daysBetween(due, examDate) < 0) continue;
    items.push({ id: uid("rev"), examId: topic.examId, topicId: topic.id, label: `${topic.chapter}: ${topic.topic}`, dueAt: due, status: "pending", checkpoint: checkpointLabel(off) });
  }
  return items;
}

/* ------------------------------------------------------------------ */
/* Plan generation                                                     */
/* ------------------------------------------------------------------ */

export interface PlanInput {
  exam: Exam;
  topics: SyllabusTopic[];
  /** Finalized analyses in this exam family, oldest → newest. */
  analyses: Analysis[];
  tasks: StudyTask[];
  revisions: RevisionItem[];
  notebook: NotebookEntry[];
  prefs: PlannerPreferences;
  revisionCfg: RevisionScheduleConfig;
  categories: ErrorCategory[];
  today: string;
  /** Scheduled mock tests/practice exams that belong to this goal exam. */
  childExams?: Exam[];
}

export interface PlanOutput {
  tasks: StudyTask[];
  priorities: TopicPriority[];
  observations: Observation[];
  recommendations: Recommendation[];
  finalPrep: boolean;
  daysLeft: number;
}

const KEEP_SOURCES = new Set(["user"]);

/** Tasks that survive regeneration: history, user-created, and pinned. */
function isPreserved(t: StudyTask, today: string): boolean {
  if (t.status !== "pending") return true;
  if (t.pinned || KEEP_SOURCES.has(t.source)) return true;
  return false;
}

export function recommendationKey(r: Recommendation, latestAnalysisId: string | undefined, session: number) {
  return `${r.id}@${latestAnalysisId ?? "none"}#${session}`;
}

export function generatePlan(input: PlanInput): PlanOutput {
  const { exam, prefs, today } = input;
  const daysLeft = daysBetween(today, exam.date);
  const finalPrep = daysLeft >= 0 && daysLeft <= 7;
  const examTopics = input.topics.filter((t) => t.examId === exam.id);
  const observations = detectPatterns(input.analyses, input.categories);
  const recommendations = recommend(observations, input.categories);
  const latestAnalysisId = input.analyses[input.analyses.length - 1]?.id;
  const perf = chapterPerformance(input.analyses);
  const examTasks = input.tasks.filter((t) => t.examId === exam.id);
  const priorities = topicPriorities(examTopics, perf, observations, examTasks, today, finalPrep);

  const kept: StudyTask[] = [];
  const carry: StudyTask[] = [];
  for (const t of examTasks) {
    if (isPreserved(t, today)) kept.push(t);
    // Overdue planner work is carried forward; analysis/notebook/revision tasks are regenerated from their evidence.
    else if (t.dueDate < today && t.source === "planner" && t.type !== "exam_analysis") carry.push(t);
  }

  if (daysLeft < 0) {
    return { tasks: kept, priorities, observations, recommendations, finalPrep: false, daysLeft };
  }

  const horizon = Math.min(prefs.horizonDays, daysLeft + 1);
  const newTasks: StudyTask[] = [];
  const used = new Map<string, number>();
  const subjectCount = new Map<string, number>();
  for (const t of kept) if (t.status === "pending") used.set(t.dueDate, (used.get(t.dueDate) ?? 0) + t.durationMinutes);

  const capacity = (d: string) => {
    if (prefs.blockedDates.includes(d)) return 0;
    if (d === exam.date) return 0;
    return prefs.minutesByWeekday[parseISODate(d).getDay()] ?? 120;
  };
  const free = (d: string) => capacity(d) - (used.get(d) ?? 0);
  const push = (d: string, t: Omit<StudyTask, "id" | "examId" | "dueDate" | "status">) => {
    const task: StudyTask = { ...t, id: uid("task"), examId: exam.id, dueDate: d, status: "pending" };
    newTasks.push(task);
    used.set(d, (used.get(d) ?? 0) + task.durationMinutes);
    if (task.subject && task.topicId) subjectCount.set(`${d}:${task.subject}`, (subjectCount.get(`${d}:${task.subject}`) ?? 0) + 1);
    return task;
  };

  // Recommendation sessions already completed are not recreated.
  const doneKeys = new Set(examTasks.filter((t) => t.status !== "pending" || t.pinned).map((t) => t.sourceRef?.observationId).filter(Boolean) as string[]);
  const recQueue: { rec: Recommendation; session: number; key: string }[] = [];
  for (const rec of recommendations) {
    for (let s = 1; s <= rec.sessions; s++) {
      const key = recommendationKey(rec, latestAnalysisId, s);
      if (!doneKeys.has(key)) recQueue.push({ rec, session: s, key });
    }
  }

  // Mock test days: first weekend day with enough capacity, then every N days.
  const mockDays = new Set<string>();
  if (prefs.mockEveryDays > 0 && daysLeft > 3) {
    const mockLen = Math.min(exam.durationMinutes || 180, 240);
    let next: string | null = null;
    for (let i = 1; i < horizon; i++) {
      const d = addDays(today, i);
      if (capacity(d) >= mockLen && [0, 6].includes(parseISODate(d).getDay())) { next = d; break; }
    }
    while (next && daysBetween(next, exam.date) >= 2 && daysBetween(today, next) < horizon) {
      mockDays.add(next);
      next = addDays(next, prefs.mockEveryDays);
    }
  }
  // Real scheduled tests replace generic mocks near them.
  const scheduled = new Map<string, Exam>();
  for (const c of input.childExams ?? []) {
    const off = daysBetween(today, c.date);
    if (off < 0 || off >= horizon) continue;
    scheduled.set(c.date, c);
    for (const m of [...mockDays]) if (Math.abs(daysBetween(m, c.date)) <= 3) mockDays.delete(m);
  }

  const virtual = new Map(examTopics.map((t) => [t.id, t.coverage]));
  const scoreBoost = new Map<string, number>();
  const revisionsPending = input.revisions.filter((r) => r.examId === exam.id && r.status === "pending");
  const revisionScheduled = new Set<string>();
  const notebookScheduled = new Set<string>();
  const carryQueue = [...carry].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const notebookDue = input.notebook.filter((n) => n.examId === exam.id || input.analyses.some((a) => a.id === n.analysisId));

  for (let i = 0; i < horizon; i++) {
    const d = addDays(today, i);
    const cap0 = capacity(d);
    if (cap0 <= 0) continue;
    const dLeft = daysBetween(d, exam.date);

    // 1. Carry over unfinished work to today.
    //    Spread across days (≤ half of a day's capacity) so nothing is silently dropped.
    let carriedToday = 0;
    while (carryQueue.length && (carriedToday === 0 || carriedToday + carryQueue[0].durationMinutes <= cap0 * 0.5)) {
      const t = carryQueue.shift()!;
      carriedToday += t.durationMinutes;
      {
        const { id: _id, examId: _e, dueDate: _d, status: _s, ...rest } = t;
        push(d, { ...rest, reason: t.reason.startsWith("Carried over") ? t.reason : `Carried over from ${t.dueDate}. ${t.reason}` });
      }
    }

    // 2. Mock test + analysis.
    const sched = scheduled.get(d);
    if (sched) {
      push(d, { type: "mock_test", title: `Sit ${sched.name}`, durationMinutes: sched.durationMinutes || 180, priority: "high", source: "planner",
        reason: `Scheduled test for ${exam.name}. Sit it under exam conditions, then analyze it the same or next day.` });
    }
    if (scheduled.has(addDays(d, -1))) {
      push(d, { type: "exam_analysis", title: `Analyze ${scheduled.get(addDays(d, -1))!.name} in Exam Analyzer`, durationMinutes: 45, priority: "high", source: "planner",
        reason: "Analysis within 24 hours turns the test into targeted tasks while the paper is fresh." });
    }
    if (mockDays.has(d)) {
      push(d, { type: "mock_test", title: `Full mock test (${exam.durationMinutes || 180} min)`, durationMinutes: Math.min(exam.durationMinutes || 180, 240),
        priority: "high", source: "planner", reason: `Scheduled every ${prefs.mockEveryDays} days to track readiness under exam conditions.` });
    }
    const prevDay = addDays(d, -1);
    if (mockDays.has(prevDay)) {
      push(d, { type: "exam_analysis", title: "Analyze yesterday's mock in Exam Analyzer", durationMinutes: 45, priority: "high", source: "planner",
        reason: "Analysis within 24 hours turns the mock into targeted tasks while the paper is fresh." });
    }

    // 3. Pre-exam final review.
    if (input.revisionCfg.preExamDays > 0 && dLeft > 0 && dLeft <= input.revisionCfg.preExamDays) {
      push(d, { type: "revision", title: "Pre-exam final review: formula sheets & Error Notebook", durationMinutes: Math.min(90, Math.floor(free(d) * 0.5)),
        priority: "high", source: "revision", reason: `Final review checkpoint ${dLeft} day${dLeft === 1 ? "" : "s"} before the exam.` });
    }

    // 4. Protected revision time — due checkpoints grouped into one task.
    const revBudget = Math.max(20, Math.floor(cap0 * (finalPrep ? Math.max(prefs.revisionShare, 0.4) : prefs.revisionShare)));
    const dueRevs = revisionsPending.filter((r) => !revisionScheduled.has(r.id) && r.dueAt <= d);
    const fit = Math.max(0, Math.min(dueRevs.length, Math.floor(Math.min(revBudget, free(d)) / 10)));
    if (fit > 0) {
      const batch = dueRevs.slice(0, fit);
      for (const r of batch) revisionScheduled.add(r.id);
      const overdue = batch.filter((r) => r.dueAt < d).length;
      const one = batch.length === 1 ? batch[0] : null;
      const topic = one ? examTopics.find((t) => t.id === one.topicId) : undefined;
      push(d, {
        type: "revision",
        title: one ? `${one.checkpoint}: ${one.label}` : `Spaced revision: ${batch.length} checkpoints`,
        durationMinutes: Math.max(15, batch.length * 10), priority: overdue ? "high" : "medium", source: "revision",
        topicId: topic?.id, subject: topic?.subject, chapter: topic?.chapter, topic: topic?.topic,
        checklist: one ? undefined : batch.map((r) => `${r.checkpoint} — ${r.label}`),
        sourceRef: { revisionIds: batch.map((r) => r.id) },
        reason: `Spaced revision keeps recently studied topics from fading${overdue ? ` (${overdue} overdue)` : ""}. Checkpoints follow your ${input.revisionCfg.offsets.join("/")}-day schedule.`,
      });
    }

    // 5. Error Notebook redo.
    const dueEntries = notebookDue.filter((n) => n.mastery !== "mastered" && n.nextRetryAt && n.nextRetryAt <= d && !notebookScheduled.has(n.id));
    if (dueEntries.length && free(d) >= 15) {
      const batch = dueEntries.slice(0, 8);
      const chapters = [...new Set(batch.map((b) => b.chapter))].slice(0, 3).join(", ");
      push(d, { type: "redo_mistakes", title: `Redo ${batch.length} mistake${batch.length === 1 ? "" : "s"} from the Error Notebook`,
        durationMinutes: Math.min(45, Math.max(15, batch.length * 6)), priority: "high", source: "notebook",
        sourceRef: { notebookIds: batch.map((b) => b.id) }, reason: `${chapters} — retrying mistakes after a gap is how they stop repeating.` });
      for (const b of batch) notebookScheduled.add(b.id);
    }

    // 6. Evidence-based tasks from exam analysis (max 2 per day).
    let recToday = 0;
    for (let j = 0; j < recQueue.length && recToday < 2; j++) {
      const item = recQueue[j];
      if (!item || free(d) < item.rec.minutes) continue;
      // Space sessions of the same recommendation at least 2 days apart.
      const last = newTasks.filter((t) => t.sourceRef?.observationId?.startsWith(item.rec.id + "@")).map((t) => t.dueDate).sort().pop();
      if (last && daysBetween(last, d) < 2) continue;
      const topic = item.rec.chapter ? examTopics.find((t) => t.chapter.toLowerCase() === item.rec.chapter!.toLowerCase() && t.subject.toLowerCase() === (item.rec.subject ?? "").toLowerCase()) : undefined;
      push(d, {
        type: item.rec.taskType, title: item.rec.sessions > 1 ? `${item.rec.title} (${item.session}/${item.rec.sessions})` : item.rec.title,
        durationMinutes: item.rec.minutes, priority: item.rec.priority, source: "analysis",
        subject: item.rec.subject, chapter: item.rec.chapter, topicId: topic?.id,
        reason: item.rec.reason, checklist: item.rec.checklist,
        sourceRef: { analysisId: latestAnalysisId, observationId: item.key },
      });
      recQueue.splice(j, 1);
      j--;
      recToday++;
    }

    // 7. Fill with top syllabus topics.
    let guard = 0;
    while (free(d) >= 20 && guard++ < 12) {
      const ranked = priorities
        .map((p) => ({ p, s: p.score + (scoreBoost.get(p.topic.id) ?? 0) }))
        .filter(({ p }) => !(finalPrep && virtual.get(p.topic.id) === "not_started" && p.topic.priority !== "high"))
        .filter(({ p }) => (subjectCount.get(`${d}:${p.topic.subject}`) ?? 0) < 2)
        .filter(({ p }) => !newTasks.some((t) => t.dueDate === d && (t.topicId === p.topic.id || (t.source === "analysis" && t.chapter === p.topic.chapter))))
        .sort((a, b) => b.s - a.s);
      const pick = ranked[0];
      if (!pick) break;
      const t = pick.p.topic;
      const cov = virtual.get(t.id) ?? t.coverage;
      const step = nextStep(cov, finalPrep, pick.p);
      const minutes = Math.min(step.minutes, free(d));
      if (minutes < 20) break;
      push(d, {
        type: step.type, title: `${TASK_TYPE_META[step.type].label}: ${t.topic}`, durationMinutes: minutes, priority: rankPriority(pick.s),
        topicId: t.id, subject: t.subject, chapter: t.chapter, topic: t.topic, source: "planner",
        reason: explain(pick.p, step.why),
      });
      virtual.set(t.id, step.advanceTo);
      scoreBoost.set(t.id, (scoreBoost.get(t.id) ?? 0) - Math.max(18, pick.s * 0.45));
    }
  }

  return { tasks: [...kept, ...newTasks], priorities, observations, recommendations, finalPrep, daysLeft };
}

function rankPriority(score: number): Priority {
  return score >= 60 ? "high" : score >= 38 ? "medium" : "low";
}

/** First-pass study time by difficulty. */
export const LEARN_MINUTES = { easy: 45, medium: 60, hard: 90 } as const;

function nextStep(cov: SyllabusTopic["coverage"], finalPrep: boolean, p: TopicPriority): { type: TaskType; minutes: number; advanceTo: SyllabusTopic["coverage"]; why: string } {
  const weakErrors = p.patterns.join(" ").toLowerCase();
  if (finalPrep) {
    if (cov === "not_started") return { type: "review_notes", minutes: 40, advanceTo: "learning", why: "high-yield summary only in the final week" };
    if (weakErrors.includes("calculation")) return { type: "timed_set", minutes: 30, advanceTo: "revised", why: "timed accuracy practice before the exam" };
    return { type: cov === "revised" ? "timed_set" : "active_recall", minutes: 25, advanceTo: "revised", why: "keep it fresh for exam day" };
  }
  switch (cov) {
    case "not_started":
      return { type: "learn", minutes: p.topic.estMinutes ?? LEARN_MINUTES[p.topic.difficulty], advanceTo: "learning", why: `first pass through the concept (${p.topic.difficulty} topic)` };
    case "learning":
      return { type: "practice", minutes: p.topic.difficulty === "hard" ? 60 : p.topic.difficulty === "easy" ? 30 : 45, advanceTo: "covered", why: "practice cements what you started learning" };
    case "covered":
      return weakErrors.includes("formula") || weakErrors.includes("recall")
        ? { type: "formula_review", minutes: 20, advanceTo: "revised", why: "recall errors showed up in tests" }
        : { type: "active_recall", minutes: 25, advanceTo: "revised", why: "retrieval practice to lock it in" };
    default:
      return { type: "timed_set", minutes: 30, advanceTo: "revised", why: "maintain speed and accuracy under time" };
  }
}

function explain(p: TopicPriority, why: string): string {
  const top = [...p.signals].filter((s) => s.points > 0).sort((a, b) => b.points - a.points).slice(0, 3).map((s) => s.label.toLowerCase());
  return `${cap(why)}. Priority from: ${top.join(", ")}.`;
}

/* ------------------------------------------------------------------ */
/* Readiness (explainable)                                             */
/* ------------------------------------------------------------------ */

export interface ReadinessSignal {
  id: string;
  label: string;
  /** 0..1 or null when there is no data yet. */
  value: number | null;
  display: string;
  detail: string;
  weight: number;
  tone: "good" | "ok" | "weak" | "none";
}

export interface Readiness {
  index: number | null;
  signals: ReadinessSignal[];
  trend: "improving" | "declining" | "flat" | "insufficient";
}

export function computeReadiness(input: {
  exam: Exam;
  topics: SyllabusTopic[];
  analyses: Analysis[];
  tasks: StudyTask[];
  revisions: RevisionItem[];
  notebook: NotebookEntry[];
  observations: Observation[];
  today: string;
}): Readiness {
  const { exam, today } = input;
  const topics = input.topics.filter((t) => t.examId === exam.id);
  const w = { high: 3, medium: 2, low: 1 };
  const covVal = { not_started: 0, learning: 0.5, covered: 1, revised: 1 };
  const totalW = topics.reduce((m, t) => m + w[t.priority], 0);
  const coverage = totalW ? topics.reduce((m, t) => m + w[t.priority] * covVal[t.coverage], 0) / totalW : null;

  const recent = input.analyses.slice(-2).map(scoreAnalysis);
  const attempted = recent.reduce((m, s) => m + s.attempted, 0);
  const correct = recent.reduce((m, s) => m + s.correct, 0);
  const accuracy = attempted ? correct / attempted : null;

  const percentages = input.analyses.map((a) => scoreAnalysis(a).percentage ?? 0);
  const trend = (() => {
    if (percentages.length < 2) return "insufficient" as const;
    const r = percentages.slice(-3);
    const slope = (r[r.length - 1] - r[0]) / (r.length - 1);
    return slope > 1.5 ? ("improving" as const) : slope < -1.5 ? ("declining" as const) : ("flat" as const);
  })();
  const trendVal = { improving: 1, flat: 0.6, declining: 0.3, insufficient: null }[trend];

  const dueRev = input.revisions.filter((r) => r.examId === exam.id && r.dueAt <= today);
  const revDone = dueRev.filter((r) => r.status === "done").length;
  const revision = dueRev.length ? revDone / dueRev.length : null;

  const weak = input.observations.filter((o) => o.chapter && (o.severity === "high" || o.severity === "medium"));
  const weakChapters = [...new Set(weak.map((o) => `${o.subject}::${o.chapter}`))];
  const lastAnalysisDate = input.analyses[input.analyses.length - 1]?.takenOn;
  const exposed = weakChapters.filter((k) => {
    const [, chapter] = k.split("::");
    return input.tasks.some((t) => t.status === "done" && t.chapter === chapter && (!lastAnalysisDate || (t.completedAt ?? "") >= lastAnalysisDate));
  });
  const exposure = weakChapters.length ? exposed.length / weakChapters.length : null;

  const nb = input.notebook.filter((n) => n.examId === exam.id || input.analyses.some((a) => a.id === n.analysisId));
  const resolved = nb.length ? nb.filter((n) => n.mastery === "mastered").length / nb.length : null;

  const tone = (v: number | null, good: number, ok: number): ReadinessSignal["tone"] => (v === null ? "none" : v >= good ? "good" : v >= ok ? "ok" : "weak");
  const pctS = (v: number | null) => (v === null ? "No data yet" : `${Math.round(v * 100)}%`);
  const signals: ReadinessSignal[] = [
    { id: "coverage", label: "Syllabus coverage", value: coverage, display: pctS(coverage), weight: 0.25, tone: tone(coverage, 0.8, 0.5),
      detail: topics.length ? `${topics.filter((t) => t.coverage === "covered" || t.coverage === "revised").length} of ${topics.length} topics covered (weighted by priority)` : "Add syllabus topics to track coverage" },
    { id: "accuracy", label: "Recent accuracy", value: accuracy, display: pctS(accuracy), weight: 0.25, tone: tone(accuracy, 0.75, 0.6),
      detail: attempted ? `${correct} correct of ${attempted} attempted across the last ${recent.length} analyzed test${recent.length === 1 ? "" : "s"}` : "Analyze a test to measure accuracy" },
    { id: "revision", label: "Revision completion", value: revision, display: pctS(revision), weight: 0.15, tone: tone(revision, 0.8, 0.5),
      detail: dueRev.length ? `${revDone} of ${dueRev.length} revision checkpoints due so far are done` : "No revision checkpoints due yet" },
    { id: "exposure", label: "Weak-topic exposure", value: exposure, display: exposure === null ? "No weak areas yet" : exposure >= 0.67 ? "High" : exposure >= 0.34 ? "Medium" : "Low", weight: 0.15, tone: tone(exposure, 0.67, 0.34),
      detail: weakChapters.length ? `${exposed.length} of ${weakChapters.length} weak chapters practised since the last test` : "Weak areas appear after your first analysis" },
    { id: "errors", label: "Errors resolved", value: resolved, display: pctS(resolved), weight: 0.1, tone: tone(resolved, 0.6, 0.3),
      detail: nb.length ? `${nb.filter((n) => n.mastery === "mastered").length} of ${nb.length} Error Notebook items mastered` : "No Error Notebook items yet" },
    { id: "trend", label: "Mock trend", value: trendVal, display: trend === "insufficient" ? "Need 2+ tests" : cap(trend), weight: 0.1, tone: trend === "improving" ? "good" : trend === "flat" ? "ok" : trend === "declining" ? "weak" : "none",
      detail: percentages.length >= 2 ? `Score % over last ${Math.min(3, percentages.length)} tests: ${percentages.slice(-3).map((p) => Math.round(p)).join(" → ")}` : "Analyze at least two tests to see a trend" },
  ];
  const avail = signals.filter((s) => s.value !== null);
  const wsum = avail.reduce((m, s) => m + s.weight, 0);
  const index = wsum >= 0.35 ? Math.round((avail.reduce((m, s) => m + s.weight * (s.value as number), 0) / wsum) * 100) : null;
  return { index, signals, trend };
}
