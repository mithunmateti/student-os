/** Settings, AI key handling, backups and data safety. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { Browser } from "playwright-core";
import { go, LAPTOP, launch, loadSampleData, open, type Session } from "./helpers";

let browser: Browser;
let s: Session;

beforeAll(async () => {
  browser = await launch();
  s = await open(browser, LAPTOP);
  await loadSampleData(s.page);
});
afterAll(async () => browser?.close());

describe("settings and data", () => {
  it("rejects an API key that isn't a Gemini key, without saving it", async () => {
    const { page } = s;
    await go(page, "/settings");
    const field = page.getByLabel(/Gemini API key/i);
    await field.fill("hello-not-a-key");
    await page.getByRole("button", { name: /Test & save/ }).click();
    await page.waitForTimeout(400);
    await expect(page.getByText(/AIza/).first().isVisible()).resolves.toBe(true);
    expect(await page.evaluate(() => localStorage.getItem("exam-pilot-gemini-key"))).toBeNull();
  });

  it("exports a backup that can be read back, and it contains no API key", async () => {
    const { page } = s;
    await page.evaluate(() => localStorage.setItem("exam-pilot-gemini-key", "AIza-test-0000"));
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export full backup" }).click()]);
    const text = readFileSync((await dl.path())!, "utf8");
    const json = JSON.parse(text);
    expect(json.app).toBe("student-os");
    expect(json.data.exams.length).toBeGreaterThan(0);
    expect(text).not.toContain("AIza-test-0000");
    await page.evaluate(() => localStorage.removeItem("exam-pilot-gemini-key"));
  });

  it("dark mode applies and is remembered after reopening", async () => {
    const { page } = s;
    await page.getByRole("radio", { name: "Dark" }).first().click();
    await page.waitForTimeout(400); // let the choice reach IndexedDB before reloading
    await page.reload();
    await page.waitForTimeout(1200);
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
    await page.getByRole("radio", { name: "Light" }).first().click();
  });

  it("deleting all data asks first, then leaves an empty app ready for a new exam", async () => {
    const { page } = s;
    await go(page, "/settings");
    await page.evaluate(() => localStorage.setItem("exam-pilot-gemini-key", "AIza-test-0000"));
    await page.getByRole("button", { name: /Delete all data/ }).click();
    const confirm = page.locator("dialog[open]").getByRole("button", { name: "Delete everything" });
    await expect(confirm.isVisible()).resolves.toBe(true);
    await confirm.click();
    await page.waitForTimeout(1200);
    expect(page.url()).toMatch(/#\/dashboard/);
    await go(page, "/exams");
    expect(await page.locator('a[href*="/exam/"]').count()).toBe(0);
  });

  it("deleting all data also forgets the saved AI key (nothing personal left behind)", async () => {
    expect(await s.page.evaluate(() => localStorage.getItem("exam-pilot-gemini-key"))).toBeNull();
  });

  it("no JavaScript errors", () => {
    expect(s.errors.filter((e) => !/api\/ai|ERR_FAILED/.test(e))).toEqual([]);
  });
});
