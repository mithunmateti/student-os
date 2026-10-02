import { describe, expect, it } from "vitest";
import { scorePaper, scoreQuestion, resolveRule, parseNumerical } from "./scoring";
import type { ExamSection, QResponse, Question } from "./types";

const sec = (id: string, correct = 4, wrong = 1, unattempted = 0, extra: Partial<ExamSection> = {}): ExamSection => ({
  id, name: id, ordering: 0, rule: { correct, wrong, unattempted }, ...extra,
});

let n = 0;
const q = (over: Partial<Question> = {}): Question => {
  n++;
  return {
    id: `q${n}`, index: n, number: n, sectionId: "s1", subject: "Physics", chapter: "Kinematics", topic: "",
    type: "single", text: "", options: ["A", "B", "C", "D"].map((key) => ({ key, text: key })),
    correctAnswer: ["B"], confidence: {}, reviewed: true, ...over,
  };
};
const resp = (question: Question, selected: string[] = [], extra: Partial<QResponse> = {}): QResponse => ({
  questionId: question.id, selected, entered: true, ...extra,
});

describe("scoreQuestion", () => {
  const rule = { correct: 4, wrong: 1, unattempted: 0 };
  it("awards correct marks", () => {
    const x = q();
    const r = scoreQuestion(x, resp(x, ["B"]), rule);
    expect(r).toMatchObject({ status: "correct", awarded: 4, max: 4, gained: 4, penalty: 0, forfeited: 0 });
  });
  it("applies wrong-answer penalty", () => {
    const x = q();
    expect(scoreQuestion(x, resp(x, ["A"]), rule)).toMatchObject({ status: "wrong", awarded: -1, penalty: 1, forfeited: 5 });
  });
  it("treats empty selection as unattempted", () => {
    const x = q();
    expect(scoreQuestion(x, resp(x, []), rule)).toMatchObject({ status: "unattempted", awarded: 0, forfeited: 4, attempted: false });
    expect(scoreQuestion(x, undefined, rule).status).toBe("unattempted");
  });
  it("supports non-zero unattempted marks", () => {
    const x = q();
    expect(scoreQuestion(x, resp(x), { correct: 3, wrong: 1, unattempted: 0.5 }).awarded).toBe(0.5);
  });
  it("handles decimal penalties without float noise", () => {
    const qs = [q(), q(), q()];
    const s = scorePaper([sec("s1", 1, 0.25)], qs, Object.fromEntries(qs.map((x) => [x.id, resp(x, ["A"])])));
    expect(s.score).toBe(-0.75);
    expect(s.negativeImpact).toBe(0.75);
  });
  it("accepts any key when a single-choice question accepts several answers (key correction)", () => {
    const x = q({ correctAnswer: ["A", "C"] });
    expect(scoreQuestion(x, resp(x, ["C"]), rule).status).toBe("correct");
    expect(scoreQuestion(x, resp(x, ["A", "C"]), rule).status).toBe("wrong"); // two bubbles on a single-choice
  });
  it("scores multiple-correct with and without partial marking", () => {
    const x = q({ type: "multiple", correctAnswer: ["A", "C", "D"] });
    const partial = { correct: 4, wrong: 2, unattempted: 0, partial: { enabled: true, perCorrectOption: 1 } };
    expect(scoreQuestion(x, resp(x, ["A", "C", "D"]), partial)).toMatchObject({ status: "correct", awarded: 4 });
    expect(scoreQuestion(x, resp(x, ["A", "C"]), partial)).toMatchObject({ status: "partial", awarded: 2, forfeited: 2 });
    expect(scoreQuestion(x, resp(x, ["A", "B"]), partial)).toMatchObject({ status: "wrong", awarded: -2 });
    expect(scoreQuestion(x, resp(x, ["A", "C"]), { correct: 4, wrong: 2, unattempted: 0 })).toMatchObject({ status: "wrong", awarded: -2 });
  });
  it("scores numerical answers with tolerance and fractions", () => {
    const x = q({ type: "numerical", options: [], correctAnswer: [], numericalAnswer: { value: 0.75, tolerance: 0.01 } });
    expect(scoreQuestion(x, resp(x, [], { numerical: "0.755" }), rule).status).toBe("correct");
    expect(scoreQuestion(x, resp(x, [], { numerical: "3/4" }), rule).status).toBe("correct");
    expect(scoreQuestion(x, resp(x, [], { numerical: "0.8" }), rule).status).toBe("wrong");
    expect(scoreQuestion(x, resp(x, [], { numerical: "  " }), rule).status).toBe("unattempted");
  });
  it("handles bonus, dropped and unkeyed questions", () => {
    const b = q({ bonus: true });
    const d = q({ dropped: true });
    const u = q({ correctAnswer: [] });
    expect(scoreQuestion(b, resp(b, ["A"]), rule)).toMatchObject({ status: "bonus", awarded: 4, max: 4 });
    expect(scoreQuestion(d, resp(d, ["A"]), rule)).toMatchObject({ status: "dropped", awarded: 0, max: 0 });
    expect(scoreQuestion(u, resp(u, ["A"]), rule)).toMatchObject({ status: "unkeyed", awarded: 0, max: 0 });
  });
});

describe("resolveRule", () => {
  it("prefers question override, then section, then default", () => {
    const x = q({ sectionId: "s2", ruleOverride: { wrong: 0 } });
    expect(resolveRule(x, [sec("s2", 3, 1)])).toEqual({ correct: 3, wrong: 0, unattempted: 0, partial: undefined });
    expect(resolveRule(q({ sectionId: "missing" }), [])).toEqual({ correct: 4, wrong: 1, unattempted: 0 });
  });
});

describe("scorePaper", () => {
  it("computes the full exam summary with explicit denominators", () => {
    const qs = Array.from({ length: 10 }, () => q());
    const answers = ["B", "B", "B", "B", "B", "B", "A", "A", "", ""]; // 6 correct, 2 wrong, 2 blank
    const responses = Object.fromEntries(qs.map((x, i) => [x.id, resp(x, answers[i] ? [answers[i]] : [])]));
    const s = scorePaper([sec("s1")], qs, responses);
    expect(s.score).toBe(22);
    expect(s.maxScore).toBe(40);
    expect(s.percentage).toBe(55);
    expect(s.correct).toBe(6);
    expect(s.wrong).toBe(2);
    expect(s.unattempted).toBe(2);
    expect(s.attempted).toBe(8);
    expect(s.attemptRate).toBeCloseTo(0.8);
    expect(s.accuracy).toBeCloseTo(0.75);
    expect(s.grossPositive).toBe(24);
    expect(s.grossNegative).toBe(-2);
    expect(s.negativeImpact).toBe(2);
    expect(s.forfeitedWrong).toBe(10);
    expect(s.forfeitedUnattempted).toBe(8);
  });
  it("returns null accuracy when nothing is attempted", () => {
    const qs = [q(), q()];
    const s = scorePaper([sec("s1")], qs, {});
    expect(s.accuracy).toBeNull();
    expect(s.attemptRate).toBe(0);
    expect(s.notEntered).toBe(2);
  });
  it("applies section-specific rules", () => {
    const a = q({ sectionId: "s1" });
    const b = q({ sectionId: "s2" });
    const s = scorePaper([sec("s1", 4, 1), sec("s2", 3, 0)], [a, b], { [a.id]: resp(a, ["A"]), [b.id]: resp(b, ["A"]) });
    expect(s.score).toBe(-1);
    expect(s.maxScore).toBe(7);
  });
  it("counts only the first N attempts in an optional section", () => {
    const qs = [q({ sectionId: "opt" }), q({ sectionId: "opt" }), q({ sectionId: "opt" })];
    const s = scorePaper([sec("opt", 4, 1, 0, { maxAttemptsCounted: 2 })], qs, Object.fromEntries(qs.map((x) => [x.id, resp(x, ["B"])])));
    expect(s.score).toBe(8);
    expect(s.notCounted).toBe(1);
  });
  it("is deterministic regardless of question order", () => {
    const qs = Array.from({ length: 6 }, () => q());
    const responses = Object.fromEntries(qs.map((x, i) => [x.id, resp(x, i % 2 ? ["B"] : ["C"])]));
    const s1 = scorePaper([sec("s1")], qs, responses);
    const s2 = scorePaper([sec("s1")], [...qs].reverse(), responses);
    expect(s1.score).toBe(s2.score);
    expect(s1.results.map((r) => r.questionId)).toEqual(s2.results.map((r) => r.questionId));
  });
});

describe("parseNumerical", () => {
  it("parses decimals, negatives, fractions and rejects junk", () => {
    expect(parseNumerical("−2.5")).toBe(-2.5);
    expect(parseNumerical("1,000")).toBe(1000);
    expect(parseNumerical("1/0")).toBeNull();
    expect(parseNumerical("abc")).toBeNull();
  });
});
