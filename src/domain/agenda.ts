/**
 * Agenda: one view of "what happens on which day", built from the same data every
 * screen uses. The dashboard, the calendar and the to-do list all read from here,
 * so a task ticked, added or moved in one place shows up everywhere at once.
 */
import type { AppData, Exam, NotebookEntry, StudyTask } from "./types";
import { addDays, daysBetween, parseISODate, toISODate } from "./util";

export interface DayAgenda {
  date: string;
  tasks: StudyTask[];
  /** Goal exams and mock tests on this day. */
  exams: Exam[];
  /** Error Notebook entries due for a retry on this day. */
  retries: NotebookEntry[];
  /** Marked as a day off in the planner (no study scheduled). */
  blocked: boolean;
  /** Study minutes available that weekday (0 when blocked). */
  capacity: number;
  plannedMinutes: number;
  doneMinutes: number;
  done: number;
  /** Tasks that count (everything except skipped). */
  total: number;
  /** Subjects of unfinished tasks, for the coloured dots. */
  subjects: string[];
}

type AgendaData = Pick<AppData, "tasks" | "exams" | "notebook" | "settings">;

/** Every day from `from` to `to` (inclusive), each with its tasks, exams and retries. */
export function buildAgenda(data: AgendaData, from: string, to: string): Map<string, DayAgenda> {
  const days = new Map<string, DayAgenda>();
  const { minutesByWeekday, blockedDates } = data.settings.planner;
  const blocked = new Set(blockedDates);
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const off = blocked.has(d);
    days.set(d, {
      date: d, tasks: [], exams: [], retries: [], blocked: off, capacity: off ? 0 : minutesByWeekday[parseISODate(d).getDay()] ?? 0,
      plannedMinutes: 0, doneMinutes: 0, done: 0, total: 0, subjects: [],
    });
  }
  for (const t of data.tasks) {
    const day = days.get(t.dueDate);
    if (!day) continue;
    day.tasks.push(t);
    if (t.status === "skipped") continue;
    day.total++;
    day.plannedMinutes += t.durationMinutes;
    if (t.status === "done") {
      day.done++;
      day.doneMinutes += t.durationMinutes;
    } else if (t.subject && !day.subjects.includes(t.subject)) day.subjects.push(t.subject);
  }
  for (const e of data.exams) if (!e.archived) days.get(e.date)?.exams.push(e);
  for (const n of data.notebook) if (n.nextRetryAt && n.mastery !== "mastered") days.get(n.nextRetryAt)?.retries.push(n);
  for (const day of days.values()) day.tasks.sort(byStatusThenPriority);
  return days;
}

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;
/** Unfinished first, then high → low priority, then shortest first. */
export function byStatusThenPriority(a: StudyTask, b: StudyTask): number {
  const rank = (t: StudyTask) => (t.status === "pending" ? 0 : t.status === "done" ? 1 : 2);
  return rank(a) - rank(b) || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.durationMinutes - b.durationMinutes;
}

/** "2026-10" → the 42 dates (6 weeks) shown in a month grid, weeks starting on `weekStartsOn` (1 = Monday). */
export function monthGrid(month: string, weekStartsOn = 1): string[] {
  const first = parseISODate(`${month}-01`);
  const lead = (first.getDay() - weekStartsOn + 7) % 7;
  const start = addDays(toISODate(first), -lead);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export const monthOf = (date: string) => date.slice(0, 7);

export function shiftMonth(month: string, by: number): string {
  const d = parseISODate(`${month}-01`);
  d.setMonth(d.getMonth() + by);
  return toISODate(d).slice(0, 7);
}

/** Weekday labels in grid order. */
export function weekdayLabels(weekStartsOn = 1, style: "short" | "narrow" = "short"): string[] {
  const sunday = parseISODate("2026-01-04"); // a Sunday
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday);
    d.setDate(d.getDate() + ((i + weekStartsOn) % 7));
    return d.toLocaleDateString(undefined, { weekday: style });
  });
}

/** Days in a row, ending today (or yesterday if nothing is done yet today), with at least one task finished. */
export function studyStreak(tasks: StudyTask[], today: string): number {
  const days = new Set(tasks.filter((t) => t.status === "done" && t.completedAt).map((t) => toISODate(new Date(t.completedAt!))));
  let d = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

export type TodoBucket = "overdue" | "today" | "tomorrow" | "week" | "later" | "done";

export const BUCKET_LABEL: Record<TodoBucket, string> = {
  overdue: "Overdue",
  today: "Today",
  tomorrow: "Tomorrow",
  week: "This week",
  later: "Later",
  done: "Done",
};

/**
 * Groups tasks for the to-do list. Finished tasks go to "done" (most recent first);
 * skipped tasks are left out; unfinished tasks from past days are "overdue".
 */
export function todoBuckets(tasks: StudyTask[], today: string): Record<TodoBucket, StudyTask[]> {
  const out: Record<TodoBucket, StudyTask[]> = { overdue: [], today: [], tomorrow: [], week: [], later: [], done: [] };
  for (const t of tasks) {
    if (t.status === "skipped") continue;
    if (t.status === "done") {
      out.done.push(t);
      continue;
    }
    const n = daysBetween(today, t.dueDate);
    out[n < 0 ? "overdue" : n === 0 ? "today" : n === 1 ? "tomorrow" : n <= 6 ? "week" : "later"].push(t);
  }
  const byDate = (a: StudyTask, b: StudyTask) => a.dueDate.localeCompare(b.dueDate) || byStatusThenPriority(a, b);
  for (const k of ["overdue", "today", "tomorrow", "week", "later"] as const) out[k].sort(byDate);
  out.done.sort((a, b) => (b.completedAt ?? b.dueDate).localeCompare(a.completedAt ?? a.dueDate));
  return out;
}

/** Minutes studied per day for the 7 days ending `today` (oldest first). */
export function lastSevenDays(tasks: StudyTask[], today: string): { date: string; planned: number; done: number }[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i - 6);
    const day = tasks.filter((t) => t.dueDate === date && t.status !== "skipped");
    return { date, planned: day.reduce((m, t) => m + t.durationMinutes, 0), done: day.filter((t) => t.status === "done").reduce((m, t) => m + t.durationMinutes, 0) };
  });
}
