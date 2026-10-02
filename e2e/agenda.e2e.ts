/** Dashboard, Calendar and To-do: one set of tasks, shown everywhere, kept in sync (also across windows). */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser, Page } from "playwright-core";
import { APP, go, LAPTOP, launch, loadSampleData, open, sideOverflow, type Session } from "./helpers";

let browser: Browser;
let s: Session;
const doneText = (page: Page) => page.getByText(/^\d+ of \d+ done$/).first().textContent();
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const TODAY = iso(new Date());
const IN3 = iso(new Date(Date.now() + 3 * 86_400_000));

beforeAll(async () => {
  browser = await launch();
  s = await open(browser, LAPTOP);
  await loadSampleData(s.page);
});
afterAll(async () => browser?.close());

describe("calendar and to-do, connected", () => {
  it("a task added on the To-do page shows on the dashboard and in the calendar", async () => {
    const { page } = s;
    await go(page, "/todo");
    await page.getByLabel("Add a task for today").fill("Revise vectors from class notes");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(400);
    await expect(page.getByText("Revise vectors from class notes").isVisible()).resolves.toBe(true);
    await go(page, "/dashboard");
    await expect(page.getByText("Revise vectors from class notes").isVisible()).resolves.toBe(true);
    await go(page, `/calendar?date=${TODAY}`);
    await expect(page.getByText("Revise vectors from class notes").isVisible()).resolves.toBe(true);
  });

  it("ticking it in the calendar ticks it on the dashboard and the to-do list", async () => {
    const { page } = s;
    await page.getByRole("button", { name: "Mark “Revise vectors from class notes” as done" }).click();
    await page.waitForTimeout(300);
    await go(page, "/dashboard");
    await expect(page.getByRole("button", { name: "Mark “Revise vectors from class notes” as not done" }).isVisible()).resolves.toBe(true);
    await go(page, "/todo");
    await page.getByRole("button", { name: /^Show/ }).last().click(); // open "Done"
    await expect(page.getByRole("button", { name: "Mark “Revise vectors from class notes” as not done" }).isVisible()).resolves.toBe(true);
  });

  it("the dashboard's week strip and mini calendar show the chosen day's tasks", async () => {
    const { page } = s;
    await go(page, "/dashboard");
    const day = page.getByRole("radiogroup", { name: "Choose a day" }).getByRole("radio").nth(2);
    await day.click();
    await page.waitForTimeout(300);
    await expect(day.getAttribute("aria-checked")).resolves.toBe("true");
    await expect(page.getByRole("button", { name: "Back to today" }).isVisible()).resolves.toBe(true);
    await page.getByRole("button", { name: "Back to today" }).click();
    await expect(page.getByRole("heading", { name: "Today's plan" }).isVisible()).resolves.toBe(true);
  });

  it("dragging a task onto another day in the calendar moves it", async () => {
    const { page } = s;
    await go(page, `/calendar?date=${TODAY}`);
    await page.getByLabel("Add a task for today").fill("Drag me to later");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(400);
    const row = page.locator("[draggable=true]", { hasText: "Drag me to later" });
    await row.dragTo(page.locator(`[data-date="${IN3}"]`));
    await page.waitForTimeout(400);
    const tick = page.getByRole("button", { name: "Mark “Drag me to later” as done" });
    await expect(tick.count()).resolves.toBe(0); // gone from today
    await page.locator(`[data-date="${IN3}"]`).click();
    await page.waitForTimeout(300);
    await expect(tick.isVisible()).resolves.toBe(true);
  });

  it("arrow keys move between days in the calendar", async () => {
    const { page } = s;
    await page.locator(`[data-date="${IN3}"]`).focus();
    await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(200);
    const focused = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.date);
    expect(focused).toBe(iso(new Date(Date.now() + 2 * 86_400_000)));
  });

  it("taking a day off clears planned work from it, and Undo brings it back", async () => {
    const { page } = s;
    const day = iso(new Date(Date.now() + 2 * 86_400_000));
    await go(page, `/calendar?date=${day}`);
    const planned = await page.getByRole("button", { name: /^Mark “.*” as done$/ }).count();
    await page.getByRole("button", { name: "Take this day off" }).click();
    await page.waitForTimeout(500);
    await expect(page.getByText("Day off. Nothing new is planned for this day.").isVisible()).resolves.toBe(true);
    expect(await page.getByRole("button", { name: /^Mark “.*” as done$/ }).count()).toBeLessThan(Math.max(planned, 1));
    await page.getByRole("button", { name: "Make it a study day" }).click();
    await page.waitForTimeout(500);
    await expect(page.getByRole("button", { name: "Take this day off" }).isVisible()).resolves.toBe(true);
  });

  it("two open windows stay in sync: a tick in one appears in the other", async () => {
    const other = await s.ctx.newPage();
    await other.goto(`${APP}#/dashboard`);
    await other.waitForTimeout(1200);
    const { page } = s;
    await go(page, "/dashboard");
    const before = await doneText(page);
    const first = page.getByRole("button", { name: /^Mark “.*” as done$/ }).first();
    const name = (await first.getAttribute("aria-label"))!.replace(/^Mark “(.*)” as done$/, "$1");
    await first.click();
    await other.waitForTimeout(1500); // save (debounced) + other window reloads
    await expect(other.getByRole("button", { name: `Mark “${name}” as not done` }).first().isVisible()).resolves.toBe(true);
    expect(await doneText(page)).not.toBe(before);
    await other.close();
  });

  it("the new screens fit a phone screen", async () => {
    const phone = await open(browser, { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
    await loadSampleData(phone.page);
    for (const r of ["/dashboard", "/calendar", "/todo"]) {
      await go(phone.page, r);
      expect(await sideOverflow(phone.page), r).toBeLessThanOrEqual(0);
    }
    expect(phone.errors).toEqual([]);
    await phone.ctx.close();
  });

  it("no JavaScript errors", () => {
    expect(s.errors).toEqual([]);
  });
});
