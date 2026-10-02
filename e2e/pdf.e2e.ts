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

  it("reads a photo of a question paper with OCR (engine loads from its pinned CDN under the security policy)", async () => {
    const { page } = s;
    // Make a "photo": a rendered page of printed questions.
    const shot = await s.ctx.newPage();
    await shot.setViewportSize({ width: 1000, height: 520 });
    await shot.setContent(`<body style="font:28px/1.5 Georgia,serif;padding:40px;background:#fff;color:#111">
      <p>1. What is the SI unit of force?</p><p>(A) Newton (B) Joule (C) Watt (D) Pascal</p>
      <p>2. Which gas is produced when zinc reacts with dilute acid?</p><p>(A) Oxygen (B) Hydrogen (C) Nitrogen (D) Chlorine</p></body>`);
    const png = await shot.screenshot();
    await shot.close();
    await go(page, "/analyzer/new");
    await page.getByPlaceholder("e.g. Allen Minor Test 6").fill("Photo test");
    await page.locator("input[type=file]").nth(0).setInputFiles({ name: "paper-photo.png", mimeType: "image/png", buffer: png });
    await page.getByRole("button", { name: "Extract questions" }).click();
    await page.waitForURL(/\/review/, { timeout: 90_000 });
    await page.waitForTimeout(800);
    const text = await page.locator("main").innerText();
    expect(text).toMatch(/unit of force/i);
    expect(text).toMatch(/zinc/i);
  }, 120_000);

  it("extracts questions from the sample question-paper and answer-key PDFs", async () => {
    const { page } = s;
    await go(page, "/analyzer/new");
    await page.getByLabel("Analysis title").fill("PDF sample test");
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

  it("still reads PDFs in an older browser (Safari 16.4-style: newer JavaScript features removed)", async () => {
    const old = await open(browser, LAPTOP);
    await old.ctx.addInitScript(() => {
      const P = Promise as unknown as Record<string, unknown>;
      delete P.withResolvers;
      delete P.try;
      delete (Math as unknown as Record<string, unknown>).sumPrecise;
      const M = Map.prototype as unknown as Record<string, unknown>;
      delete M.getOrInsert;
      delete M.getOrInsertComputed;
      delete (Uint8Array as unknown as Record<string, unknown>).fromBase64;
    });
    await old.page.reload();
    await old.page.getByRole("button", { name: "Start with my own exam" }).click();
    await old.page.getByRole("button", { name: "Continue" }).click();
    await old.page.waitForURL(/exams\/new/);
    await go(old.page, "/analyzer/new");
    await old.page.getByPlaceholder("e.g. Allen Minor Test 6").fill("Old browser test"); // new test's name (no exams yet)
    const inputs = old.page.locator("input[type=file]");
    await inputs.nth(0).setInputFiles(PAPER_PDF);
    await inputs.nth(1).setInputFiles(KEY_PDF);
    await old.page.getByRole("button", { name: "Extract questions" }).click();
    await old.page.waitForURL(/\/review/, { timeout: 30_000 });
    await expect(old.page.getByText(/Answer key: (\d+) of \1 answers matched/).first().isVisible()).resolves.toBe(true);
    expect(old.errors, old.errors.join(" | ")).toEqual([]);
    await old.ctx.close();
  }, 60_000);

  it("no JavaScript errors while reading PDFs", () => {
    expect(s.errors.filter((e) => !/api\/ai|ERR_FAILED/.test(e))).toEqual([]);
  });
});
