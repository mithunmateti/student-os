# Exam Pilot

**Know what happened in your exam, why you lost marks, and exactly what to do next.**

Exam Pilot joins two systems into one loop:

- **Exam Pilot (preparation)** turns an exam date, a syllabus, your study time and your real test results into an explainable daily plan. Revision time is protected, and every task says why it's there.
- **Exam Analyzer (post-exam)** imports a question paper and answer key (PDF, photos, pasted text or manual structure). You verify them, confirm any marking scheme, and enter your answers in a fast keyboard grid. It then scores the paper deterministically, helps you diagnose each lost mark, and feeds the findings back into the plan.

```
Plan → Study → Practice → Take exam → Analyze → Diagnose → Adapt plan → Repeat
```

## Quick start: just open it

Download **`index.html`** from this repository and double-click it. The whole app runs in your browser from that one file, with no install, no account and no server. Your data stays in that browser (export a backup from Settings to move it).

Optional AI help: get a free Google Gemini API key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey) and paste it into **Settings → AI assistance**. Each person uses their own key; it is stored only in their browser.

To rebuild `index.html` after changing the code: `npm install && npm run build:single && cp standalone/index.html index.html`.

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:3000 and choose **Start with my own exam** or **Try it with sample data**. Once set up, opening the app goes straight to the Today screen.

The demo is a JEE Main goal exam with four fully analyzed 100-question revision tests (+4/−1/0), an upcoming mock, an Error Notebook and an adapted plan. Every number in the demo is computed from raw responses by the same engines your own data uses.

### Single-file version (`index.html`)

```bash
npm run build:single
```

This writes **`standalone/index.html`**: the whole app (all screens, demo data, charts, PDF import) in one self-contained file. Double-click it to open it in a browser, with no install or server. Routes live in the URL hash (`index.html#/dashboard`), and data is saved in that browser. Two things need internet the first time: OCR of photos (Tesseract downloads its language data), and the optional Grok extraction, which needs an xAI API key added in Settings → AI assistance.

Other scripts:

| Command | What it does |
|---|---|
| `npm test` | Domain test suite (scoring, parsers, patterns, planner, adaptation loop) |
| `npm run typecheck` | TypeScript check |
| `npm run build && npm start` | Production build and server |
| `node scripts/make-samples.mjs` | Regenerates the sample question-paper and answer-key PDFs in `public/samples/` |

## Look and feel

The UI follows the Student OS design (`~/Desktop/Student os/HANDOFF.md`):
- **Type and colour:** rounded heavy type (SF Pro Rounded, falling back to Nunito), an iOS grey background with white 22px cards, one blue accent (`#0A66E0`), and subject colours for Physics, Chemistry, Maths, Biology and Other.
- **Phones:** a frosted bottom tab bar (Today · Plan · Analyze · Mistakes · More), large titles, and dialogs that open as bottom sheets.
- **Today screen:** quick-add with subject chips, a progress ring, and task rows with round ticks.
- **Theme:** dark mode, toggled from the moon button or More → Appearance.

## Features

**Dashboard.** Shows the next exam countdown, an explainable readiness index, today's plan and the latest analysis (with the reason the score changed). It also shows weakest areas, recurring mistakes, what changed in the plan, recommended actions, trends and recent exams. It adapts to each state: new user, exam without analysis, first analysis, several exams, and final-prep mode inside 7 days.

**My Exams.** Goal exams own a plan. Mock and practice tests link to a goal exam, are scheduled into its plan, and feed it when analyzed. Each exam hub has overview, syllabus, tests and marking tabs.

**Syllabus.** A new exam starts empty (no sample topics). Import your syllabus, add subjects and chapters yourself, or opt into a JEE, NEET or SAT list. You can also import a PDF, image or text file, review the extraction and set each topic's difficulty (Easy / Medium / Hard) before saving. By default an imported syllabus replaces the template. Topics can be renamed, merged, split, deleted, added and prioritised, and each tracks its coverage.

**Topic to-do list.** Every syllabus topic of a goal exam appears as a to-do item on its plan page. Tick a topic off when it's done (this schedules revision), see when it's next scheduled, and change its difficulty. Hard topics get 90 minutes of first study, medium 60 and easy 45; hard topics also rank higher. The daily plan rebuilds immediately. Study tasks tied to a topic carry the same difficulty picker.

**Exam Pilot plan.** Built from days left, minutes per weekday, blocked dates, topic weightage and difficulty, coverage, marks lost per chapter, recurring error patterns, spacing, overdue work, revision checkpoints, Error Notebook retries and scheduled mocks.
- The topic ranking shows every signal and its points.
- Final-week mode pauses new low-yield topics.
- With several goal exams, study time is split by priority and urgency.
- Tasks you add or move are never overwritten when the plan regenerates.

**Exam Analyzer.** Six steps: Review import → Marking scheme → Your answers → Results → Diagnose errors → Report.
- **Review.** A verification table with confidence flags, "show only unresolved", search by question number, bulk approve and bulk edit, a full question editor with previous/next, key paste, topic suggestions, and add/delete questions.
- **Marking.** Section rules, decimal penalties, unattempted marks, partial credit for multiple-correct questions, optional-section attempt limits, per-question overrides, and bonus or dropped questions.
- **Answers.** A keyboard-first grid: `A`–`D` or `1`–`4` to answer, `0` for unattempted, `G` for guessed, `T` for ran out of time, `N` for next empty, and arrow keys to move. There is also a detailed list view with time spent, and paste-answers. Answers lock once results are calculated, and every later change is recorded in an audit trail.
- **Results.** Score, accuracy (correct ÷ attempted) and attempt rate are kept distinct. Also shows negative-mark impact, a per-subject table and an expandable per-question table.
- **Diagnose.** One card at a time with shortcut chips and evidence-based suggestions (for example "your answer is the negative of the key"). You can choose "Unknown / review later" instead of forcing a reason, add secondary reasons and notes, and add the mistake to the Error Notebook.
- **Report.** The 11 required sections plus a one-minute summary. Exports to Print/PDF, Markdown, CSV and JSON.

**Error Notebook.** Stores due and mastered mistakes. Actions: retry without seeing the key, add to spaced revision, mark understood, and schedule a redo. Exports to CSV.

**Question Bank.** Search and filter by subject, chapter, result, error type, exam, redo status and difficulty. Actions: review, retry, add a note, archive, and build practice sets to drill.

**Analytics.** Charts for score, accuracy and attempt rate, negative-mark impact, subject trends, a chapter accuracy heatmap, error-type distribution and a mark-loss waterfall. Every chart has a plain-language interpretation and a table view. Evidence-linked observations sit alongside.

**Settings.** Name, theme, editable error categories, revision schedule, planner defaults, default marking, backup export and restore, demo reset, and delete all.

## How numbers are defined

These metrics are implemented as pure functions in `src/domain/scoring.ts` and covered by tests.

| Metric | Definition |
|---|---|
| Score % | net score ÷ maximum score × 100 |
| Attempt rate | attempted ÷ gradable questions (gradable excludes bonus, dropped and unkeyed questions) |
| Attempt accuracy | correct ÷ attempted; shown as "—" when nothing was attempted |
| Negative-mark impact | the sum of penalties on wrong answers |
| Marks short | full marks − awarded, per question; this drives "where did I lose marks" |

When two papers have different maximum scores, comparisons switch to percentages automatically.

## Architecture

```
src/
  domain/            Framework-free logic (no React, no browser APIs)
    types.ts         Data model (Exam, Section, SyllabusTopic, Question, Response, Analysis, StudyTask, ...)
    scoring.ts       Deterministic scoring engine
    analysis.ts      Breakdowns, pattern detection, change explanation, recommendations
    planner.ts       Topic priorities, plan generation, revision checkpoints, readiness
    selectors.ts     Exam families, plan inputs, capacity split, adaptation log
    import/          Text → paper/key/syllabus parsers, draft builders, AI-result converter
    ai/heuristics.ts Transparent topic classification and error-reason suggestions
    demo/            Seeded demo data and the sample paper
  store/             Zustand store and debounced IndexedDB persistence (autosave, flush on hide)
  lib/               Browser adapters: PDF/OCR extraction, exports, hooks
  components/        UI primitives, charts, editors, analyzer shell, shared domain components
  app/               Next.js App Router screens (+ /api/ai optional server route)
```

- **Local-first.** All data lives in IndexedDB in the browser, with a localStorage fallback. Nothing is uploaded, and backups are JSON exports.
- **Import pipeline.** PDFs are read with pdf.js (text layer, line reconstruction and page references). Images go through Tesseract OCR in the browser. The parsers report skipped or duplicate numbers, restarted numbering, figures and low-confidence fields. Nothing is scored until you confirm the review.
- **Optional Gemini extraction.** Google Gemini (`gemini-3.5-flash-lite`, a fast, low-cost model with a free tier; falls back to `gemini-2.5-flash-lite` if a key can't use it) can pick the syllabus out of a test notice and structure messy question papers and keys. Add a free key from aistudio.google.com/apikey in Settings → AI assistance (stored only in that browser, never in backups, removed by Delete all data), or set `GEMINI_API_KEY` in `.env.local` for the server version. Calls go straight to the Gemini API's `generateContent` with a JSON schema; the key travels in a header, never the URL. Long papers are read in parts that are split at question boundaries and merged back in order. Only the extracted text is sent, never your answers. The results still go through the review table, and if AI fails the import falls back to the built-in parser. Cost: free within the free tier's limits, otherwise under a cent per syllabus and a few cents for a 90-question paper.

## Privacy and safety

- Files are validated for type (PDF, image or text) and size (25 MB max), processed on the device, and never logged. Only the file name and size are kept as a source reference.
- CSV exports neutralise spreadsheet formulas.
- The AI route treats document text as data, never invents answers, and caps its confidence so every result is reviewed.

## Tests

`npm test` runs 53 tests across five areas:

- **Scoring.** Correct, wrong and unattempted; decimal penalties; multiple-correct with and without partial credit; numerical answers with tolerance and fractions; bonus, dropped and unkeyed questions; section rules; optional sections; order independence.
- **Parsers.** Sections, options, skipped and duplicate numbers, figures, key formats, order-based key mapping, syllabus text, the bundled sample, topic classification.
- **The core loop on the demo.** Pattern detection, recommendations, plan adaptation, capacity limits, final-prep mode, scheduled mocks, readiness signals, change narratives.
- **Multiple goal exams.** Study time is split rather than double-booked.
- **AI extraction (mocked).** The Gemini request format, bad-key and rate-limit handling, paper chunking and merging, split-and-retry on cut-off replies, fallbacks, and syllabus extraction from a real test notice.
- **End to end (`npm run test:e2e`).** Drives the single-file app in Chrome: onboarding and syllabus import, the full analyzer flow, PDF uploads, settings and data safety, and a health sweep for errors, layout and accessibility. See `TEST-REPORT.md`.

## Known limitations

- Scanned PDFs have no text layer. Upload page photos for OCR, or paste the text. OCR quality depends on the photo.
- Equations and diagrams inside questions are flagged but not reproduced. Use the source page reference to find them.
- Marked response sheets (OMR) and institute result pages are attached as references; reading answers from them automatically is not implemented. The answer grid and paste-answers make manual entry quick.
- Single-user and single-browser. There is no cloud sync; use backup export and restore to move data.
- The Gemini features are tested with a mocked API and against Google's real error responses (a fake key), but not against a live model reply, because no Gemini key was available.
