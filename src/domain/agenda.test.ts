/** The shared calendar / to-do logic that the dashboard, Calendar and To-do pages all read. */
import { describe, expect, it } from "vitest";
import { buildAgenda, lastSevenDays, monthGrid, shiftMonth, studyStreak, todoBuckets } from "./agenda";
import type { Exam, NotebookEntry, Settings, StudyTask } from "./types";

const T = "2026-10-02"; // a Friday
let n = 0;
const task = (dueDate: string, patch: Partial<StudyTask> = {}): StudyTask => ({
  id: `t${++n}`, examId: "e1", type: "practice", title: `Task ${n}`, dueDate, durationMinutes: 30, priority: "medium", status: "pending", reason: "", source: "planner", ...patch,
});
const settings = { planner: { minutesByWeekday: [60, 120, 120, 120, 120, 120, 90], blockedDates: ["2026-10-04"], mockEveryDays: 0, revisionShare: 0.3, horizonDays: 14 } } as unknown as Settings;
const exam = { id: "e1", name: "JEE Main", date: "2026-10-05", archived: false } as Exam;
const retry = { id: "n1", nextRetryAt: "2026-10-03", mastery: "reviewing" } as NotebookEntry;

describe("buildAgenda", () => {
  const tasks = [
    task(T, { subject: "Physics" }),
    task(T, { subject: "Chemistry", status: "done", durationMinutes: 45 }),
    task(T, { status: "skipped" }),
    task("2026-10-05", { subject: "Physics" }),
    task("2026-11-01"),
  ];
  const a = buildAgenda({ tasks, exams: [exam], notebook: [retry], settings }, T, "2026-10-05");

  it("has one entry per day in the range, and nothing outside it", () => {
    expect([...a.keys()]).toEqual(["2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05"]);
  });
  it("counts tasks, minutes and done work, ignoring skipped tasks", () => {
    const day = a.get(T)!;
    expect(day.tasks).toHaveLength(3);
    expect([day.done, day.total, day.plannedMinutes, day.doneMinutes]).toEqual([1, 2, 75, 45]);
    expect(day.subjects).toEqual(["Physics"]); // only subjects still to study
    expect(day.tasks[0].status).toBe("pending"); // unfinished first
  });
  it("puts exams, mistake retries and days off on the right days", () => {
    expect(a.get("2026-10-05")!.exams.map((e) => e.name)).toEqual(["JEE Main"]);
    expect(a.get("2026-10-03")!.retries).toHaveLength(1);
    expect(a.get("2026-10-04")!.blocked).toBe(true);
    expect(a.get("2026-10-04")!.capacity).toBe(0);
    expect(a.get(T)!.capacity).toBe(120); // Friday
  });
});

describe("month grid", () => {
  it("starts on the Monday on or before the 1st and covers six weeks", () => {
    const g = monthGrid("2026-10");
    expect(g).toHaveLength(42);
    expect(g[0]).toBe("2026-09-28"); // 1 Oct 2026 is a Thursday
    expect(g).toContain("2026-10-31");
  });
  it("moves between months across year ends", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
});

describe("study streak", () => {
  const at = (date: string) => `${date}T10:00:00`;
  it("counts consecutive days with something finished, up to today", () => {
    const tasks = [T, "2026-10-01", "2026-09-30", "2026-09-28"].map((d) => task(d, { status: "done", completedAt: at(d) }));
    expect(studyStreak(tasks, T)).toBe(3);
  });
  it("still counts yesterday's streak before today's first task is done", () => {
    expect(studyStreak([task("2026-10-01", { status: "done", completedAt: at("2026-10-01") })], T)).toBe(1);
    expect(studyStreak([], T)).toBe(0);
  });
});

describe("to-do buckets", () => {
  it("sorts every task into overdue, today, tomorrow, this week, later or done", () => {
    const b = todoBuckets([
      task("2026-09-30"), task(T), task("2026-10-03"), task("2026-10-08"), task("2026-10-09"),
      task("2026-09-29", { status: "done", completedAt: "2026-09-29T09:00:00" }), task(T, { status: "skipped" }),
    ], T);
    expect(Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.length]))).toEqual({ overdue: 1, today: 1, tomorrow: 1, week: 1, later: 1, done: 1 });
  });
});

describe("last seven days", () => {
  it("returns planned and studied minutes for each of the last 7 days", () => {
    const w = lastSevenDays([task(T, { status: "done" }), task(T), task("2026-09-26", { status: "done", durationMinutes: 60 })], T);
    expect(w.map((x) => x.date)).toEqual(["2026-09-26", "2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"]);
    expect(w[6]).toEqual({ date: T, planned: 60, done: 30 });
    expect(w[0].done).toBe(60);
  });
});
