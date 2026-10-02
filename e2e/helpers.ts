import { chromium, webkit, type Browser, type BrowserContext, type Page } from "playwright-core";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

export const APP = pathToFileURL(fileURLToPath(new URL("../standalone/index.html", import.meta.url))).href;
export const OUT = fileURLToPath(new URL("../e2e-results/", import.meta.url));
mkdirSync(OUT, { recursive: true });

const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export const PHONE = { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
export const LAPTOP = { viewport: { width: 1440, height: 900 } };

/** BROWSER=webkit runs the suite in WebKit, Safari's engine (`npx playwright-core install webkit` first). */
export const ENGINE = process.env.BROWSER === "webkit" ? "webkit" : "chrome";

export async function launch(): Promise<Browser> {
  if (ENGINE === "webkit") return webkit.launch({ headless: true });
  if (!existsSync(CHROME)) throw new Error(`Chrome not found at ${CHROME}. Set CHROME_PATH.`);
  return chromium.launch({ executablePath: CHROME, headless: true });
}

export interface Session { ctx: BrowserContext; page: Page; errors: string[] }

/** A fresh browser profile (empty storage) with page + console errors collected. */
/** `bypassCSP` is only for test tooling that injects scripts (axe); the app itself always runs under its policy. */
export async function open(browser: Browser, device: object = PHONE, colorScheme: "light" | "dark" = "light", opts: { bypassCSP?: boolean } = {}): Promise<Session> {
  const ctx = await browser.newContext({ ...device, colorScheme, acceptDownloads: true, bypassCSP: !!opts.bypassCSP });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    // Google Fonts can't load offline; that's expected and not an app error.
    if (m.type() === "error" && !/fonts\.(googleapis|gstatic)/.test(m.text())) errors.push(`console: ${m.text()}`);
  });
  await page.goto(APP);
  return { ctx, page, errors };
}

export const go = (page: Page, route: string) => page.goto(`${APP}#${route}`).then(() => page.waitForTimeout(700));

export async function loadSampleData(page: Page) {
  await page.getByRole("button", { name: "Try it with sample data" }).click();
  await page.waitForURL(/#\/dashboard/);
  await page.waitForTimeout(800);
}

/** Pixels the page overflows sideways (0 = fits the screen). */
export const sideOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

export function saveJson(name: string, data: unknown) {
  writeFileSync(OUT + name, JSON.stringify(data, null, 2));
}
