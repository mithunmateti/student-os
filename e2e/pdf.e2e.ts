/**
 * Real file uploads in the single-file app (pdf.js runs from an inlined worker there):
 * the student's own syllabus PDF, and the bundled sample question paper + answer key PDFs.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import type { Browser } from "playwright-core";
import { go, LAPTOP, launch, open, type Session } from "./helpers";

const SYLLABUS_PDF = process.env.SYLLABUS_PDF ?? `${homedir()}/Downloads/syllabus (1).pdf`;
const PAPER_PDF = fileURLToPath(new URL("../public/samples/sample-question-paper.pdf", import.meta.url));
const KEY_PDF = fileURLToPath(new URL("../public/samples/sample-answer-key.pdf", import.meta.url));

let browser: Browser;
let s: Session;

beforeAll(async () => {
  browser = await launch();
  s = await open(browser, LAPTOP);
  await s.page.getByRole("button", { name: "Start with my own exam" }).click();
  await s.page.getByRole("button", { name: "Continue" }).click();
  await s.page.waitForURL(/exams\/new/);
});
afterAll(async () => browser?.close());

describe("PDF uploads", () => {
  it.skipIf(!existsSync(SYLLABUS_PDF))("reads the student's syllabus PDF into reviewable topics (no notice text)", async () => {
    const { page } = s;
    await page.getByRole("button", { name: /Import your syllabus/ }).click();
    await page.locator("dialog[open] input[type=file]").setInputFiles(SYLLABUS_PDF);
    await page.getByRole("radiogroup", { name: /^Difficulty of / }).first().waitFor({ timeout: 20_000 });
    const rows = await page.locator('dialog[open] input[aria-label="topic"]').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
    const subjects = await page.locator('dialog[open] input[aria-label="subject"]').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
    expect(rows.length).toBeGreaterThanOrEqual(14);
    for (const r of rows) expect(r).not.toMatch(/session|test date|timing|offline|notice|pattern|division|course|phase/i);
    // Report how well the rule-based fallback did on the real file (used when no AI key is set).
    const pairs = rows.map((r, i) => `${subjects[i]} › ${r}`);
    const chemistryRight = ["Redox Reactions", "Chemical Equilibrium", "Mole Concept & Stoichiometry"].filter((c) => pairs.some((p) => p.startsWith("Chemistry") && p.includes(c)));
    expect.soft(chemistryRight, `rule-based import put these under Chemistry: ${pairs.join(" | ")}`).toHaveLength(3);
    expect.soft(rows, "chapter names split across lines are rejoined").toContain("Integral Calculus");
    await page.keyboard.press("Escape");
  });

  it("extracts questions from the sample question-paper and answer-key PDFs", async () => {
    const { page } = s;
    await go(page, "/analyzer/new");
    await page.getByPlaceholder("e.g. Allen Minor Test 6").fill("PDF sample test");
    const inputs = page.locator("input[type=file]");
    await inputs.nth(0).setInputFiles(PAPER_PDF);
    await inputs.nth(1).setInputFiles(KEY_PDF);
    await page.getByRole("button", { name: "Extract questions" }).click();
    await page.waitForURL(/\/review/, { timeout: 30_000 });
    await page.waitForTimeout(600);
    const matched = await page.getByText(/Answer key: (\d+) of (\d+) answers matched/).textContent();
    const [, got, total] = matched!.match(/(\d+) of (\d+)/)!.map(Number);
    expect(total).toBeGreaterThan(0);
    expect(got).toBe(total);
  });

  it("no JavaScript errors while reading PDFs", () => {
    expect(s.errors.filter((e) => !/api\/ai|ERR_FAILED/.test(e))).toEqual([]);
  });
});
