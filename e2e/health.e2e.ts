/**
 * Health sweep over every screen with sample data, on a phone and a laptop,
 * in light and dark: JavaScript errors, sideways scrolling, tap-target size,
 * accessibility (axe-core) and load time. Writes e2e-results/health.json.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { Browser, Page } from "playwright-core";
import { APP, go, LAPTOP, launch, loadSampleData, open, PHONE, saveJson, sideOverflow } from "./helpers";

const axeSource = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
const ROUTES = ["/dashboard", "/todo", "/calendar", "/exams", "/pilot", "/analyzer", "/analyzer/new", "/notebook", "/question-bank", "/analytics", "/settings", "/exams/new"];

interface RouteResult {
  route: string; device: string; theme: string; overflowPx: number; errors: string[];
  smallTargets: string[]; axe: { id: string; impact: string | null; help: string; nodes: number; sample: string }[];
}
const results: RouteResult[] = [];
let browser: Browser;

beforeAll(async () => { browser = await launch(); });
afterAll(async () => {
  saveJson("health.json", results);
  await browser?.close();
});

/** Buttons/links smaller than 32×32 px that people tap on phones (WCAG 2.5.8 asks for 24, iOS for 44). */
const smallTargets = (page: Page) => page.evaluate(() => {
  const out: string[] = [];
  for (const el of Array.from(document.querySelectorAll("main button, main a, main [role=radio], nav a, nav button"))) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || getComputedStyle(el).visibility === "hidden") continue;
    if (r.width < 32 || r.height < 32) out.push(`${(el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 30)} (${Math.round(r.width)}×${Math.round(r.height)})`);
  }
  return [...new Set(out)];
});

async function axe(page: Page) {
  await page.addScriptTag({ content: axeSource });
  return page.evaluate(async () => {
    // @ts-expect-error axe is injected above
    const r = await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"] });
    return r.violations.map((v: { id: string; impact: string | null; help: string; nodes: { target: string[] }[] }) =>
      ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, sample: String(v.nodes[0]?.target?.[0] ?? "") }));
  });
}

for (const [device, opts] of [["phone", PHONE], ["laptop", LAPTOP]] as const) {
  for (const theme of ["light", "dark"] as const) {
    describe(`every screen · ${device} · ${theme}`, () => {
      it("has no JS errors, no sideways scrolling, and records accessibility issues", async () => {
        const s = await open(browser, opts, theme, { bypassCSP: true }); // axe is injected as a script
        await loadSampleData(s.page);
        const bad: string[] = [];
        for (const route of ROUTES) {
          const before = s.errors.length;
          await go(s.page, route);
          await s.page.waitForTimeout(500);
          const overflow = await sideOverflow(s.page);
          const r: RouteResult = {
            route, device, theme, overflowPx: overflow, errors: s.errors.slice(before).filter((e) => !/api\/ai|ERR_FAILED/.test(e)),
            smallTargets: device === "phone" && theme === "light" ? await smallTargets(s.page) : [],
            axe: theme === "light" || device === "phone" ? await axe(s.page) : [],
          };
          results.push(r);
          if (r.errors.length) bad.push(`${route}: ${r.errors.join(" | ")}`);
          if (overflow > 1) bad.push(`${route}: page scrolls sideways by ${overflow}px`);
        }
        await s.ctx.close();
        expect(bad).toEqual([]);
      });
    });
  }
}

describe("speed", () => {
  it("the single-file app is usable within 3 seconds of opening", async () => {
    const s = await open(browser, PHONE);
    await s.page.goto("about:blank");
    const t0 = Date.now();
    await s.page.goto(APP);
    await s.page.getByRole("button", { name: "Start with my own exam" }).waitFor({ state: "visible" });
    await s.page.waitForFunction(() => !(document.querySelector("button[disabled]")));
    const ms = Date.now() - t0;
    saveJson("speed.json", { firstUsableMs: ms });
    await s.ctx.close();
    expect(ms).toBeLessThan(3000);
  });
});
