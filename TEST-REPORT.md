# Student OS — test report

## Update (2026-10-02): your data survives leaving, quitting and power cuts

**Result:** 110/110 unit tests · **57/57 browser tests in Chrome and 57/57 in WebKit** (Safari's engine), run twice each.

New tests use a real on-disk browser profile, then reopen it:
- close the tab the instant after a change: kept, and no "Leave site?" warning;
- quit the browser straight after a change: kept;
- force-kill the whole browser (like a power cut or crash) once a change is saved: kept. Changes reach the disk about 0.15 s after a click;
- a save cut off half-way: the rescue copy made on the way out is recovered, then cleaned up;
- Settings shows whether the browser protects the data from automatic clearing.

How it works: writes go to disk immediately after a one-off change and only count once they're on disk ("strict" durability); an instant copy is kept for one-off changes and whenever the page is hidden or closed; start-up uses the newest copy; the app asks for persistent storage; a backup reminder appears every two weeks.

Bugs found on the way, fixed:
- **App could hang on its loading screen** if the address changed while it was starting (seen after a restart in Safari's engine). The page router now always reads the current address.
- Start-up could prefer an older saved copy over a newer fallback copy; it now picks the newest.

Limits: nothing can save a change made a split second before the power is cut, before it reaches the disk (about 0.15 s). Clearing the browser's data deletes everything: keep a backup.

## Update (2026-10-02, later): tested in Safari's engine

Ran the full browser suite in **WebKit 26.6** (Safari's engine, via Playwright): first run 46/51. Fixed what it found, then **51/51 in WebKit and 51/51 in Chrome**; 110/110 unit tests.

Safari-only bugs found and fixed:
- **Dashboard scrolled sideways on iPhone-size screens (50 px).** A screen-reader-only label inside the scrollable "Recent exams" table escaped its box in Safari; every scroll box now contains its children. A long "Biggest loss" badge couldn't wrap with Safari's wider SF Pro Rounded font; it wraps now.
- **PDF reading logged errors in Safari** (a page opened from disk can't start pdf.js's worker from a blob). pdf.js now runs on the page from the start via its main-thread hook. Side benefit: `blob:` scripts are no longer allowed by the security policy.

Caveat: Playwright's WebKit is Safari's engine, not the Safari app, and it ran on a Mac, not an iPhone.

## Update (2026-10-02): calendar, to-do list, security hardening

**Final run:** type check clean · **110/110 unit tests** · **51/51 browser tests** · Next.js and single-file builds succeed · `npm audit`: 0 vulnerabilities.

New features tested: one task list shared by Today, To-do and Calendar (add/tick in one place shows everywhere), drag a task to another day, arrow-key navigation in the calendar, take a day off (planned work moves, your own tasks stay, Undo works), live sync between two open windows, no sideways scrolling on a phone.

Bugs found and fixed in this round:
- Calendar arrow keys moved from the *selected* day instead of the *focused* day.
- PDF import would have failed on Safari older than 18.2 (pdf.js modern build needs `Promise.try`). Now uses the legacy build plus a `Promise.withResolvers` fallback; verified with those features removed from the browser.
- Restoring a crafted backup could overwrite the app's own functions or crash it; backups are now validated field by field.

Security hardening (each has a browser test): strict hash-based Content Security Policy in `index.html` (injected scripts, inline handlers, string-eval and requests to unlisted sites are blocked); security headers on the hosted version; HTML typed into tasks is shown as text, never run; PDF reading is text-only with size/page caps; OCR loads only version-pinned files; server AI routes are same-site only, size-capped and rate-limited.

Not possible to promise: "unhackable". The attack surface is small (no server, no accounts, data stays in the browser), but anyone with access to the computer's browser profile can read its data and saved AI key. Real Safari wasn't run (no WebKit engine installed); compatibility was checked by feature analysis and simulation.

## Update (2026-10-02): AI switched from Grok to Google Gemini

- Model `gemini-3.5-flash-lite` via the Gemini API's `generateContent` (JSON schema output), falling back to `gemini-2.5-flash-lite` if a key can't use it. Key goes in the `x-goog-api-key` header, never the URL.
- Settings → AI assistance asks for a Google Gemini key (starts with `AIza` or, for newer keys, `AQ.`; free from aistudio.google.com/apikey). Saved Grok/Claude keys are deleted from the browser. Server env var is now `GEMINI_API_KEY`.
- Results: 93/93 unit tests, 34/34 browser tests (one dark-mode test was timing-sensitive; it now waits for the save before reloading), type check clean.
- Live check from the Desktop file: a wrong-format key is refused without a network call; a fake `AIza…` key reaches Google, is rejected with a clear message and is not saved. A live Gemini reply is still untested (no real key available).

## Update, 1 Oct 2026: all problems fixed; AI switched to Grok

**After the fixes:** 125 of 125 tests pass (91 unit + 34 end-to-end). The accessibility checker finds **0 violations**, down from 405. There are no JavaScript errors and no sideways scrolling on any screen. The app is usable 0.25 s after opening.

| # | Problem | Fix |
|---|---|---|
| 1 | Negative marks exported as text | Numbers are no longer prefixed. Formula text such as `=…` and `@…` is still neutralised. |
| 2 | Built-in syllabus reader misfiled chapters on the real notice | Names cut by a subject label are rejoined, and a line printed just above a subject label goes under it (checked against subject keywords). The real notice now reads 16/16 rows correctly. |
| 3 | "Delete all data" kept the AI key | The key is now removed too, and the confirmation says so. |
| 4 | "Work, Energy and Power" split | Kept together, as is "Sets, Relations and Functions". |
| 5 | Single file called `/api/ai` | The single-file build knows it has no server and never calls it. |
| 6 | "Your plan is ready" came back on reload | The one-time `?created=1` is removed from the address. `?tab=` links now switch tabs on the same page. |
| — | Readability and tap targets | Stronger red text; a fixed red for count badges in dark mode; blue tab labels readable in dark mode; recoloured heatmap; darker secondary grey. Difficulty pills, icon buttons, preset chips and "→" links are now at least 32–36 px. Scrollable tables are reachable by keyboard; headings, page regions and table columns are labelled. |

**AI now uses Grok (xAI)** instead of Claude Haiku:
- **Model:** `grok-4.20-0309-non-reasoning` through xAI's Chat Completions API, with a strict JSON schema (see `src/lib/ai/grok.ts`).
- **Keys:** xAI keys start with `xai-`; get one at console.x.ai. Keys are stored only in the browser, and any old Claude key is deleted. The server version reads `XAI_API_KEY`.
- **Verified:** xAI accepts calls from the browser, including from `index.html`. A fake key sent from the Desktop file got xAI's real rejection, and the app showed "xAI rejected this key". A live Grok reply couldn't be tested without a real key.

---

*The original report, before the fixes, follows.*


**Date:** 1 Oct 2026. **Build tested:** the single-file app (`standalone/index.html`, the copy on the Desktop), in real Chrome.

## How to re-run

```bash
npm test          # unit tests (logic, store, parsers, exports, AI with a mocked client)
npm run test:e2e  # builds index.html, then drives it in Chrome (phone + laptop)
```

E2E results, screenshots and the accessibility data go to `e2e-results/`.

## Results at a glance

| Suite | Tests | Passed | Failed | What it covers |
|---|---|---|---|---|
| Unit (existing) | 53 | 53 | 0 | Scoring, parsers, planner loop, AI extraction (mocked) |
| Unit (new): store | 16 | 16 | 0 | Import → plan, difficulty, quick add, ticking, replace/delete syllabus, two goal exams |
| Unit (new): exports and inputs | 13 | 10 | **3** | CSV, backups, awkward pasted text |
| E2E: onboarding (phone) | 12 | 10 | **2** | Welcome → create exam → import notice → to-do list → Today → tab bar |
| E2E: analyzer (laptop) | 8 | 8 | 0 | Sample paper → review → marking → answers → results → diagnose → report |
| E2E: settings and data | 6 | 5 | **1** | AI key, backup, dark mode, delete all |
| E2E: PDF uploads | 3 | 2 | **1** | Your real syllabus PDF; sample paper and key PDFs |
| E2E: health sweep | 5 | 5 | 0 | 10 screens × phone/laptop × light/dark: errors, layout, accessibility, speed |
| **Total** | **116** | **109** | **7** | |

**What works well.** These checks found no problems:
- **Core flows:** onboarding, the full analyzer flow, PDF reading of papers and keys, persistence after reload, plan rules (never over your daily study time, nothing after the exam date, every topic scheduled) and difficulty → study time (45/60/90 min).
- **Stability and layout:** across 40 screen checks (10 screens on phone and laptop, light and dark) there were no crashes or JavaScript errors and nothing scrolls sideways.
- **Speed:** the app is usable 0.25 s after opening the file.

## Problems found (failing tests)

| # | Problem | Severity | Where |
|---|---|---|---|
| 1 | **Negative marks export as text.** CSV cells such as `-1` become `'-1` (the formula-injection guard catches minus signs), so Excel/Sheets can't total the Marks or Negative columns. | Medium | `src/lib/export.ts` `csvCell` |
| 2 | **Built-in syllabus reader (no AI key) on your real PDF:** "Mole Concept & Stoichiometry" and "Concentration" are filed under Physics, "Integral Calculus" is split into "Integral" + "Calculus", and "Concentration Units" into "Concentration" + "Units". | Medium | `parseSyllabusText`, used when no AI key is set |
| 3 | **Chapter names containing commas are split:** "Work, Energy and Power" becomes "Work" and "Energy and Power". | Low–Medium | Same parser |
| 4 | **"Delete all data" keeps your saved Anthropic API key** in the browser. | Medium (privacy) | Settings |
| 5 | **The single-file app calls `/api/ai`,** a server that doesn't exist in `index.html`, logging 2 console errors on every syllabus or paper import. Harmless but noisy. | Low | `detectAiSource`, Settings page |
| 6 | **"Your plan is ready" banner reappears** every time you reload the plan page after creating an exam (`?created=1` stays in the address). | Low | Plan page |

**Found during testing but not a separate failing test:**
- **Tab links on the same page:** opening `…/pilot/<id>?tab=todo` while already on that plan page doesn't switch tabs. The tab is only read when the page first loads.
- **Out-of-date wording:** the empty "Welcome" screen (after Delete all data) still says "pick a syllabus template", but templates are now optional.
- **My earlier instruction was wrong:** I said "Delete all data" would bring back the welcome page. It actually keeps you in the app on an empty start screen.

## Accessibility (axe-core, WCAG 2.1 AA)

| Issue | How many | Detail |
|---|---|---|
| Colour contrast | 129 | Red text on light-red tags (e.g. "High" priority): 4.44:1, minimum 4.5:1. Very slightly short. |
| | 64 | Heatmap: white or dark numbers on mid-blue cells: 3.5–3.6:1. |
| | 8 | **Dark mode:** white "12" on the pink Mistakes badge: 2.2:1. Hard to read. |
| | 6 | Grey text on grey chips: 4.34:1. |
| | 6 | **Dark mode:** blue accent text on near-black: 3.4:1, e.g. the active tab label. |
| Small tap targets on phone | 56 controls | Under 32 px, e.g. the Easy/Medium/Hard pills (24 px tall), "Show data table", inline links such as "Full plan →". Apple recommends 44 px. |
| Scrollable table not reachable by keyboard | 1 screen | Settings → Error categories |
| Heading levels skip | 1 screen | Analytics chart cards |
| Empty table headers | 3 screens | Action columns have no label |

## Not tested (and why)

- **Live Claude Haiku calls:** there is no API key on this machine. They are covered with a mocked client, and a fake key got a real rejection from Anthropic.
- **Photo OCR:** Tesseract downloads language data from the internet on first use.
- **Real iPhone and Safari:** only Chrome was available. Phone layout was emulated at 375×812.
- **Printing the report to PDF.**

## Room for improvement (not bugs)

1. **Fix the issues above:** CSV numbers, delete-all clearing the API key, `/api/ai` calls in the single file, the reload banner, and contrast in dark mode. All are quick fixes.
2. **Better offline syllabus reading:** teach the built-in reader common chapter names (Work, Energy and Power; Mole Concept; Integral Calculus…) so it does better without an AI key.
3. **Bigger tap targets on phones:** 44 px difficulty pills, and turn "→" text links into full-width rows.
4. **Question Bank and Notebook filters on phones:** seven stacked dropdowns take a full screen. Put them behind a "Filters" button that opens a sheet.
5. **Installable app (PWA):** add to the home screen, work offline, and get an icon, as the Student OS handoff suggests.
6. **Focus timer and reminders:** Student OS's ▶ focus blocks and a daily nudge would help students actually start tasks.
7. **Backup reminders:** data lives only in one browser. Remind students to export weekly, or add optional sync.
8. **Run the end-to-end tests in WebKit (Safari)** before relying on iPhone use.
