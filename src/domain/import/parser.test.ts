import { describe, expect, it } from "vitest";
import { parseAnswerKey, parsePaperText, parseSyllabusText, splitOptions } from "./parser";
import { buildFromParsed, mergeKey } from "./build";
import { SAMPLE_KEY, SAMPLE_PAPER } from "../demo/sample-paper";

const PAPER = `
[[page 1]]
PHYSICS
Section A (Single correct)
1. A ball is thrown vertically upward with speed 20 m/s. The maximum height reached is (g = 10 m/s²)
(A) 10 m (B) 20 m (C) 30 m (D) 40 m
2. A block of mass 2 kg rests on a rough surface with μ = 0.5. The force of friction is
(A) 5 N
(B) 10 N
(C) 15 N
(D) 20 N
4. As shown in the figure, the equivalent resistance between A and B is
(A) 2 Ω (B) 4 Ω (C) 6 Ω (D) 8 Ω
[[page 2]]
CHEMISTRY
1. The hybridisation of carbon in methane is
A. sp B. sp2 C. sp3 D. dsp2
2. Find the molarity of a solution containing 4 g NaOH in 250 mL.
`;

describe("parsePaperText", () => {
  const parsed = parsePaperText(PAPER);
  it("detects sections and questions", () => {
    expect(parsed.sections.map((s) => s.subject)).toEqual(["Physics", "Chemistry"]);
    expect(parsed.questions).toHaveLength(5);
    expect(parsed.questions[0].options.map((o) => o.text)).toEqual(["10 m", "20 m", "30 m", "40 m"]);
    expect(parsed.questions[1].options).toHaveLength(4);
    expect(parsed.questions[3].options[2].text).toBe("sp3");
  });
  it("flags skipped numbers, figures and numerical questions", () => {
    expect(parsed.warnings.some((w) => /Question 3 was not found/.test(w))).toBe(true);
    expect(parsed.questions[2].hasFigure).toBe(true);
    expect(parsed.questions[2].confidence.text).toBeLessThan(0.75);
    expect(parsed.questions[4].type).toBe("numerical");
  });
  it("keeps page references", () => {
    expect(parsed.questions[0].page).toBe(1);
    expect(parsed.questions[3].page).toBe(2);
  });
  it("reports empty input without throwing", () => {
    expect(parsePaperText("   ").warnings[0]).toMatch(/No questions/);
  });
});

describe("splitOptions", () => {
  it("supports numeric option markers", () => {
    const r = splitOptions("Which is prime? (1) 4 (2) 6 (3) 7 (4) 9");
    expect(r.stem).toBe("Which is prime?");
    expect(r.options.map((o) => o.key)).toEqual(["A", "B", "C", "D"]);
    expect(r.options[2].text).toBe("7");
  });
});

describe("parseAnswerKey", () => {
  it("reads common key formats", () => {
    const k = parseAnswerKey("1. A  2-(C)  3: B,D  4 bonus  5. 2.5  6 drop  7 (3)");
    expect(k.entries.map((e) => e.number)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(k.entries[0].letters).toEqual(["A"]);
    expect(k.entries[1].letters).toEqual(["C"]);
    expect(k.entries[2].letters).toEqual(["B", "D"]);
    expect(k.entries[3].bonus).toBe(true);
    expect(k.entries[4].value).toBe(2.5);
    expect(k.entries[5].dropped).toBe(true);
    expect(k.entries[6].letters).toEqual(["C"]);
    expect(k.entries[6].value).toBe(3);
  });
  it("reads tabular keys", () => {
    const k = parseAnswerKey("Q.No Answer\n1 B\n2 D\n3 A");
    expect(k.entries.map((e) => e.letters[0])).toEqual(["B", "D", "A"]);
  });
});

describe("mergeKey", () => {
  it("maps by order when sections restart numbering and interprets numerical keys", () => {
    const parsed = parsePaperText(PAPER);
    const a = buildFromParsed(parsed, { examId: "e", title: "t", rule: { correct: 4, wrong: 1, unattempted: 0 }, subjects: ["Physics", "Chemistry"], topics: [], importMethod: "text" });
    const key = parseAnswerKey("1 B 2 B 4 C 1 C 2 0.16");
    const m = mergeKey(a.questions, key.entries);
    expect(m.strategy).toBe("order");
    expect(m.questions.map((q) => q.correctAnswer[0] ?? q.numericalAnswer?.value)).toEqual(["B", "B", "C", "C", 0.16]);
  });
  it("warns about questions without a key", () => {
    const parsed = parsePaperText("1. Q one (A) a (B) b (C) c (D) d\n2. Q two (A) a (B) b (C) c (D) d");
    const a = buildFromParsed(parsed, { examId: "e", title: "t", rule: { correct: 4, wrong: 1, unattempted: 0 }, subjects: [], topics: [], importMethod: "text" });
    const m = mergeKey(a.questions, parseAnswerKey("1. A").entries);
    expect(m.warnings.some((w) => /1 question has no answer/.test(w))).toBe(true);
  });
});

describe("parseSyllabusText", () => {
  it("extracts subjects, chapters and topics", () => {
    const t = parseSyllabusText(`PHYSICS
Unit 1: Kinematics - motion in 1D, projectile motion, relative velocity
Unit 2: Laws of Motion
- Newton's laws
- Friction
CHEMISTRY
Chemical Bonding:
• VSEPR theory
• Hybridisation`);
    expect(t.filter((x) => x.subject === "Physics" && x.chapter === "Kinematics")).toHaveLength(3);
    expect(t.find((x) => x.topic === "Friction")?.chapter).toBe("Laws of Motion");
    expect(t.find((x) => x.topic === "Hybridisation")?.subject).toBe("Chemistry");
  });
});

describe("bundled sample paper", () => {
  it("parses all sections, types and key with edge cases reported", () => {
    const p = parsePaperText(SAMPLE_PAPER);
    expect(p.questions).toHaveLength(14);
    expect(p.sections.map((s) => s.subject)).toEqual(["Physics", "Chemistry", "Mathematics", "Mathematics"]);
    expect(p.questions.filter((q) => q.type === "numerical")).toHaveLength(2);
    expect(p.questions.find((q) => q.type === "multiple")).toBeDefined();
    expect(p.warnings.some((w) => /Question 5 was not found/.test(w))).toBe(true);
    const a = buildFromParsed(p, { examId: "e", title: "t", rule: { correct: 4, wrong: 1, unattempted: 0 }, subjects: ["Physics", "Chemistry", "Mathematics"], topics: [], importMethod: "text" });
    const m = mergeKey(a.questions, parseAnswerKey(SAMPLE_KEY).entries);
    expect(m.matched).toBe(14);
    expect(m.questions.find((q) => q.type === "multiple")?.correctAnswer).toEqual(["A", "B", "D"]);
    expect(m.questions[13].numericalAnswer?.value).toBe(0.17);
    expect(a.questions[0].chapter).toBe("Kinematics");
  });
});

describe("classifyQuestion", () => {
  it("suggests chapter and the best-matching topic from question text", async () => {
    const { classifyQuestion } = await import("../ai/heuristics");
    const { SYLLABUS_TEMPLATES } = await import("../syllabi");
    const topics = SYLLABUS_TEMPLATES.jee.topics().map((t, i) => ({ ...t, id: String(i), examId: "e", coverage: "covered" as const }));
    const c = (t: string) => classifyQuestion(t, "Mathematics", topics, ["Mathematics"]);
    expect(c("The value of lim (x->0) sin(5x)/x is").chapter).toBe("Limits & Continuity");
    expect(c("Find the area bounded by y = x^2 and y = 2x").topic).toBe("Area under curves");
    expect(c("The latus rectum of the parabola y^2 = 12x").topic).toBe("Parabola");
    expect(c("xyz").confidence).toBe(0);
  });
});
