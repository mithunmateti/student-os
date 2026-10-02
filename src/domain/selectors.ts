/** Pure selectors over the persisted AppData. */
import { generatePlan, type PlanInput, type PlanOutput, type TopicPriority } from "./planner";
import type { AppData, Analysis, Exam, PlanChange, StudyTask } from "./types";
import { daysBetween, today as todayFn, uid } from "./util";

export function isFinalized(a: Analysis): boolean {
  return !!a.finalizedAt;
}

/** The goal exam an exam belongs to (itself if it has no parent). */
export function rootExamId(data: Pick<AppData, "exams">, examId: string): string {
  const e = data.exams.find((x) => x.id === examId);
  return e?.parentExamId ?? examId;
}

/** Exams that own a preparation plan (goal exams, not mocks). */
export function targetExams(data: Pick<AppData, "exams">): Exam[] {
  return data.exams.filter((e) => !e.parentExamId && !e.archived);
}

export function childExams(data: Pick<AppData, "exams">, examId: string): Exam[] {
  return data.exams.filter((e) => e.parentExamId === examId && !e.archived);
}

/** Finalized analyses that feed a goal exam's plan, oldest → newest. */
export function familyAnalyses(data: Pick<AppData, "exams" | "analyses">, targetId: string): Analysis[] {
  const ids = new Set([targetId, ...data.exams.filter((e) => e.parentExamId === targetId).map((e) => e.id)]);
  return data.analyses
    .filter((a) => ids.has(a.examId) && isFinalized(a))
    .sort((a, b) => a.takenOn.localeCompare(b.takenOn) || a.createdAt.localeCompare(b.createdAt));
}

export function allFinalized(data: Pick<AppData, "analyses">): Analysis[] {
  return data.analyses.filter(isFinalized).sort((a, b) => a.takenOn.localeCompare(b.takenOn) || a.createdAt.localeCompare(b.createdAt));
}

export function upcomingExams(data: Pick<AppData, "exams">, ref = todayFn()): Exam[] {
  return data.exams
    .filter((e) => !e.archived && daysBetween(ref, e.date) >= 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Share of daily study time a goal exam gets when several are being prepared at once:
 * weighted by priority and doubled inside the final two weeks.
 */
export function capacityShare(data: Pick<AppData, "exams" | "topics">, examId: string, ref = todayFn()): number {
  const active = targetExams(data).filter((e) => daysBetween(ref, e.date) >= 0 && data.topics.some((t) => t.examId === e.id));
  if (active.length <= 1 || !active.some((e) => e.id === examId)) return 1;
  const w = (e: Exam) => ({ high: 3, medium: 2, low: 1 })[e.priority] * (daysBetween(ref, e.date) <= 14 ? 2 : 1);
  const total = active.reduce((m, e) => m + w(e), 0);
  return w(active.find((e) => e.id === examId)!) / total;
}

export function planInput(data: AppData, examId: string, ref = todayFn()): PlanInput | null {
  const exam = data.exams.find((e) => e.id === examId);
  if (!exam) return null;
  const share = capacityShare(data, examId, ref);
  const prefs = share < 1
    ? { ...data.settings.planner, minutesByWeekday: data.settings.planner.minutesByWeekday.map((m) => Math.round((m * share) / 5) * 5) }
    : data.settings.planner;
  return {
    exam,
    topics: data.topics,
    analyses: familyAnalyses(data, examId),
    tasks: data.tasks,
    revisions: data.revisions,
    notebook: data.notebook,
    prefs,
    revisionCfg: data.settings.revision,
    categories: data.settings.errorCategories,
    today: ref,
    childExams: childExams(data, examId),
  };
}

/** Regenerate one goal exam's plan; returns the next full task list for the whole app. */
export function regenerate(data: AppData, examId: string, ref = todayFn()): { tasks: StudyTask[]; plan: PlanOutput } | null {
  const input = planInput(data, examId, ref);
  if (!input) return null;
  const plan = generatePlan(input);
  const others = data.tasks.filter((t) => t.examId !== examId);
  return { tasks: [...others, ...plan.tasks], plan };
}

/** Human summary of how the plan adapted after new evidence. */
export function describeAdaptation(
  examId: string,
  trigger: string,
  before: TopicPriority[] | null,
  after: PlanOutput,
  newTaskTitles: string[],
): PlanChange {
  const details: string[] = [];
  if (before) {
    const rankBefore = new Map(before.map((p, i) => [p.topic.id, i]));
    const signalsBefore = new Map(before.map((p) => [p.topic.id, new Set(p.signals.map((x) => x.label))]));
    const risers = after.priorities
      .slice(0, 12)
      .map((p, i) => ({ p, i, was: rankBefore.get(p.topic.id) ?? 999 }))
      .filter((x) => x.was - x.i >= 5)
      .slice(0, 4);
    for (const r of risers) {
      const prevLabels = signalsBefore.get(r.p.topic.id) ?? new Set<string>();
      const fresh = r.p.signals.filter((s) => s.points > 0 && !prevLabels.has(s.label)).sort((a, b) => b.points - a.points);
      const why = fresh[0] ?? r.p.signals.filter((s) => s.points > 0).sort((a, b) => b.points - a.points)[0];
      details.push(`↑ ${r.p.topic.chapter}: ${r.p.topic.topic} moved from #${r.was + 1} to #${r.i + 1}${why ? ` (${why.label.toLowerCase()})` : ""}`);
    }
  }
  const seen = new Set<string>();
  for (const t of newTaskTitles) {
    const base = t.replace(/\s*\(\d+\/\d+\)$/, "");
    if (seen.has(base)) continue;
    seen.add(base);
    details.push(`+ ${base}`);
  }
  const strengths = after.observations.filter((o) => o.severity === "positive").slice(0, 1);
  for (const s of strengths) details.push(`↓ ${s.chapter}: lighter practice — ${s.evidence.split(".")[0].toLowerCase()}`);
  return {
    id: uid("chg"),
    examId,
    at: new Date().toISOString(),
    trigger,
    summary: `${seen.size} evidence-based task${seen.size === 1 ? "" : "s"} added${details.some((d) => d.startsWith("↑")) ? ", topic priorities re-ranked" : ""}.`,
    details: details.slice(0, 12),
  };
}
