/**
 * Realistic seeded demo: a JEE Main goal exam with four fully analyzed revision
 * tests (100 questions each, +4/−1/0) and one upcoming test. Every number the
 * app shows is computed from these raw responses by the real engines — nothing
 * here is a pre-baked statistic.
 */
import { buildSnapshot } from "../analysis";
import { DEFAULT_ERROR_CATEGORIES, DEFAULT_PLANNER, DEFAULT_REVISION } from "../catalog";
import { generatePlan, revisionItemsForTopic } from "../planner";
import { describeAdaptation, familyAnalyses, planInput } from "../selectors";
import { formatKey, formatResponse, scorePaper } from "../scoring";
import { SYLLABUS_TEMPLATES } from "../syllabi";
import type {
  AppData, Analysis, CoverageStatus, Exam, ExamSection, NotebookEntry, QResponse, Question, Settings, StudyTask, SyllabusTopic,
} from "../types";
import { addDays, OPTION_KEYS, seededRandom, today as todayFn, uid } from "../util";
import { TEMPLATES, type Template } from "./templates";

export const DATA_VERSION = 1;

export function defaultSettings(name = ""): Settings {
  return {
    studentName: name,
    theme: "system",
    errorCategories: DEFAULT_ERROR_CATEGORIES.map((c) => ({ ...c })),
    revision: { ...DEFAULT_REVISION, offsets: [...DEFAULT_REVISION.offsets] },
    planner: { ...DEFAULT_PLANNER, minutesByWeekday: [...DEFAULT_PLANNER.minutesByWeekday], blockedDates: [] },
    defaultRule: { correct: 4, wrong: 1, unattempted: 0 },
    onboarded: false,
  };
}

export function emptyData(name = ""): AppData {
  return {
    version: DATA_VERSION,
    settings: defaultSettings(name),
    exams: [],
    topics: [],
    analyses: [],
    tasks: [],
    revisions: [],
    notebook: [],
    practiceSets: [],
    planChanges: [],
    isDemo: false,
  };
}

/* ------------------------------------------------------------------ */

interface StudentModel {
  base: Record<string, number>;
  growth: Record<string, number>;
  chapterAcc: Record<string, number>;
  chapterAttempt: Record<string, number>;
  chapterError: Record<string, [string, number][]>;
}

const MODEL: StudentModel = {
  base: { Physics: 0.66, Chemistry: 0.7, Mathematics: 0.6 },
  growth: { Physics: 0.035, Chemistry: 0.03, Mathematics: 0.04 },
  chapterAcc: {
    Kinematics: -0.42, Electrochemistry: -0.32, Probability: -0.25, "Aldehydes & Ketones": -0.22, "Rotational Motion": -0.15,
    "Mole Concept": 0.25, Vectors: 0.3, "Sequences & Series": 0.2, "Limits & Continuity": 0.15, "Chemical Bonding": 0.1,
  },
  chapterAttempt: { Kinematics: 0.97, "Mole Concept": 0.98, "Definite Integration": 0.3, "Rotational Motion": 0.55, "Electromagnetic Induction": 0.6, Probability: 0.7 },
  chapterError: {
    Kinematics: [["calculation", 0.75], ["unit_sign", 0.15], ["misread", 0.1]],
    Electrochemistry: [["conceptual", 0.6], ["recall", 0.3], ["calculation", 0.1]],
    Probability: [["conceptual", 0.65], ["misread", 0.2], ["calculation", 0.15]],
    "Aldehydes & Ketones": [["recall", 0.75], ["conceptual", 0.25]],
    "Rotational Motion": [["conceptual", 0.5], ["calculation", 0.3], ["algebra", 0.2]],
    "Definite Integration": [["conceptual", 0.5], ["algebra", 0.5]],
  },
};
const GENERIC_ERRORS: [string, number][] = [["careless", 0.3], ["calculation", 0.25], ["misread", 0.15], ["conceptual", 0.15], ["unit_sign", 0.08], ["algebra", 0.07]];

function weighted(r: () => number, items: [string, number][]): string {
  const total = items.reduce((m, [, w]) => m + w, 0);
  let x = r() * total;
  for (const [v, w] of items) {
    if ((x -= w) <= 0) return v;
  }
  return items[items.length - 1][0];
}

const SUBJECT_SPLIT: [Template["subject"], number][] = [["Physics", 34], ["Chemistry", 33], ["Mathematics", 33]];

function buildPaper(examId: string, title: string, takenOn: string, testIdx: number, seed: number): Analysis {
  const r = seededRandom(seed);
  const sections: ExamSection[] = SUBJECT_SPLIT.map(([subject], i) => ({
    id: uid("sec"), name: subject, subject, ordering: i, rule: { correct: 4, wrong: 1, unattempted: 0 },
  }));
  const questions: Question[] = [];
  const responses: Record<string, QResponse> = {};
  let index = 0;
  const isLatest = testIdx === 3;

  SUBJECT_SPLIT.forEach(([subject, count], si) => {
    const mcqT = TEMPLATES.filter((t) => t.subject === subject && !t.numerical);
    const numT = TEMPLATES.filter((t) => t.subject === subject && t.numerical);
    const order = [...mcqT];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    for (let k = 0; k < count; k++) {
      index++;
      const numerical = k >= count - 4;
      const tpl = numerical ? numT[k % numT.length] : order[k % order.length];
      const g = tpl.gen(r);
      const q: Question = {
        id: uid("q"), index, number: index, sectionId: sections[si].id,
        subject, chapter: tpl.chapter, topic: tpl.topic, difficulty: tpl.difficulty,
        type: numerical ? "numerical" : "single",
        text: g.text,
        options: numerical ? [] : (g.options ?? []).map((t, i) => ({ key: OPTION_KEYS[i], text: t })),
        correctAnswer: numerical ? [] : [OPTION_KEYS[g.answer ?? 0]],
        numericalAnswer: numerical ? { value: g.value ?? 0, tolerance: 0.01 } : undefined,
        confidence: { number: 1, text: 0.95, options: numerical ? 0.9 : 0.95, answer: 0.95, topic: 0.8 },
        reviewed: true,
        source: { file: `${title}.pdf`, page: Math.ceil(index / 6) },
      };
      questions.push(q);

      // Simulated student behaviour.
      let pAttempt = MODEL.chapterAttempt[tpl.chapter] ?? 0.86;
      if (numerical) pAttempt *= 0.7;
      if (isLatest && index > 90) pAttempt = 0.2; // ran out of time at the end of Test 04
      const attempted = r() < pAttempt;
      const pCorrect = Math.min(0.95, Math.max(0.12, MODEL.base[subject] + MODEL.growth[subject] * testIdx + (MODEL.chapterAcc[tpl.chapter] ?? 0) - (tpl.difficulty === "hard" ? 0.08 : 0)));
      const resp: QResponse = { questionId: q.id, selected: [], entered: true, timeSpentSec: 50 + Math.floor(r() * 200) };
      if (attempted) {
        const correct = r() < pCorrect;
        if (numerical) {
          const v = q.numericalAnswer!.value;
          resp.numerical = correct ? String(v) : String(Number((v * [2, 0.5, -1, 10][Math.floor(r() * 4)]).toFixed(2)));
        } else {
          const key = q.correctAnswer[0];
          resp.selected = correct ? [key] : [OPTION_KEYS.slice(0, 4).filter((x) => x !== key)[Math.floor(r() * 3)]];
        }
        if (!correct) {
          resp.errorPrimary = weighted(r, MODEL.chapterError[tpl.chapter] ?? GENERIC_ERRORS);
          if (r() < 0.2) resp.errorSecondary = [weighted(r, GENERIC_ERRORS)].filter((e) => e !== resp.errorPrimary);
          resp.diagnosedAt = new Date().toISOString();
        }
      } else {
        if (isLatest && index > 90) {
          resp.errorPrimary = "time";
          resp.outOfTime = r() < 0.5;
        } else if (tpl.chapter === "Definite Integration" || tpl.chapter === "Rotational Motion") {
          resp.errorPrimary = r() < 0.6 ? "not_studied" : "selection";
        } else {
          resp.errorPrimary = r() < 0.5 ? "selection" : "time";
        }
        resp.diagnosedAt = new Date().toISOString();
      }
      responses[q.id] = resp;
    }
  });

  const a: Analysis = {
    id: uid("an"), examId, title, takenOn, createdAt: `${takenOn}T18:00:00.000Z`, updatedAt: `${takenOn}T19:10:00.000Z`,
    stage: "report", sections, questions, responses, sources: [
      { name: `${title} — question paper.pdf`, size: 2_400_000, type: "application/pdf", kind: "paper", pages: 17, addedAt: `${takenOn}T18:00:00.000Z` },
      { name: `${title} — answer key.pdf`, size: 180_000, type: "application/pdf", kind: "key", pages: 1, addedAt: `${takenOn}T18:00:00.000Z` },
    ],
    importWarnings: [], importMethod: "demo",
    reviewConfirmedAt: `${takenOn}T18:20:00.000Z`, markingConfirmedAt: `${takenOn}T18:21:00.000Z`, answersConfirmedAt: `${takenOn}T18:45:00.000Z`,
    finalizedAt: `${takenOn}T19:10:00.000Z`, locked: true, timeUsedMinutes: 180, changes: [], planAppliedAt: `${takenOn}T19:10:00.000Z`,
  };

  // Hand-placed behaviours that make the latest test tell a clear story.
  const s = scorePaper(a.sections, a.questions, a.responses);
  const wrongs = a.questions.filter((q) => s.byId[q.id].status === "wrong");
  const rights = a.questions.filter((q) => s.byId[q.id].status === "correct");
  if (isLatest) {
    const pool = wrongs.filter((q) => !["Kinematics", "Electrochemistry"].includes(q.chapter) && q.type === "single");
    pool.slice(0, 5).forEach((q) => Object.assign(a.responses[q.id], { guessed: true, errorPrimary: "guess" }));
    rights.slice(3, 4).forEach((q) => (a.responses[q.id].guessed = true));
    pool.slice(5, 7).forEach((q) => {
      const key = q.correctAnswer[0];
      const adj = OPTION_KEYS[(OPTION_KEYS.indexOf(key) + 1) % 4];
      Object.assign(a.responses[q.id], { selected: [adj], errorPrimary: "bubbling", errorNote: "Solved correctly in the rough sheet, bubbled the next option." });
    });
    pool.slice(7, 10).forEach((q) => {
      delete a.responses[q.id].errorPrimary;
      delete a.responses[q.id].diagnosedAt;
    });
    a.locked = true;
  } else if (testIdx === 1) {
    wrongs.filter((q) => q.type === "single").slice(2, 3).forEach((q) => (a.responses[q.id].errorPrimary = "bubbling"));
  }
  a.snapshot = buildSnapshot(a, scorePaper(a.sections, a.questions, a.responses), a.finalizedAt);
  a.changes.push({ at: a.finalizedAt!, kind: "finalized", detail: "Analysis finalized", scoreAfter: a.snapshot.score });
  return a;
}

/* ------------------------------------------------------------------ */

const NOTE_BY_ERROR: Record<string, [string, string]> = {
  calculation: ["Set up the right equation but slipped in the arithmetic of the last step.", "Substitute numbers only at the end; sanity-check the magnitude before choosing."],
  conceptual: ["Applied the wrong principle for this situation.", "Re-read the theory; identify which law applies before writing equations."],
  recall: ["Misremembered the formula / reaction.", "Add it to the formula sheet and recall it from memory twice this week."],
  careless: ["Knew the method; dropped a term while copying.", "Underline the final ask; re-read before marking."],
  misread: ["Answered for a different quantity than asked.", "Circle what's asked (e.g. 'maximum height' vs 'range') before solving."],
  unit_sign: ["Mixed km/h and m/s.", "Convert all units first; carry units through each line."],
  algebra: ["Sign error while rearranging.", "Rearrange symbolically, then substitute."],
  guess: ["No basis for the answer — pure guess.", "Guess only after eliminating two options."],
  bubbling: ["Correct in rough work, bubbled the wrong option.", "Follow the answer-sheet checklist."],
};

function notebookFrom(a: Analysis, examId: string, n: number, todayStr: string, r: () => number): NotebookEntry[] {
  const s = scorePaper(a.sections, a.questions, a.responses);
  return a.questions
    .filter((q) => s.byId[q.id].status === "wrong" && a.responses[q.id]?.errorPrimary && a.responses[q.id].errorPrimary !== "guess")
    .sort((x, y) => s.byId[y.id].forfeited - s.byId[x.id].forfeited || x.index - y.index)
    .filter((q, i, arr) => arr.findIndex((z) => z.chapter === q.chapter) === i || ["Kinematics", "Electrochemistry", "Probability"].includes(q.chapter))
    .slice(0, n)
    .map((q, i) => {
      const e = a.responses[q.id].errorPrimary!;
      const [what, fix] = NOTE_BY_ERROR[e] ?? ["", ""];
      const older = a.takenOn < addDays(todayStr, -7);
      const retried = older && i % 2 === 0;
      return {
        id: uid("nb"), analysisId: a.id, questionId: q.id, examId, createdAt: `${a.takenOn}T19:00:00.000Z`,
        subject: q.subject, chapter: q.chapter, topic: q.topic, errorType: e,
        studentAnswer: formatResponse(q, a.responses[q.id]), correctAnswer: formatKey(q),
        whatWentWrong: what, correctedApproach: fix,
        retries: retried ? [{ at: `${addDays(a.takenOn, 1)}T17:00:00.000Z`, selected: q.correctAnswer, correct: r() < 0.7 }] : [],
        nextRetryAt: older ? (retried ? addDays(todayStr, i % 3) : todayStr) : addDays(a.takenOn, 1) < todayStr ? todayStr : addDays(a.takenOn, 1),
        mastery: older && i % 4 === 0 ? "mastered" : retried ? "reviewing" : "new",
      } satisfies NotebookEntry;
    });
}

export function buildDemoData(todayStr = todayFn()): AppData {
  const now = new Date().toISOString();
  const r = seededRandom(2027);
  const settings = defaultSettings("Aarav");
  settings.onboarded = true;

  const jeeSections = (): ExamSection[] => ["Physics", "Chemistry", "Mathematics"].map((s, i) => ({
    id: uid("sec"), name: s, subject: s, ordering: i, rule: { correct: 4, wrong: 1, unattempted: 0 },
  }));
  const target: Exam = {
    id: uid("exam"), name: "JEE Main 2027 — Session 1", date: addDays(todayStr, 41), durationMinutes: 180, totalMarks: 300, questionCount: 75,
    subjects: ["Physics", "Chemistry", "Mathematics"], sections: jeeSections(), priority: "high", status: "upcoming",
    examType: "Competitive entrance", institution: "NTA", targetScore: 220, targetRange: "99+ percentile",
    notes: "Session 1. Aim to finish syllabus 3 weeks before and switch to full mocks.", createdAt: addDays(todayStr, -45) + "T09:00:00.000Z", updatedAt: now,
  };
  const testDates = [-36, -25, -14, -3].map((d) => addDays(todayStr, d));
  const tests: Exam[] = testDates.map((date, i) => ({
    id: uid("exam"), name: `JEE Revision Test 0${i + 1}`, date, durationMinutes: 180, totalMarks: 400, questionCount: 100,
    subjects: target.subjects, sections: jeeSections(), priority: "medium", status: "completed", examType: "Mock test",
    institution: "Vidyamandir Coaching (demo)", parentExamId: target.id, createdAt: date + "T08:00:00.000Z", updatedAt: now,
  }));
  const upcoming: Exam = {
    id: uid("exam"), name: "JEE Revision Test 05", date: addDays(todayStr, 4), durationMinutes: 180, totalMarks: 400, questionCount: 100,
    subjects: target.subjects, sections: jeeSections(), priority: "medium", status: "upcoming", examType: "Mock test",
    institution: "Vidyamandir Coaching (demo)", parentExamId: target.id, createdAt: now, updatedAt: now,
  };

  // Syllabus with realistic coverage.
  const notStarted = new Set(["Wave Optics", "Semiconductors", "Differential Equations", "Definite Integration", "d & f Block Elements"]);
  const learning = new Set(["Rotational Motion", "Electromagnetic Induction", "Electrochemistry", "Probability", "3D Geometry", "Aldehydes & Ketones"]);
  const topics: SyllabusTopic[] = SYLLABUS_TEMPLATES.jee.topics().map((t) => {
    let coverage: CoverageStatus = notStarted.has(t.chapter) ? "not_started" : learning.has(t.chapter) ? "learning" : r() < 0.35 ? "revised" : "covered";
    if (t.chapter === "Kinematics") coverage = "covered";
    const coveredAt = coverage === "covered" || coverage === "revised" ? addDays(todayStr, -Math.floor(r() * 40) - 1) + "T18:00:00.000Z" : undefined;
    return { id: uid("top"), examId: target.id, subject: t.subject, chapter: t.chapter, topic: t.topic, priority: t.priority, difficulty: t.difficulty, coverage, coveredAt };
  });

  const analyses = tests.map((t, i) => buildPaper(t.id, t.name, t.date, i, 101 + i * 23));

  const notebook = [
    ...notebookFrom(analyses[2], tests[2].id, 6, todayStr, r),
    ...notebookFrom(analyses[3], tests[3].id, 10, todayStr, r),
  ];

  // Revision checkpoints for recently covered topics.
  const revisions = topics
    .filter((t) => t.coveredAt && t.coveredAt.slice(0, 10) >= addDays(todayStr, -9))
    .flatMap((t) => revisionItemsForTopic(t, t.coveredAt!.slice(0, 10), settings.revision, target.date))
    .map((rv) => (rv.dueAt < todayStr && r() < 0.72 ? { ...rv, status: "done" as const } : rv));

  // A little history: yesterday's work (mostly done) and one unfinished task.
  const find = (chapter: string) => topics.find((t) => t.chapter === chapter)!;
  const y = addDays(todayStr, -1);
  const y2 = addDays(todayStr, -2);
  const history: StudyTask[] = [
    { chapter: "Kinematics", type: "practice", date: y, done: true, title: "Calculation drill: Kinematics (1/2)", source: "analysis" },
    { chapter: "Chemical Bonding", type: "active_recall", date: y, done: true, title: "Active recall: Hybridisation", source: "planner" },
    { chapter: "Electrostatics", type: "practice", date: y, done: false, title: "Practice problems: Gauss's law", source: "planner" },
    { chapter: "Quadratic Equations", type: "timed_set", date: y2, done: true, title: "Timed set: Nature of roots", source: "planner" },
    { chapter: "Mole Concept", type: "revision", date: y2, done: true, title: "7-day review: Mole Concept: Stoichiometry", source: "revision" },
  ].map((h) => {
    const t = find(h.chapter);
    return {
      id: uid("task"), examId: target.id, topicId: t.id, type: h.type as StudyTask["type"], title: h.title, subject: t.subject, chapter: t.chapter, topic: t.topic,
      dueDate: h.date, durationMinutes: h.type === "revision" ? 15 : 40, priority: "medium", status: h.done ? "done" : "pending",
      completedAt: h.done ? `${h.date}T19:30:00.000Z` : undefined,
      reason: h.source === "analysis" ? "Recurring calculation errors in Kinematics across the last 3 tests." : "Scheduled by Exam Pilot from topic priority.",
      source: h.source as StudyTask["source"],
    } satisfies StudyTask;
  });

  const data: AppData = {
    version: DATA_VERSION, settings, exams: [target, ...tests, upcoming], topics, analyses, tasks: history,
    revisions, notebook, practiceSets: [], planChanges: [], isDemo: true,
  };

  // Plan before vs after Test 04, so the adaptation log is real.
  const inputBefore = planInput(data, target.id, todayStr)!;
  const before = generatePlan({ ...inputBefore, analyses: familyAnalyses(data, target.id).slice(0, 3) });
  const after = generatePlan(inputBefore);
  data.tasks = after.tasks;
  const newFromAnalysis = after.tasks.filter((t) => t.source === "analysis" && t.status === "pending").map((t) => t.title);
  data.planChanges = [
    { ...describeAdaptation(target.id, `Analysis of ${tests[3].name}`, before.priorities, after, newFromAnalysis), at: `${tests[3].date}T19:10:00.000Z` },
    {
      id: uid("chg"), examId: target.id, at: `${tests[2].date}T19:00:00.000Z`, trigger: `Analysis of ${tests[2].name}`,
      summary: "4 evidence-based tasks added, topic priorities re-ranked.",
      details: ["↑ Kinematics: calculation errors repeated in 2 tests", "+ Calculation drill: Kinematics", "+ Rebuild the concept: Electrochemistry", "+ Redo lost Probability questions after 24 hours"],
    },
  ];
  return data;
}
