# 2026-09-25 — Exam Pilot initial build

Built Exam Pilot end to end from `Exam_Pilot_PRD.docx` + `Exam_Pilot_Mega_Prompt.md`.

- Stack: Next.js 16 (App Router, Turbopack), React 19, TypeScript 7, Tailwind 4, Zustand + IndexedDB (local-first), Recharts, pdf.js, Tesseract.js, optional Anthropic SDK route.
- Domain logic in `src/domain` (framework-free): scoring, analysis/patterns, planner/readiness, parsers, heuristics, seeded demo.
- All 16 routes from the spec implemented; plus `/notebook` and `/api/ai`.
- Verified: 39 domain tests, typecheck, production build, browser run-through of the analyzer flow (sample text + real PDFs), plan creation, final-prep mode, notebook retry, mobile (no horizontal overflow), light/dark themes, 200-question answer grid.
- Not verified: the Claude extraction route against the live API (no key available).

## 2026-09-26 — Question-paper structuring moved to Claude Haiku 4.5

- `src/lib/ai/paper.ts`: shared Haiku paper structurer. It streams responses with a JSON schema, splits long papers at question starts (~14k chars per part, 2 parts at a time) and passes a section hint to later parts. It merges the parts by section name and subject, splits a part in half if the reply is cut off at max_tokens, and retries without the schema if the API rejects it.
- `/api/ai` POST now uses it instead of Opus 5. `aiStructurePaper` in `src/lib/ai/client.ts` uses the user's key in the browser, otherwise the server route.
- Analyzer import: the "Structure with Claude Haiku" switch is on by default whenever a key is available; otherwise it shows a tip pointing to Settings. The Settings copy is updated.
- 8 new tests (53 total). Browser check: a fake key gave a real 401 from Anthropic, followed by the built-in parser fallback.

## 2026-09-26 — Imported topics become a to-do list with difficulty

- The syllabus import review now has a difficulty column (Easy/Medium/Hard pills per row, plus "Set all"). It also has a "Replace the N topics already in the syllabus" option, on by default on the create page.
  - Replacing sets the Custom template and rebuilds subjects and sections from the import.
  - A test date from the document that has already passed is no longer applied.
- The plan page has a new "Topic to-do list" tab (opened right after creating an exam).
  - Each topic can be ticked done (coverage becomes covered, which schedules revision) and has a difficulty picker and its next session date.
  - Filters: still to do, all, or by difficulty.
- Store: `replaceTopics` and `setTopicDifficulty`, both of which regenerate the plan. The exam hub uses them for imports and difficulty edits.
- Planner: first-pass time is 45/60/90 min by difficulty; practice is 30/45/60.
- `TaskCard` shows a difficulty picker for topic tasks.
- Verified in the browser: imported the notice (fallback), replaced the 155 template topics with 18, and set difficulties. The to-do list showed all 18 topics, ticking one worked, and Vectors set to Hard gave a 90-minute Learn task.

## 2026-10-01 — Student OS UI style + usability pass

- Tokens (`globals.css`):
  - Student OS palette in light and dark, a rounded font stack with Nunito via Google Fonts, and font weights stepped up one notch.
  - 22px borderless cards. Fields are grey inside cards and sheets, white on the page.
  - New classes: `.subj-*` subject colours, `.subj-tag`, `.section-title`, and `--tabbar-h`.
- UI primitives:
  - Pill buttons, an iOS switch, chip tabs, and a segmented control with a blue selection.
  - Dialogs become bottom sheets on phones. Toasts are a dark pill above the tab bar.
  - Large-title `PageHeader`, plus new `ProgressRing`, `subjectClass` and `SubjectTag`.
- Shell:
  - Phones get a frosted bottom tab bar (Today/Plan/Analyze/Mistakes/More); More opens a sheet with the other pages and the theme setting. The hamburger header is removed.
  - The desktop sidebar is restyled, and the Dashboard is renamed "Today". There is a `ThemeButton` round toggle.
- Today (dashboard):
  - Large title, quick-add (type, subject chip, optional length) into today's plan, progress ring, overdue banner, mistakes-due row, and grouped `TaskList` rows.
- `TaskCard`: round subject-coloured tick, subject tag, no dot separators. "Move to tomorrow" and "Skip" are now soft buttons.
- Plan page: compact header buttons ("Rebuild plan"), a progress-ring card with a "Show finished" switch, and the topic to-do list with round ticks, subject sections and the ring.
- Analyzer list hides secondary columns on phones. Section headings use `.section-title`.
- Verified with headless Chrome screenshots on mobile, desktop and dark mode:
  - no page errors;
  - the standalone file:// build works;
  - quick-add then tick changes the count from 0 of 6 to 1 of 6.
- 53 tests pass and both builds succeed.

## 2026-10-01 — Welcome page restyle, no sample topics by default

- The welcome page (`src/app/page.tsx`) is rebuilt in the Student OS style: app icon, large title, a three-row feature list, and full-width "Start with my own exam" / "Try it with sample data" buttons. The old marketing hero, grid background and preview card are gone.
  - Returning users are redirected to /dashboard. The check runs once on first hydration, so finishing setup still goes on to /exams/new.
- Create exam starts with no subjects, no topics and a single "Section 1".
  - A prominent "Import your syllabus" tile is shown.
  - The JEE/NEET/SAT lists are opt-in behind "Or start from a ready-made list".
  - Adding the first subject replaces the placeholder section.
- The syllabus editor has a "Select all" button. Bulk delete asks for confirmation above 10 topics.
- `next.config.ts` `allowedDevOrigins` covers private LAN ranges, so phones can open the dev server.

## 2026-10-01 — Test suite, fixes from the test report, Claude → Grok

- Tests:
  - New unit tests: `src/store/store.test.ts`, `src/lib/export.test.ts`, `src/lib/ai/grok.test.ts`.
  - New end-to-end suite in `e2e/` (vitest + playwright-core + axe-core, against `standalone/index.html` in system Chrome), run with `npm run test:e2e`. It writes `e2e-results/`.
  - Result: 125/125 pass and axe reports 0 violations. Full write-up in `TEST-REPORT.md`.
- Fixes:
  - CSV numbers stay numeric.
  - `untangleTableRows` in the syllabus parser, plus keeping comma names together.
  - Delete-all clears the AI key.
  - `NEXT_PUBLIC_STANDALONE` define, so the single file never calls `/api/ai`.
  - `dropSearchParams` and tab re-read on hashchange/popstate.
  - Contrast tokens (`--badge`, heat ramp, `--fg-3`, `--muted-status`, `--bad`), larger targets, a11y labels and regions.
- AI:
  - `@anthropic-ai/sdk` removed.
  - `src/lib/ai/grok.ts` (fetch → api.x.ai `/v1/chat/completions`, strict `json_schema`, a `json_object` fallback, retries, errors classified from xAI's 400 "Incorrect API key").
  - Model `grok-4.20-0309-non-reasoning`; env var `XAI_API_KEY`; browser key `exam-pilot-xai-key`.
  - Extraction functions take a `JsonCaller` (`extractSyllabusWithAI`, `structurePaperWithAI`).

## 2026-10-02 — Grok → Google Gemini
- New `src/lib/ai/gemini.ts` (geminiCaller, checkGeminiKey, classify for Google error shapes incl. API_KEY_INVALID and RetryInfo); removed grok.ts. Model gemini-3.5-flash-lite, fallback gemini-2.5-flash-lite on 404.
- UI copy, key prefix `AIza`, storage key `exam-pilot-gemini-key` (old xai/anthropic keys purged), env `GEMINI_API_KEY`, README, tests updated.
- 93 unit + 34 e2e pass; Desktop index.html replaced (md5 b2842e6ca8b472a6a452c48d16ee9c61).

## 2026-10-02 — Calendar, To-do, dashboard redesign, security hardening
- `src/domain/agenda.ts` (+tests): buildAgenda, monthGrid, studyStreak, todoBuckets, lastSevenDays. `src/components/agenda.tsx`: MonthCalendar (drag/drop, arrow keys), WeekStrip, AddTaskInline, DayDetails, ComingUp. Pages `/calendar`, `/todo`; dashboard redesigned (summary tiles, week strip, mini calendar). TopicTodo moved to `src/components/topic-todo.tsx`.
- Store: `updateTask`, `setDayOff`; cross-tab live sync in `src/store/storage.ts` (BroadcastChannel + localStorage ping, quiet re-saves avoid ping-pong).
- Security: `scripts/add-csp.mjs` (hash CSP for standalone), CSP + headers in `next.config.ts`, strict `parseBackup`, `src/lib/ai/guard.ts` for server routes, pdf.js text-only options + 300-page cap, legacy pdf.js + `src/lib/polyfills.ts` for Safari 16.4+.
- Tests: 110 unit, 51 e2e (new: agenda.e2e.ts, security.e2e.ts, OCR photo and old-browser PDF tests).
