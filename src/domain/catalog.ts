/** Built-in catalogs: error categories, task types, marking presets. */
import type { ErrorCategory, MarkingRule, PlannerPreferences, RevisionScheduleConfig, TaskType } from "./types";

export const UNKNOWN_ERROR = "unknown";

export const DEFAULT_ERROR_CATEGORIES: ErrorCategory[] = [
  { id: "conceptual", label: "Conceptual gap", short: "Concept", group: "knowledge", description: "Did not understand the underlying idea." },
  { id: "recall", label: "Formula / fact / reaction recall", short: "Recall", group: "knowledge", description: "Forgot or misremembered a formula, fact or reaction." },
  { id: "calculation", label: "Calculation error", short: "Calculation", group: "execution", description: "Right method, arithmetic went wrong." },
  { id: "algebra", label: "Algebra / manipulation error", short: "Algebra", group: "execution", description: "Slip while rearranging or simplifying." },
  { id: "misread", label: "Misread question", short: "Misread", group: "execution", description: "Answered a different question than was asked." },
  { id: "misinterpreted", label: "Misinterpreted data", short: "Data", group: "execution", description: "Read a graph, table or given value incorrectly." },
  { id: "careless", label: "Silly / careless mistake", short: "Careless", group: "execution", description: "Knew it, slipped anyway." },
  { id: "unit_sign", label: "Unit / sign error", short: "Unit/Sign", group: "execution", description: "Wrong units, dropped a negative sign." },
  { id: "incomplete", label: "Incomplete solution", short: "Incomplete", group: "execution", description: "Stopped one step short." },
  { id: "time", label: "Time pressure", short: "Time", group: "strategy", description: "Rushed or ran out of time." },
  { id: "selection", label: "Poor question selection", short: "Selection", group: "strategy", description: "Spent time on the wrong questions." },
  { id: "guess", label: "Guessing", short: "Guess", group: "strategy", description: "Answered without a real basis." },
  { id: "bubbling", label: "Answer bubbling / marking-sheet error", short: "Bubbling", group: "process", description: "Correct answer, wrong bubble or entry." },
  { id: "not_studied", label: "Topic not studied", short: "Not studied", group: "knowledge", description: "Topic had not been covered yet." },
  { id: "other", label: "Other", short: "Other", group: "other" },
].map((c) => ({ ...c, builtIn: true })) as ErrorCategory[];

/** Order of chips in the fast tagging UI (spec §18 first, then the rest). */
export const FAST_CHIP_ORDER = ["conceptual", "calculation", "misread", "careless", "time", "guess", "recall", "unit_sign", "algebra", "misinterpreted", "incomplete", "selection", "bubbling", "not_studied", "other"];

export const ERROR_GROUP_LABEL: Record<string, string> = {
  knowledge: "Knowledge",
  execution: "Execution",
  strategy: "Exam strategy",
  process: "Process",
  other: "Other",
};

export const TASK_TYPE_META: Record<TaskType, { label: string; short: string; defaultMinutes: number }> = {
  learn: { label: "Learn concept", short: "Learn", defaultMinutes: 60 },
  review_notes: { label: "Review notes", short: "Review", defaultMinutes: 25 },
  active_recall: { label: "Active recall", short: "Recall", defaultMinutes: 20 },
  practice: { label: "Practice problems", short: "Practice", defaultMinutes: 45 },
  timed_set: { label: "Timed set", short: "Timed", defaultMinutes: 30 },
  redo_mistakes: { label: "Redo mistakes", short: "Redo", defaultMinutes: 30 },
  formula_review: { label: "Formula / reaction review", short: "Formulas", defaultMinutes: 20 },
  mock_test: { label: "Mock test", short: "Mock", defaultMinutes: 180 },
  exam_analysis: { label: "Exam analysis", short: "Analysis", defaultMinutes: 45 },
  revision: { label: "Revision", short: "Revision", defaultMinutes: 20 },
  strategy: { label: "Exam strategy", short: "Strategy", defaultMinutes: 20 },
};

export interface MarkingPreset {
  id: string;
  name: string;
  description: string;
  rule: MarkingRule;
}

export const MARKING_PRESETS: MarkingPreset[] = [
  { id: "jee-main", name: "JEE Main (MCQ)", description: "+4 correct, −1 wrong, 0 unattempted", rule: { correct: 4, wrong: 1, unattempted: 0 } },
  { id: "jee-main-num", name: "JEE Main (numerical)", description: "+4 correct, −1 wrong", rule: { correct: 4, wrong: 1, unattempted: 0 } },
  { id: "jee-adv-multi", name: "JEE Advanced (multi-correct)", description: "+4 all correct, +1 per correct option, −2 wrong", rule: { correct: 4, wrong: 2, unattempted: 0, partial: { enabled: true, perCorrectOption: 1 } } },
  { id: "neet", name: "NEET", description: "+4 correct, −1 wrong", rule: { correct: 4, wrong: 1, unattempted: 0 } },
  { id: "quarter", name: "Quarter negative", description: "+1 correct, −0.25 wrong", rule: { correct: 1, wrong: 0.25, unattempted: 0 } },
  { id: "third", name: "One-third negative", description: "+3 correct, −1 wrong", rule: { correct: 3, wrong: 1, unattempted: 0 } },
  { id: "no-negative", name: "No negative marking", description: "+1 correct, 0 wrong (SAT/ACT/school)", rule: { correct: 1, wrong: 0, unattempted: 0 } },
];

export const DEFAULT_REVISION: RevisionScheduleConfig = { offsets: [0, 1, 4, 7], preExamDays: 2 };

export const DEFAULT_PLANNER: PlannerPreferences = {
  // Sun..Sat — school days lighter, weekends heavier.
  minutesByWeekday: [300, 180, 180, 150, 180, 150, 300],
  blockedDates: [],
  mockEveryDays: 7,
  revisionShare: 0.25,
  horizonDays: 14,
};

export const SUBJECT_COLORS: Record<string, string> = {
  Physics: "var(--chart-1)",
  Chemistry: "var(--chart-2)",
  Mathematics: "var(--chart-3)",
  Biology: "var(--chart-4)",
};

export function subjectColor(subject: string, all: string[]): string {
  if (SUBJECT_COLORS[subject]) return SUBJECT_COLORS[subject];
  const i = Math.max(0, all.indexOf(subject));
  return `var(--chart-${(i % 6) + 1})`;
}
