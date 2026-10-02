/**
 * Analyze an exam end to end on a laptop: built-in sample paper → review →
 * marking → answers by keyboard → results → diagnose → report → notebook.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser } from "playwright-core";
import { go, LAPTOP, launch, open, type Session } from "./helpers";

let browser: Browser;
let s: Session;
let analysisUrl = "";

beforeAll(async () => {
  browser = await launch();
  s = await open(browser, LAPTOP);
  await s.page.getByRole("button", { name: "Start with my own exam" }).click();
  await s.page.getByRole("button", { name: "Continue" }).click();
  await s.page.waitForURL(/exams\/new/);
});
afterAll(async () => {
  await s?.page.screenshot({ path: "e2e-results/analyzer-last.png", fullPage: true }).catch(() => {});
  await browser?.close();
});

describe("analyzing a test", () => {
  it("1. imports the built-in sample paper and lands on review", async () => {
    const { page } = s;
    await go(page, "/analyzer/new");
    await page.getByRole("tab", { name: "Try a sample" }).click();
    await page.getByPlaceholder("e.g. Allen Minor Test 6").fill("Sample test");
    await page.getByRole("button", { name: "Extract questions" }).click();
    await page.waitForURL(/\/review/);
    analysisUrl = page.url().replace(/\/review.*$/, "");
    await page.waitForTimeout(600);
    await expect(page.getByText(/Answer key: \d+ of \d+ answers matched/).isVisible()).resolves.toBe(true);
  });

  it("2. won't continue until questions are approved, then moves to marking", async () => {
    const { page } = s;
    await page.getByRole("button", { name: "Confirm & set marking" }).click();
    await page.waitForTimeout(300);
    expect(page.url()).toMatch(/\/review/);
    await page.getByRole("button", { name: /Approve all/ }).click();
    await page.getByRole("button", { name: "Confirm & set marking" }).click();
    await page.waitForURL(/\/marking/);
  });

  it("3. confirms marking and reaches the answer grid", async () => {
    const { page } = s;
    await page.getByRole("button", { name: "Confirm marking" }).click();
    await page.waitForURL(/\/answers/);
  });

  it("4. answers with the keyboard and calculates results", async () => {
    const { page } = s;
    await page.waitForTimeout(500);
    const cells = page.getByRole("grid", { name: "Answer grid" }).locator("[role=gridcell], [role=row] > *").first();
    await cells.click().catch(() => {});
    for (const k of "abcdabcdabcd") { await page.keyboard.press(k); await page.waitForTimeout(40); }
    await page.getByRole("button", { name: "Calculate results" }).click();
    // Some questions are numerical / unanswered: the app asks before treating them as unattempted.
    const treat = page.getByRole("button", { name: "Treat as unattempted & calculate" });
    if (await treat.isVisible().catch(() => false)) await treat.click();
    await page.waitForURL(/\/results/);
    await page.waitForTimeout(600);
    await expect(page.getByText(/Score/).first().isVisible()).resolves.toBe(true);
  });

  it("5. diagnoses a lost mark and finishes", async () => {
    const { page } = s;
    await page.getByRole("button", { name: /Diagnose/ }).first().click();
    await page.waitForURL(/\/errors/);
    const reasons = page.getByRole("radiogroup", { name: "Primary error reason" }).getByRole("radio");
    if (await reasons.count()) await reasons.first().click();
    await page.getByRole("button", { name: "Finish & update plan" }).click();
    await page.waitForURL(/\/report/);
  });

  it("6. the report has the one-minute summary and exports", async () => {
    const { page } = s;
    await page.waitForTimeout(600);
    await expect(page.getByText("In one minute").isVisible()).resolves.toBe(true);
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "CSV" }).click()]);
    expect(dl.suggestedFilename()).toMatch(/\.csv$/);
  });

  it("7. answers are locked after results, and unlocking is explicit", async () => {
    const { page } = s;
    await page.goto(`${analysisUrl}/answers`);
    await page.waitForTimeout(600);
    await expect(page.getByRole("button", { name: "Unlock to edit" }).isVisible()).resolves.toBe(true);
  });

  it("8. no JavaScript errors", () => {
    expect(s.errors.filter((e) => !/api\/ai|ERR_FAILED/.test(e))).toEqual([]);
  });
});
