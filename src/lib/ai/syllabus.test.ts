import { describe, expect, it, vi } from "vitest";
import { AiError, GEMINI_MODEL, type JsonCaller, type JsonRequest } from "./gemini";
import { extractSyllabusWithAI } from "./syllabus";

// Text as pdf.js extracts it from a real coaching "test notice" (flattened table).
const NOTICE = `TEST NOTICE
SESSION: (2026-27)
DIVISION: FOUNDATION
COURSE: FOUNDATION BATCH A
PHASE: 1 & 2
MINOR TEST – 5
SYLLABUS
SUBJECT CHAPTER NAME
BASIC MATHS, QUADRATIC EQUATIONS AND LOGARITHMS,
TRIGONOMETRY & DIFFERENTIAL CALCULUS, INTEGRAL
PHYSICS CALCULUS, GRAPHS & GEOMETRY, VECTORS, KINEMATICS,
MOTION UNDER GRAVITY, CIRCULAR MOTION, FORCE AND
LAWS OF MOTION, FRICTION
MOLE CONCEPT & STOICHIOMETRY, CONCENTRATION
CHEMISTRY
UNITS, REDOX REACTIONS, CHEMICAL EQUILIBRIUM
MATHEMATICS BASIC MATHS AND SURDS
Test Date: - 24-SEP-2026 (THURSDAY)
Test Pattern: - JEE MAINS
Test Timing: - 9:00 AM TO 12:00 AM
Mode: - OFFLINE`;

function fakeCaller(reply: object | string) {
  const call = vi.fn(async (_req: JsonRequest) => ({ model: GEMINI_MODEL, text: typeof reply === "string" ? reply : JSON.stringify(reply) }));
  return { call: call as JsonCaller, spy: call };
}

const GOOD = {
  topics: [
    { subject: "Physics", chapter: "Basic Maths", topic: "Basic Maths" },
    { subject: "Physics", chapter: "Integral Calculus", topic: "Integral Calculus" },
    { subject: "Physics", chapter: "Force and Laws of Motion", topic: "Force and Laws of Motion" },
    { subject: "Chemistry", chapter: "Mole Concept & Stoichiometry", topic: "Mole Concept & Stoichiometry" },
    { subject: "Chemistry", chapter: "Concentration Units", topic: "Concentration Units" },
    { subject: "Chemistry", chapter: "Concentration Units", topic: "Concentration Units" },
    { subject: "Mathematics", chapter: "Basic Maths and Surds", topic: "" },
  ],
  ignored: ["TEST NOTICE", "SESSION: (2026-27)", "Test Timing: - 9:00 AM TO 12:00 AM"],
  exam_info: { name: "Minor Test 5", date: "2026-09-24", pattern: "JEE Mains", duration_minutes: 180 },
};

describe("extractSyllabusWithAI", () => {
  it("sends the document, the subjects and a strict JSON schema", async () => {
    const { call, spy } = fakeCaller(GOOD);
    const r = await extractSyllabusWithAI(call, NOTICE, ["Physics", "Chemistry", "Mathematics"]);
    const req = spy.mock.calls[0][0];
    expect(req.user).toContain("<document>");
    expect(req.user).toContain("Physics, Chemistry, Mathematics");
    expect(req.name).toBe("syllabus");
    expect((req.schema as { required: string[] }).required).toEqual(["topics", "ignored", "exam_info"]);
    expect(r.model).toBe(GEMINI_MODEL);
  });

  it("returns cleaned, de-duplicated topics, skipped lines and exam details", async () => {
    const r = await extractSyllabusWithAI(fakeCaller(GOOD).call, NOTICE, []);
    expect(r.topics).toHaveLength(6); // duplicate removed
    expect(r.topics.find((t) => t.chapter === "Basic Maths and Surds")?.topic).toBe("Basic Maths and Surds"); // empty topic → chapter
    expect(r.ignored).toContain("SESSION: (2026-27)");
    expect(r.examInfo).toEqual({ name: "Minor Test 5", date: "2026-09-24", pattern: "JEE Mains", durationMinutes: 180 });
  });

  it("reads JSON even with text around it (plain-JSON fallback replies)", async () => {
    const r = await extractSyllabusWithAI(fakeCaller(`Here you go: ${JSON.stringify(GOOD)}`).call, NOTICE, []);
    expect(r.topics.length).toBeGreaterThan(0);
  });

  it("drops invalid exam details and rejects oversized input", async () => {
    const bad = { ...GOOD, exam_info: { name: null, date: "24 Sept", pattern: null, duration_minutes: 9999 } };
    const r = await extractSyllabusWithAI(fakeCaller(bad).call, NOTICE, []);
    expect(r.examInfo.date).toBeNull();
    expect(r.examInfo.durationMinutes).toBeNull();
    await expect(extractSyllabusWithAI(fakeCaller(GOOD).call, "x".repeat(70_000), [])).rejects.toThrow(/too long/);
  });

  it("surfaces unreadable output and cut-off replies as clear errors", async () => {
    await expect(extractSyllabusWithAI(fakeCaller("not json").call, NOTICE, [])).rejects.toThrow(/couldn't be read/);
    const cut: JsonCaller = async () => { throw new AiError("too_long", "cut off"); };
    await expect(extractSyllabusWithAI(cut, NOTICE, [])).rejects.toThrow(/too long for one pass/);
  });
});

describe("rule-based fallback on the same notice", () => {
  it("drops notice metadata instead of treating it as syllabus", async () => {
    const { parseSyllabusText } = await import("@/domain/import/parser");
    const rows = parseSyllabusText(NOTICE, "General");
    const all = rows.map((r) => `${r.chapter} ${r.topic}`).join(" | ");
    for (const junk of ["SESSION", "DIVISION", "Test Date", "Test Timing", "Mode", "OFFLINE", "TEST NOTICE", "Minor Test", "SUBJECT CHAPTER"]) expect(all).not.toContain(junk);
    expect(rows.find((r) => r.chapter === "Force and Laws of Motion")?.subject).toBe("Physics"); // wrapped line rejoined
    expect(rows.find((r) => r.chapter === "Basic Maths")?.subject).toBe("Physics"); // rows printed above the label
    expect(rows.find((r) => r.chapter === "Redox Reactions")?.subject).toBe("Chemistry");
    expect(rows.find((r) => r.chapter === "Basic Maths and Surds")?.subject).toBe("Mathematics");
  });

  it("reads the whole flattened table correctly: names cut by a subject label are rejoined, rows above a label go under it", async () => {
    const { parseSyllabusText } = await import("@/domain/import/parser");
    const got = parseSyllabusText(NOTICE, "General").map((r) => `${r.subject} › ${r.chapter}`);
    expect(got).toEqual([
      ...["Basic Maths", "Quadratic Equations and Logarithms", "Trigonometry & Differential Calculus", "Integral Calculus", "Graphs & Geometry", "Vectors", "Kinematics", "Motion under Gravity", "Circular Motion", "Force and Laws of Motion", "Friction"].map((c) => `Physics › ${c}`),
      ...["Mole Concept & Stoichiometry", "Concentration Units", "Redox Reactions", "Chemical Equilibrium"].map((c) => `Chemistry › ${c}`),
      "Mathematics › Basic Maths and Surds",
    ]);
  });

  it("still reads simple one-chapter-per-line lists the same way", async () => {
    const { parseSyllabusText } = await import("@/domain/import/parser");
    const got = parseSyllabusText("PHYSICS\nKinematics\nFriction\nCHEMISTRY\nRedox Reactions\nMole Concept", "General").map((r) => `${r.subject} › ${r.chapter}`);
    expect(got).toEqual(["Physics › Kinematics", "Physics › Friction", "Chemistry › Redox Reactions", "Chemistry › Mole Concept"]);
  });
});
