/**
 * Data must survive the student leaving: closing the tab, quitting the browser, or the device
 * shutting down / crashing. These use a real on-disk browser profile and reopen it afterwards.
 */
import { afterAll, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BrowserContext, Page } from "playwright-core";
import { APP, go, launchProfile, loadSampleData } from "./helpers";

const dirs: string[] = [];
const newProfile = () => {
  const d = mkdtempSync(join(tmpdir(), "student-os-profile-"));
  dirs.push(d);
  return d;
};
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

async function firstPage(ctx: BrowserContext): Promise<Page> {
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto(APP);
  return page;
}
async function addTask(page: Page, title: string) {
  await go(page, "/todo");
  await page.getByLabel("Add a task for today").fill(title);
  await page.keyboard.press("Enter");
}
/** Waits (up to 10 s, a restarted browser can be slow to load) for an open task; returns how many match. */
async function hasTask(page: Page, title: string) {
  const t = page.getByRole("button", { name: `Mark “${title}” as done` });
  await t.first().waitFor({ timeout: 10_000 }).catch(() => {});
  return t.count();
}

/** Kills every process of the browser using this profile, with no chance to save: like pulling the plug. */
function pullThePlug(dir: string) {
  try {
    execSync(`pkill -9 -f ${JSON.stringify(dir)}`);
  } catch {
    /* already gone */
  }
}

describe("your data survives leaving", () => {
  it("closing the tab the instant after a change keeps it, with no 'Leave site?' warning", async () => {
    const dir = newProfile();
    const ctx = await launchProfile(dir);
    const page = await firstPage(ctx);
    await loadSampleData(page);
    await page.waitForTimeout(800);
    const dialogs: string[] = [];
    page.on("dialog", (d) => { dialogs.push(d.type()); void d.accept(); });
    await addTask(page, "Closed right away");
    await page.close({ runBeforeUnload: true }); // no waiting at all
    const again = await ctx.newPage();
    await go(again, "/todo");
    expect(await hasTask(again, "Closed right away")).toBe(1);
    expect(dialogs).toEqual([]);
    await ctx.close();
  });

  it("quitting the browser straight after a change keeps it", async () => {
    const dir = newProfile();
    let ctx = await launchProfile(dir);
    let page = await firstPage(ctx);
    await loadSampleData(page);
    await page.waitForTimeout(800);
    await addTask(page, "Quit right away");
    await ctx.close();
    ctx = await launchProfile(dir);
    page = await firstPage(ctx);
    await go(page, "/todo");
    expect(await hasTask(page, "Quit right away")).toBe(1);
    await ctx.close();
  });

  it("a sudden shutdown or crash (browser killed, no chance to save) keeps everything saved a moment earlier", async () => {
    const dir = newProfile();
    let ctx = await launchProfile(dir);
    let page = await firstPage(ctx);
    await loadSampleData(page);
    await page.waitForTimeout(800);
    await addTask(page, "Before the power cut");
    await page.getByRole("button", { name: "Mark “Before the power cut” as done" }).click();
    // Pull the plug as soon as the app has the change on disk (usually ~150 ms after the click).
    const onDisk = () => page.evaluate(async () => {
      const db: IDBDatabase = await new Promise((res) => { const r = indexedDB.open("keyval-store"); r.onsuccess = () => res(r.result); });
      const v = await new Promise<{ state?: { tasks?: { title: string; status: string }[] } }>((res) => { const r = db.transaction("keyval").objectStore("keyval").get("exam-pilot-data"); r.onsuccess = () => res(r.result); });
      db.close();
      return !!v?.state?.tasks?.some((t) => t.title === "Before the power cut" && t.status === "done");
    });
    for (let i = 0; i < 200 && !(await onDisk()); i++) await page.waitForTimeout(50);
    pullThePlug(dir);
    await ctx.close().catch(() => {});
    ctx = await launchProfile(dir);
    page = await firstPage(ctx);
    await go(page, "/dashboard");
    const done = page.getByRole("button", { name: "Mark “Before the power cut” as not done" });
    await done.first().waitFor({ timeout: 10_000 }).catch(() => {});
    await expect(done.count()).resolves.toBe(1);
    await ctx.close();
  });

  it("if the last save was cut off, the rescue copy made on the way out is recovered", async () => {
    const dir = newProfile();
    let ctx = await launchProfile(dir);
    let page = await firstPage(ctx);
    await loadSampleData(page);
    await page.waitForTimeout(800);
    // Recreate what the app leaves behind when a save is interrupted: an older copy on disk,
    // plus a newer rescue copy (made as the page closed) that holds the last change.
    await page.evaluate(async () => {
      const db: IDBDatabase = await new Promise((res, rej) => { const r = indexedDB.open("keyval-store"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
      const saved = await new Promise<{ state: { settings: { studentName: string } }; savedAt?: number }>((res) => {
        const r = db.transaction("keyval").objectStore("keyval").get("exam-pilot-data");
        r.onsuccess = () => res(r.result);
      });
      const rescued = structuredClone(saved);
      rescued.state.settings.studentName = "Rescued Student";
      const at = Date.now() + 60_000;
      localStorage.setItem("exam-pilot-data:rescue", JSON.stringify({ ...rescued, savedAt: at }));
      localStorage.setItem("exam-pilot-data:rescue-at", String(at));
    });
    await page.waitForTimeout(1500); // browsers write their own storage to disk within about a second
    await ctx.close();
    ctx = await launchProfile(dir);
    page = await firstPage(ctx);
    await go(page, "/dashboard");
    await page.getByText(/Rescued Student/).first().waitFor({ timeout: 10_000 }).catch(() => {});
    await expect(page.getByText(/Rescued Student/).first().isVisible()).resolves.toBe(true);
    expect(await page.evaluate(() => localStorage.getItem("exam-pilot-data:rescue"))).toBeNull(); // cleaned up
    await ctx.close();
  });

  it("asks the browser to protect the data from automatic clearing", async () => {
    const dir = newProfile();
    const ctx = await launchProfile(dir);
    const page = await firstPage(ctx);
    await loadSampleData(page);
    await go(page, "/settings");
    await expect(page.getByText(/Protected|Not protected/).first().isVisible()).resolves.toBe(true);
    await ctx.close();
  });
});
