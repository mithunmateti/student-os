/**
 * End-to-end domain test of the core loop on the seeded demo:
 * analysis → diagnosis → patterns → recommendations → adapted plan → readiness.
 */
import { describe, expect, it } from "vitest";
import { detectPatterns, explainChange, recommend, scoreAnalysis, topLossSources } from "./analysis";
import { buildDemoData } from "./demo/seed";
import { computeReadiness, generatePlan } from "./planner";
import { familyAnalyses, planInput, targetExams } from "./selectors";
import { addDays, daysBetween } from "./util";

const TODAY = "2026-09-25";
const data = buildDemoData(TODAY);
const target = targetExams(data)[0];
const family = familyAnalyses(data, target.id);

describe("seeded demo", () => {
  it("has a goal exam with four analyzed 100-question tests", () => {
    expect(family).toHaveLength(4);
    for (const a of family) {
      expect(a.questions).toHaveLength(100);
      const s = scoreAnalysis(a);
      expect(s.correct + s.wrong + s.unattempted).toBe(100);
      expect(a.snapshot?.score).toBe(s.score);
    }
  });
  it("mixes outcomes and error types", () => {
    const latest = family[3];
    const s = scoreAnalysis(latest);
    expect(s.correct).toBeGreaterThan(30);
    expect(s.wrong).toBeGreaterThan(8);
    expect(s.unattempted).toBeGreaterThan(5);
    const errs = new Set(Object.values(latest.responses).map((r) => r.errorPrimary).filter(Boolean));
    for (const e of ["calculation", "conceptual", "time", "bubbling", "guess"]) expect(errs.has(e)).toBe(true);
  });
});

describe("analysis → plan loop", () => {
  const obs = detectPatterns(family, data.settings.errorCategories);
  it("detects evidence-linked patterns across tests", () => {
    const kin = obs.find((o) => o.kind === "recurring_error" && o.chapter === "Kinematics" && o.errorType === "calculation");
    expect(kin).toBeDefined();
    expect(kin!.refs.length).toBeGreaterThanOrEqual(3);
    expect(kin!.evidence).toMatch(/of your \d+ lost Kinematics questions/);
    expect(obs.some((o) => o.kind === "bubbling")).toBe(true);
    expect(obs.some((o) => o.kind === "time_pressure")).toBe(true);
  });
  it("turns patterns into concrete actions with reasons", () => {
    const recs = recommend(obs, data.settings.errorCategories);
    const drill = recs.find((r) => r.title.includes("Calculation drill: Kinematics"));
    expect(drill?.taskType).toBe("practice");
    expect(drill?.reason).toMatch(/Kinematics/);
    const process = recs.find((r) => r.observationId === "bubbling");
    expect(process?.taskType).toBe("strategy");
    expect(process?.checklist?.length).toBeGreaterThan(0);
  });
  it("adapts the plan: analysis tasks appear and weak chapters rise", () => {
    const input = planInput(data, target.id, TODAY)!;
    const before = generatePlan({ ...input, analyses: [], tasks: [] });
    const after = generatePlan({ ...input, tasks: [] });
    expect(after.tasks.some((t) => t.source === "analysis" && t.chapter === "Kinematics")).toBe(true);
    const rank = (p: typeof before.priorities, ch: string) => p.findIndex((x) => x.topic.chapter === ch);
    expect(rank(after.priorities, "Kinematics")).toBeLessThan(rank(before.priorities, "Kinematics"));
    for (const t of after.tasks) {
      expect(t.reason.length).toBeGreaterThan(10);
      expect(daysBetween(TODAY, t.dueDate)).toBeGreaterThanOrEqual(0);
      expect(t.dueDate < target.date).toBe(true);
    }
  });
  it("respects daily capacity (± one task of overflow)", () => {
    const plan = generatePlan({ ...planInput(data, target.id, TODAY)!, tasks: [] });
    const byDay = new Map<string, number>();
    for (const t of plan.tasks) byDay.set(t.dueDate, (byDay.get(t.dueDate) ?? 0) + t.durationMinutes);
    for (const [d, mins] of byDay) {
      const cap = data.settings.planner.minutesByWeekday[new Date(d + "T12:00:00").getDay()];
      expect(mins).toBeLessThanOrEqual(Math.max(cap + 90, 200));
    }
  });
  it("switches to final-prep mode inside 7 days", () => {
    const input = planInput(data, target.id, addDays(target.date, -5))!;
    const plan = generatePlan({ ...input, tasks: [] });
    expect(plan.finalPrep).toBe(true);
    expect(plan.tasks.some((t) => t.type === "learn" && t.priority !== "high")).toBe(false);
  });
  it("schedules the upcoming revision test and its analysis", () => {
    const plan = generatePlan({ ...planInput(data, target.id, TODAY)!, tasks: [] });
    expect(plan.tasks.some((t) => t.title === "Sit JEE Revision Test 05")).toBe(true);
    expect(plan.tasks.some((t) => t.title === "Analyze JEE Revision Test 05 in Exam Analyzer")).toBe(true);
  });
  it("explains readiness with transparent signals", () => {
    const r = computeReadiness({ exam: target, topics: data.topics, analyses: family, tasks: data.tasks, revisions: data.revisions, notebook: data.notebook, observations: obs, today: TODAY });
    expect(r.index).not.toBeNull();
    expect(r.signals.map((s) => s.id)).toEqual(["coverage", "accuracy", "revision", "exposure", "errors", "trend"]);
    expect(r.signals.find((s) => s.id === "accuracy")!.detail).toMatch(/correct of \d+ attempted/);
  });
  it("explains score changes between tests and ranks loss sources", () => {
    const e = explainChange(scoreAnalysis(family[3]), scoreAnalysis(family[2]));
    expect(e.narrative).toMatch(/mainly because|stayed the same/);
    const top = topLossSources(family[3], scoreAnalysis(family[3]), data.settings.errorCategories);
    expect(top[0].forfeited).toBeGreaterThanOrEqual(top[top.length - 1].forfeited);
  });
});

describe("multiple goal exams", () => {
  it("splits daily study time by priority and urgency instead of double-booking", async () => {
    const { capacityShare } = await import("./selectors");
    const second = { ...target, id: "exam_second", name: "Board exam", date: addDays(TODAY, 10), priority: "medium" as const };
    const d2 = { ...data, exams: [...data.exams, second], topics: [...data.topics, { ...data.topics[0], id: "t2", examId: second.id }] };
    const a = capacityShare(d2, target.id, TODAY);
    const b = capacityShare(d2, second.id, TODAY);
    expect(a + b).toBeCloseTo(1);
    expect(b).toBeGreaterThan(0.5); // close exam doubles its weight
    const plan = generatePlan(planInput(d2, target.id, TODAY)!);
    const todayMins = plan.tasks.filter((t) => t.dueDate === TODAY && t.status === "pending" && t.source !== "user").reduce((m, t) => m + t.durationMinutes, 0);
    expect(todayMins).toBeLessThanOrEqual(Math.round(data.settings.planner.minutesByWeekday[new Date(TODAY + "T12:00:00").getDay()] * a) + 60);
  });
});
