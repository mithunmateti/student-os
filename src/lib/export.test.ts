/** Exports, backups and awkward real-world inputs. */
import { describe, expect, it } from "vitest";
import { backupJson, notebookCsv, parseBackup, questionsCsv, toCsv } from "./export";
import { buildDemoData } from "@/domain/demo/seed";
import { parseAnswerKey, parsePaperText, parseSyllabusText } from "@/domain/import/parser";
import { today } from "@/domain/util";

const demo = buildDemoData(today());

describe("CSV exports", () => {
  it("neutralises spreadsheet formulas in text cells", () => {
    expect(toCsv([["=HYPERLINK(\"http://x\")", "@cmd", "+1+2"]])).toBe(`"'=HYPERLINK(""http://x"")",'@cmd,'+1+2`);
  });

  it("keeps negative marks as numbers so spreadsheets can add them up", () => {
    // A wrong answer at +4/−1 scores −1. Excel/Sheets must see a number, not the text '-1.
    expect(toCsv([[-1, -0.25, 4]])).toBe("-1,-0.25,4");
  });

  it("question CSV has one row per question plus a header, with numeric marks", () => {
    const a = demo.analyses.find((x) => x.finalizedAt)!;
    const lines = questionsCsv(a, demo.settings.errorCategories).split("\n");
    expect(lines.length).toBe(a.questions.length + 1);
    const header = lines[0].split(",");
    const marksCol = header.indexOf("Marks");
    const marks = lines.slice(1).map((l) => l.split(",")[marksCol]).filter((m) => m && m.includes("-"));
    for (const m of marks) expect(m, `marks cell ${m}`).toMatch(/^-\d/);
  });

  it("notebook CSV exports every entry", () => {
    const csv = notebookCsv(demo.notebook, demo.analyses, demo.settings.errorCategories);
    expect(csv.split("\n").length).toBeGreaterThanOrEqual(demo.notebook.length + 1);
  });
});

describe("backups", () => {
  it("round-trips the full data set", () => {
    const back = parseBackup(backupJson(demo));
    expect(back.exams.length).toBe(demo.exams.length);
    expect(back.analyses.length).toBe(demo.analyses.length);
    expect(back.topics.length).toBe(demo.topics.length);
  });

  it("rejects files that aren't Exam Pilot backups with a clear message", () => {
    expect(() => parseBackup(JSON.stringify({ hello: "world" }))).toThrow("isn't an Exam Pilot backup");
    expect(() => parseBackup("not json at all")).toThrow();
  });

  it("rejects damaged backups and drops unknown fields, so a crafted file can't break the app", () => {
    const good = JSON.parse(backupJson(demo));
    const bad = (mutate: (d: Record<string, unknown>) => void) => {
      const copy = structuredClone(good);
      mutate(copy.data);
      return () => parseBackup(JSON.stringify(copy));
    };
    expect(bad((d) => { (d.tasks as Record<string, unknown>[])[0].dueDate = "<script>"; })).toThrow("isn't a valid Exam Pilot backup");
    expect(bad((d) => { (d.exams as Record<string, unknown>[])[0].id = 7; })).toThrow("isn't a valid Exam Pilot backup");
    expect(bad((d) => { d.tasks = "lots"; })).toThrow("isn't a valid Exam Pilot backup");
    expect(bad((d) => { (d.settings as Record<string, unknown>).theme = "hacker"; })).toThrow("isn't a valid Exam Pilot backup");
    const extra = structuredClone(good);
    extra.data.toggleTask = "not a function";
    extra.data.__proto__ = { polluted: true };
    const back = parseBackup(JSON.stringify(extra)) as unknown as Record<string, unknown>;
    expect(back.toggleTask).toBeUndefined();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("never includes the Anthropic API key", () => {
    expect(backupJson(demo)).not.toMatch(/AIza[A-Za-z0-9]|gemini-key|xai-key/);
  });
});

describe("awkward inputs to the importers", () => {
  it("handles Windows line endings in a pasted paper", () => {
    const p = parsePaperText("1. What is 2+2?\r\n(A) 3 (B) 4 (C) 5 (D) 6\r\n2. Unit of force?\r\n(A) joule (B) newton (C) watt (D) pascal\r\n");
    expect(p.questions).toHaveLength(2);
    expect(p.questions[0].options.map((o) => o.text)).toEqual(["3", "4", "5", "6"]);
  });

  it("reads lower-case (a)(b)(c)(d) options", () => {
    const p = parsePaperText("1. Pick one\n(a) red (b) green (c) blue (d) black");
    expect(p.questions[0].options).toHaveLength(4);
  });

  it("reads answer keys written as 1-B, 2-C and as a table", () => {
    expect(parseAnswerKey("1-B, 2-C, 3-A").entries.map((e) => e.letters.join(""))).toEqual(["B", "C", "A"]);
    expect(parseAnswerKey("Q.No Answer\n1 B\n2 C\n3 A").entries.map((e) => e.letters.join(""))).toEqual(["B", "C", "A"]);
  });

  it("maps numeric option answers (1)(2)(3)(4) in a key to letters", () => {
    expect(parseAnswerKey("1. (2)\n2. (4)").entries.map((e) => e.letters.join(""))).toEqual(["B", "D"]);
  });

  it("returns nothing (instead of junk) for empty text", () => {
    expect(parsePaperText("").questions).toHaveLength(0);
    expect(parseAnswerKey("   ").entries).toHaveLength(0);
    expect(parseSyllabusText("", "General")).toHaveLength(0);
  });

  it("does not turn a plain list of chapters into one giant topic", () => {
    const rows = parseSyllabusText("PHYSICS\nKinematics\nLaws of Motion\nWork, Energy and Power", "General");
    expect(rows.map((r) => r.chapter)).toEqual(["Kinematics", "Laws of Motion", "Work, Energy and Power"]);
  });
});
