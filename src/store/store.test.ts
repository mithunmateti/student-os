/**
 * Store-level tests: the actions the UI calls, run against the real planner.
 * They cover the student-facing flows added most recently (syllabus import,
 * difficulty, quick add, topic to-do list) plus plan invariants.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "./store";
import { LEARN_MINUTES } from "@/domain/planner";
import { addDays, parseISODate, today } from "@/domain/util";
import type { SyllabusTopic } from "@/domain/types";

type NewTopic = Omit<SyllabusTopic, "id" | "examId">;
const topic = (subject: string, chapter: string, difficulty: NewTopic["difficulty"] = "medium"): NewTopic => ({
  subject, chapter, topic: chapter, priority: "medium", difficulty, coverage: "not_started",
});
// The student's real syllabus notice (Minor Test 5), as it should look after import.
const NOTICE: NewTopic[] = [
  ...["Basic Maths", "Quadratic Equations and Logarithms", "Trigonometry & Differential Calculus", "Integral Calculus", "Graphs & Geometry", "Vectors", "Kinematics", "Motion Under Gravity", "Circular Motion", "Force and Laws of Motion", "Friction"].map((c) => topic("Physics", c)),
  ...["Mole Concept & Stoichiometry", "Concentration Units", "Redox Reactions", "Chemical Equilibrium"].map((c) => topic("Chemistry", c)),
  topic("Mathematics", "Basic Maths and Surds"),
];

const st = () => useStore.getState();
function newExam(topics: NewTopic[] = NOTICE, daysAway = 45) {
  return st().createExam({
    name: "Minor Test 6", date: addDays(today(), daysAway), durationMinutes: 180, subjects: ["Physics", "Chemistry", "Mathematics"],
    sections: [{ id: "s1", name: "Section 1", ordering: 0, rule: st().settings.defaultRule }], priority: "high", status: "upcoming", examType: "Competitive entrance",
  }, topics);
}
const tasksOf = (examId: string) => st().tasks.filter((t) => t.examId === examId);
const topicsOf = (examId: string) => st().topics.filter((t) => t.examId === examId);
const learnTask = (examId: string, topicId: string) => tasksOf(examId).find((t) => t.topicId === topicId && t.type === "learn");

beforeEach(() => st().startFresh("Tester"));

describe("starting fresh", () => {
  it("has no exams, topics or tasks, and is onboarded", () => {
    expect(st().exams).toHaveLength(0);
    expect(st().topics).toHaveLength(0);
    expect(st().tasks).toHaveLength(0);
    expect(st().settings.onboarded).toBe(true);
    expect(st().settings.studentName).toBe("Tester");
  });
});

describe("creating an exam from an imported syllabus", () => {
  it("stores exactly the imported topics and builds a plan from them", () => {
    const id = newExam();
    expect(topicsOf(id).map((t) => t.topic)).toEqual(NOTICE.map((t) => t.topic));
    const tasks = tasksOf(id);
    expect(tasks.length).toBeGreaterThan(0);
    // Every planned topic task refers to one of the imported topics.
    const ids = new Set(topicsOf(id).map((t) => t.id));
    for (const t of tasks.filter((x) => x.topicId)) expect(ids.has(t.topicId!)).toBe(true);
  });

  it("never plans more study on a day than the student has available", () => {
    const id = newExam();
    const cap = st().settings.planner.minutesByWeekday;
    const byDay = new Map<string, number>();
    for (const t of tasksOf(id).filter((x) => x.type !== "mock_test")) byDay.set(t.dueDate, (byDay.get(t.dueDate) ?? 0) + t.durationMinutes);
    for (const [day, mins] of byDay) expect(mins, `planned ${mins} min on ${day}`).toBeLessThanOrEqual(cap[parseISODate(day).getDay()]);
  });

  it("schedules a first study session for every topic within the planning window (18 topics, 45 days)", () => {
    const id = newExam();
    const unscheduled = topicsOf(id).filter((t) => !learnTask(id, t.id)).map((t) => t.topic);
    expect(unscheduled).toEqual([]);
  });

  it("plans nothing after the exam date", () => {
    const id = newExam(NOTICE, 5);
    const exam = st().exams.find((e) => e.id === id)!;
    for (const t of tasksOf(id)) expect(t.dueDate <= exam.date).toBe(true);
  });
});

describe("difficulty", () => {
  it("sets first-study time to 45 / 60 / 90 minutes for easy / medium / hard", () => {
    const id = newExam();
    const vectors = topicsOf(id).find((t) => t.topic === "Vectors")!;
    expect(learnTask(id, vectors.id)?.durationMinutes).toBe(LEARN_MINUTES.medium);
    st().setTopicDifficulty(vectors.id, "hard");
    expect(topicsOf(id).find((t) => t.id === vectors.id)!.difficulty).toBe("hard");
    expect(learnTask(id, vectors.id)?.durationMinutes).toBe(90);
    st().setTopicDifficulty(vectors.id, "easy");
    expect(learnTask(id, vectors.id)?.durationMinutes).toBe(45);
  });

  it("schedules hard topics no later than equally weighted easy ones", () => {
    const id = newExam([topic("Physics", "Easy one", "easy"), topic("Physics", "Hard one", "hard")]);
    const [easy, hard] = topicsOf(id);
    const e = learnTask(id, easy.id)!, h = learnTask(id, hard.id)!;
    expect(h.dueDate <= e.dueDate).toBe(true);
  });

  it("keeps finished tasks when difficulty changes", () => {
    const id = newExam();
    const first = tasksOf(id).find((t) => t.type === "learn")!;
    st().toggleTask(first.id);
    const other = topicsOf(id).find((t) => t.id !== first.topicId)!;
    st().setTopicDifficulty(other.id, "hard");
    expect(st().tasks.find((t) => t.id === first.id)?.status).toBe("done");
  });
});

describe("Today: quick add and ticking off", () => {
  it("adds the student's own task for today and keeps it when the plan is rebuilt", () => {
    const id = newExam();
    st().addTask({ examId: id, title: "Coaching DPP", type: "practice", dueDate: today(), durationMinutes: 30, priority: "medium", subject: "Chemistry", reason: "Added by you." });
    const mine = st().tasks.find((t) => t.title === "Coaching DPP")!;
    expect(mine.source).toBe("user");
    expect(mine.status).toBe("pending");
    st().regeneratePlan(id);
    expect(st().tasks.find((t) => t.id === mine.id)).toBeDefined();
  });

  it("finishing a first study session moves the topic to 'learning' and schedules revision", () => {
    const id = newExam();
    const learn = tasksOf(id).find((t) => t.type === "learn")!;
    st().toggleTask(learn.id);
    const t = topicsOf(id).find((x) => x.id === learn.topicId)!;
    expect(t.coverage).not.toBe("not_started");
    expect(st().revisions.some((r) => r.topicId === t.id)).toBe(true);
    // Un-ticking reverts the task (but revision stays: the student did study it).
    st().toggleTask(learn.id);
    expect(st().tasks.find((x) => x.id === learn.id)?.status).toBe("pending");
  });
});

describe("topic to-do list", () => {
  it("ticking a topic marks it covered and takes it out of the 'learn' queue", () => {
    const id = newExam();
    const t = topicsOf(id)[0];
    st().setCoverage(t.id, "covered");
    st().regeneratePlan(id);
    expect(topicsOf(id).find((x) => x.id === t.id)!.coverage).toBe("covered");
    expect(learnTask(id, t.id)).toBeUndefined();
  });

  it("un-ticking puts the topic back to not started", () => {
    const id = newExam();
    const t = topicsOf(id)[0];
    st().setCoverage(t.id, "covered");
    st().setCoverage(t.id, "not_started");
    expect(topicsOf(id).find((x) => x.id === t.id)!.coverage).toBe("not_started");
  });
});

describe("replacing and deleting the syllabus", () => {
  it("replaceTopics swaps every topic and drops tasks for the old ones", () => {
    const id = newExam([topic("Physics", "Old template chapter"), topic("Chemistry", "Another old one")]);
    const oldIds = new Set(topicsOf(id).map((t) => t.id));
    st().replaceTopics(id, NOTICE);
    expect(topicsOf(id)).toHaveLength(NOTICE.length);
    expect(tasksOf(id).some((t) => t.topicId && oldIds.has(t.topicId))).toBe(false);
  });

  it("deleting every topic leaves no topic tasks behind", () => {
    const id = newExam();
    st().deleteTopics(topicsOf(id).map((t) => t.id));
    expect(topicsOf(id)).toHaveLength(0);
    expect(tasksOf(id).filter((t) => t.topicId && t.status === "pending")).toHaveLength(0);
  });

  it("deleting the exam removes its topics, tasks and revisions", () => {
    const id = newExam();
    st().toggleTask(tasksOf(id).find((t) => t.type === "learn")!.id);
    st().deleteExam(id);
    expect(st().exams).toHaveLength(0);
    expect(st().topics).toHaveLength(0);
    expect(st().tasks).toHaveLength(0);
    expect(st().revisions).toHaveLength(0);
  });
});

describe("multiple goal exams", () => {
  it("never double-books a day across two goal exams", () => {
    newExam(NOTICE, 30);
    newExam(NOTICE.map((t) => ({ ...t })), 50);
    const cap = st().settings.planner.minutesByWeekday;
    const byDay = new Map<string, number>();
    for (const t of st().tasks.filter((x) => x.type !== "mock_test")) byDay.set(t.dueDate, (byDay.get(t.dueDate) ?? 0) + t.durationMinutes);
    for (const [day, mins] of byDay) expect(mins, `planned ${mins} min on ${day}`).toBeLessThanOrEqual(cap[parseISODate(day).getDay()]);
  });
});

describe("calendar and to-do actions", () => {
  it("taking a day off moves planned work elsewhere but keeps the student's own tasks", () => {
    const id = newExam();
    const day = addDays(today(), 2);
    st().addTask({ examId: id, title: "School trip prep", type: "practice", dueDate: day, durationMinutes: 30, priority: "medium", reason: "" });
    expect(tasksOf(id).filter((t) => t.dueDate === day && t.source !== "user").length).toBeGreaterThan(0);
    st().setDayOff(day, true);
    expect(st().settings.planner.blockedDates).toContain(day);
    expect(tasksOf(id).filter((t) => t.dueDate === day).map((t) => t.title)).toEqual(["School trip prep"]);
    st().setDayOff(day, false);
    expect(st().settings.planner.blockedDates).not.toContain(day);
    expect(tasksOf(id).filter((t) => t.dueDate === day && t.source !== "user").length).toBeGreaterThan(0);
  });

  it("editing a planned task pins it, so rebuilding the plan keeps the edit", () => {
    const id = newExam();
    const t = tasksOf(id).find((x) => x.status === "pending" && x.source === "planner")!;
    const later = addDays(today(), 3);
    st().updateTask(t.id, { title: "Kinematics with coaching notes", dueDate: later, durationMinutes: 50 });
    st().regeneratePlan(id);
    const after = st().tasks.find((x) => x.id === t.id)!;
    expect([after.title, after.dueDate, after.durationMinutes, after.pinned]).toEqual(["Kinematics with coaching notes", later, 50, true]);
  });
});
