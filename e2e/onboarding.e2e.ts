/**
 * First-time student, on a phone: welcome → name → create exam → import the
 * syllabus notice → set difficulty → plan → topic to-do list → Today.
 * One session, steps in order (each builds on the last).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser } from "playwright-core";
import { go, launch, open, sideOverflow, type Session } from "./helpers";

const NOTICE = `TEST NOTICE
SESSION: (2026-27)
COURSE: FOUNDATION BATCH A
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

let browser: Browser;
let s: Session;
let imported = 0;

beforeAll(async () => {
  browser = await launch();
  s = await open(browser);
});
afterAll(async () => {
  await s?.page.screenshot({ path: "e2e-results/onboarding-last.png" }).catch(() => {});
  await browser?.close();
});

describe("first-time student on a phone", () => {
  it("1. welcome page offers the two starting points and fits the screen", async () => {
    const { page } = s;
    await expect(page.getByRole("heading", { name: "Exam Pilot" }).isVisible()).resolves.toBe(true);
    await expect(page.getByRole("button", { name: "Start with my own exam" }).isEnabled()).resolves.toBe(true);
    await expect(page.getByRole("button", { name: "Try it with sample data" }).isEnabled()).resolves.toBe(true);
    expect(await sideOverflow(page)).toBeLessThanOrEqual(0);
  });

  it("2. starting fresh opens an empty create-exam page (no sample topics or subjects)", async () => {
    const { page } = s;
    await page.getByRole("button", { name: "Start with my own exam" }).click();
    await page.getByLabel("Your name").fill("Asha");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL(/#\/exams\/new/);
    await page.waitForTimeout(600);
    await expect(page.getByText("No topics yet").isVisible()).resolves.toBe(true);
    expect(await page.getByRole("button", { name: /^Remove / }).count()).toBe(0); // no subject chips
    await expect(page.getByRole("button", { name: /Import your syllabus/ }).isVisible()).resolves.toBe(true);
  });

  it("3. creating without a name is blocked with a clear message", async () => {
    const { page } = s;
    await page.getByRole("button", { name: "Create exam & generate plan" }).click();
    await expect(page.getByText("Give the exam a name.").isVisible()).resolves.toBe(true);
    expect(page.url()).toMatch(/#\/exams\/new/);
  });

  it("4. imports the syllabus notice: notice lines dropped, difficulty per topic, past test date not applied", async () => {
    const { page } = s;
    await page.getByRole("button", { name: /Import your syllabus/ }).click();
    await page.getByLabel("…or paste syllabus text").fill(NOTICE);
    await page.getByRole("button", { name: "Extract topics" }).click();
    await page.waitForTimeout(800);
    const pickers = page.getByRole("radiogroup", { name: /^Difficulty of / });
    imported = await pickers.count();
    expect(imported).toBeGreaterThanOrEqual(14);
    // None of the notice metadata became a topic.
    const names = await page.locator('input[aria-label="topic"]').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
    for (const n of names) expect(n).not.toMatch(/session|test date|timing|offline|notice|pattern|division|course/i);
    // Set one topic to Hard.
    await page.getByRole("radiogroup", { name: "Difficulty of Vectors" }).getByRole("radio", { name: "Hard" }).click();
    await page.getByRole("button", { name: new RegExp(`Add ${imported} topics to my plan`) }).click();
    await page.waitForTimeout(800);
    // The notice's test date (24 Sep 2026) is in the past, so the exam date must not change to it.
    const date = await page.getByLabel("Exam date *").inputValue();
    expect(date).not.toBe("2026-09-24");
  });

  it("5. subjects come from the import and the summary counts the topics", async () => {
    const { page } = s;
    for (const subj of ["Physics", "Chemistry", "Mathematics"]) {
      await expect(page.getByRole("button", { name: `Remove ${subj}` }).count()).resolves.toBe(1);
    }
    await expect(page.locator("dd", { hasText: new RegExp(`^${imported}$`) }).count()).resolves.toBeGreaterThan(0);
  });

  it("6. creating the exam opens the topic to-do list with every imported topic", async () => {
    const { page } = s;
    await page.getByLabel("Exam name *").fill("Minor Test 6");
    await page.getByRole("button", { name: "Create exam & generate plan" }).click();
    await page.waitForURL(/#\/pilot\//);
    await page.waitForTimeout(800);
    await expect(page.getByText(`0 of ${imported} topics done`).isVisible()).resolves.toBe(true);
    expect(await page.getByRole("radiogroup", { name: /^Difficulty of / }).count()).toBe(imported);
    const vectors = page.getByRole("radiogroup", { name: "Difficulty of Vectors" }).getByRole("radio", { name: "Hard" });
    await expect(vectors.getAttribute("aria-checked")).resolves.toBe("true");
    expect(await sideOverflow(page)).toBeLessThanOrEqual(0);
  });

  it("7. ticking a topic counts it as done", async () => {
    const { page } = s;
    await page.getByRole("button", { name: "Mark “Kinematics” as done" }).click();
    await page.waitForTimeout(500);
    await expect(page.getByText(`1 of ${imported} topics done`).isVisible()).resolves.toBe(true);
  });

  it("8. data survives closing and reopening the app", async () => {
    const { page } = s;
    await page.reload(); // the URL still points at the to-do tab
    await page.waitForTimeout(1500);
    await expect(page.getByText(`1 of ${imported} topics done`).isVisible()).resolves.toBe(true);
    const vectors = page.getByRole("radiogroup", { name: "Difficulty of Vectors" }).getByRole("radio", { name: "Hard" });
    await expect(vectors.getAttribute("aria-checked")).resolves.toBe("true");
  });

  it("9. Today: quick-add a task, then tick it off", async () => {
    const { page } = s;
    await go(page, "/dashboard");
    const before = await page.getByText(/^\d+ of \d+ done$/).first().textContent();
    const total = Number(before?.match(/of (\d+)/)?.[1] ?? 0);
    await page.getByRole("radio", { name: "Chemistry" }).click();
    await page.getByLabel("Add a task for today").fill("Coaching DPP: mole concept");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(500);
    await expect(page.getByText(`0 of ${total + 1} done`).isVisible()).resolves.toBe(true);
    await page.getByRole("button", { name: "Mark “Coaching DPP: mole concept” as done" }).click();
    await page.waitForTimeout(400);
    await expect(page.getByText(`1 of ${total + 1} done`).isVisible()).resolves.toBe(true);
  });

  it("10. the phone tab bar reaches every main area", async () => {
    const { page } = s;
    for (const [tab, url] of [["Plan", /#\/pilot/], ["Analyze", /#\/analyzer/], ["Mistakes", /#\/notebook/], ["Today", /#\/dashboard/]] as const) {
      await page.getByRole("navigation", { name: "Tabs" }).getByRole("link", { name: tab }).click();
      await page.waitForTimeout(400);
      expect(page.url()).toMatch(url);
    }
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("link", { name: /Settings/ }).click();
    await page.waitForTimeout(400);
    expect(page.url()).toMatch(/#\/settings/);
  });

  it("11. no JavaScript errors happened along the way", () => {
    expect(s.errors).toEqual([]);
  });

  it("12. the 'Your plan is ready' banner doesn't come back after a reload", async () => {
    const { page } = s;
    await go(page, "/exams");
    const exam = await page.locator('a[href*="/exam/"]').first().getAttribute("href");
    const id = exam!.split("/exam/")[1];
    await go(page, `/pilot/${id}?created=1`);
    await page.reload();
    await page.waitForTimeout(1200);
    expect(await page.getByText("Your plan is ready").count()).toBe(0);
  });
});
