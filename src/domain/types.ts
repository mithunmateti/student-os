/**
 * Student OS domain model.
 *
 * The Exam is the shared parent object. Preparation (syllabus topics, study tasks,
 * revision items) and post-exam analysis (papers, questions, responses, error tags)
 * both hang off an exam, so analyzer findings enrich the same topics the planner uses.
 *
 * Nothing in this folder imports React or browser APIs.
 */

export type ID = string;
/** ISO date (YYYY-MM-DD) for calendar dates, full ISO string for timestamps. */
export type ISODate = string;
export type ISODateTime = string;

/* ------------------------------------------------------------------ */
/* User & settings                                                     */
/* ------------------------------------------------------------------ */

export type ErrorGroup = "knowledge" | "execution" | "strategy" | "process" | "other";

export interface ErrorCategory {
  id: string;
  label: string;
  /** Short label used on the fast-tagging chips. */
  short: string;
  group: ErrorGroup;
  description?: string;
  hidden?: boolean;
  builtIn?: boolean;
}

export interface RevisionScheduleConfig {
  /** Offsets in days after a topic is studied (0 = same day). */
  offsets: number[];
  /** Add a final review this many days before the exam (0 disables). */
  preExamDays: number;
}

export interface PlannerPreferences {
  /** Minutes available per weekday, index 0 = Sunday. */
  minutesByWeekday: number[];
  /** Dates (YYYY-MM-DD) with no study time (school events, travel...). */
  blockedDates: ISODate[];
  /** Days between full mock tests (0 disables). */
  mockEveryDays: number;
  /** Share of daily capacity protected for revision + redo work (0..0.6). */
  revisionShare: number;
  /** How many days ahead the planner schedules. */
  horizonDays: number;
}

export interface Settings {
  studentName: string;
  theme: "system" | "light" | "dark";
  errorCategories: ErrorCategory[];
  revision: RevisionScheduleConfig;
  planner: PlannerPreferences;
  defaultRule: MarkingRule;
  onboarded: boolean;
}

/* ------------------------------------------------------------------ */
/* Exams & syllabus                                                    */
/* ------------------------------------------------------------------ */

export type ExamStatus = "upcoming" | "completed";
export type Priority = "high" | "medium" | "low";
export type Difficulty = "easy" | "medium" | "hard";
export type CoverageStatus = "not_started" | "learning" | "covered" | "revised";

export interface MarkingRule {
  /** Marks for a fully correct answer. */
  correct: number;
  /** Penalty for a wrong answer, stored as a positive number (1 means -1). */
  wrong: number;
  /** Marks for leaving the question unattempted (usually 0). */
  unattempted: number;
  /** Partial credit for multiple-correct questions (JEE Advanced style). */
  partial?: {
    enabled: boolean;
    /** Marks per correct option chosen when no wrong option is chosen. */
    perCorrectOption: number;
  };
}

export interface ExamSection {
  id: ID;
  name: string;
  /** Default subject for questions in this section. */
  subject?: string;
  ordering: number;
  rule: MarkingRule;
  /** Optional sections: attempt at most N questions; only the first N attempted count. */
  maxAttemptsCounted?: number;
}

export interface SyllabusTopic {
  id: ID;
  examId: ID;
  subject: string;
  chapter: string;
  topic: string;
  priority: Priority;
  difficulty: Difficulty;
  coverage: CoverageStatus;
  /** Set when coverage reaches covered/revised; drives spaced revision. */
  coveredAt?: ISODateTime;
  /** Estimated study minutes to learn from scratch. */
  estMinutes?: number;
}

export interface Exam {
  id: ID;
  name: string;
  date: ISODate;
  durationMinutes: number;
  totalMarks?: number;
  questionCount?: number;
  subjects: string[];
  sections: ExamSection[];
  priority: Priority;
  status: ExamStatus;
  examType?: string;
  institution?: string;
  targetScore?: number;
  targetRange?: string;
  notes?: string;
  /** If this exam is a mock/practice test, the goal exam it prepares for. */
  parentExamId?: ID;
  syllabusSource?: FileRef;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  archived?: boolean;
}

/* ------------------------------------------------------------------ */
/* Analyzer                                                            */
/* ------------------------------------------------------------------ */

export type QuestionType = "single" | "multiple" | "numerical";
export type OptionKey = string; // "A" | "B" | ...

export interface QuestionOption {
  key: OptionKey;
  text: string;
}

export type ConfidenceField = "number" | "text" | "options" | "answer" | "type" | "topic";

export interface Question {
  id: ID;
  /** Order in the paper, 1..n — unique within an analysis. */
  index: number;
  /** Printed question number (may repeat when sections restart numbering). */
  number: number;
  sectionId: ID;
  subject: string;
  chapter: string;
  topic: string;
  type: QuestionType;
  text: string;
  options: QuestionOption[];
  /** Accepted option keys (single: usually 1; can be >1 after a key correction). */
  correctAnswer: OptionKey[];
  /** Numerical answer key with tolerance. */
  numericalAnswer?: { value: number; tolerance: number };
  difficulty?: Difficulty;
  /** Bonus: full marks for everyone. Dropped: removed from scoring. */
  bonus?: boolean;
  dropped?: boolean;
  /** Question-specific marking override. */
  ruleOverride?: Partial<MarkingRule>;
  /** 0..1 per field; missing = fully trusted (manual entry). */
  confidence: Partial<Record<ConfidenceField, number>>;
  reviewed: boolean;
  hasFigure?: boolean;
  source?: { file: string; page?: number };
  /** Notes captured during import (e.g. "duplicate number"). */
  importNotes?: string[];
  /** Question bank state. */
  archived?: boolean;
  bankNote?: string;
}

export interface QResponse {
  questionId: ID;
  /** Selected option keys. Empty + entered = explicitly unattempted. */
  selected: OptionKey[];
  numerical?: string;
  /** Has the student made an explicit entry (answer or "unattempted")? */
  entered: boolean;
  guessed?: boolean;
  outOfTime?: boolean;
  timeSpentSec?: number;
  /** Error diagnosis. "unknown" = review later. */
  errorPrimary?: string;
  errorSecondary?: string[];
  errorNote?: string;
  diagnosedAt?: ISODateTime;
}

export type ResultStatus =
  | "correct"
  | "wrong"
  | "unattempted"
  | "partial"
  | "bonus"
  | "dropped"
  | "unkeyed"
  | "not_counted";

export interface FileRef {
  name: string;
  size: number;
  type: string;
  kind: "paper" | "key" | "response_sheet" | "result_page" | "syllabus";
  pages?: number;
  addedAt: ISODateTime;
}

export type AnalysisStage = "review" | "marking" | "answers" | "results" | "errors" | "report";

export interface AnalysisChange {
  at: ISODateTime;
  kind: "answer_changed" | "key_corrected" | "marking_changed" | "question_edited" | "finalized";
  detail: string;
  scoreBefore?: number;
  scoreAfter?: number;
}

export interface AnalysisSnapshot {
  score: number;
  maxScore: number;
  percentage: number;
  accuracy: number | null;
  attemptRate: number;
  correct: number;
  wrong: number;
  unattempted: number;
  partial: number;
  grossPositive: number;
  grossNegative: number;
  negativeMarkLoss: number;
  totalQuestions: number;
  bySubject: Record<string, { score: number; max: number; correct: number; wrong: number; unattempted: number }>;
  createdAt: ISODateTime;
}

export interface Analysis {
  id: ID;
  examId: ID;
  title: string;
  /** Date the paper was sat. */
  takenOn: ISODate;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  /** Furthest stage the student has reached. */
  stage: AnalysisStage;
  sections: ExamSection[];
  questions: Question[];
  responses: Record<ID, QResponse>;
  sources: FileRef[];
  importWarnings: string[];
  importMethod: "pdf" | "image" | "text" | "manual" | "duplicate" | "demo";
  reviewConfirmedAt?: ISODateTime;
  markingConfirmedAt?: ISODateTime;
  answersConfirmedAt?: ISODateTime;
  finalizedAt?: ISODateTime;
  /** Answer entry locked after finalization to prevent accidental edits. */
  locked?: boolean;
  timeUsedMinutes?: number;
  snapshot?: AnalysisSnapshot;
  changes: AnalysisChange[];
  /** Tasks generated from this analysis already applied to the plan. */
  planAppliedAt?: ISODateTime;
}

/* ------------------------------------------------------------------ */
/* Error Notebook & Question Bank                                      */
/* ------------------------------------------------------------------ */

export type Mastery = "new" | "reviewing" | "mastered";

export interface RetryAttempt {
  at: ISODateTime;
  selected: OptionKey[];
  numerical?: string;
  correct: boolean;
}

export interface NotebookEntry {
  id: ID;
  analysisId: ID;
  questionId: ID;
  examId: ID;
  createdAt: ISODateTime;
  subject: string;
  chapter: string;
  topic: string;
  errorType: string;
  studentAnswer: string;
  correctAnswer: string;
  whatWentWrong: string;
  correctedApproach: string;
  retries: RetryAttempt[];
  nextRetryAt?: ISODate;
  mastery: Mastery;
  inRevision?: boolean;
}

export interface PracticeSet {
  id: ID;
  name: string;
  items: { analysisId: ID; questionId: ID }[];
  createdAt: ISODateTime;
}

/* ------------------------------------------------------------------ */
/* Planning                                                            */
/* ------------------------------------------------------------------ */

export type TaskType =
  | "learn"
  | "review_notes"
  | "active_recall"
  | "practice"
  | "timed_set"
  | "redo_mistakes"
  | "formula_review"
  | "mock_test"
  | "exam_analysis"
  | "revision"
  | "strategy";

export type TaskStatus = "pending" | "done" | "skipped";

export interface StudyTask {
  id: ID;
  examId: ID;
  topicId?: ID;
  type: TaskType;
  title: string;
  subject?: string;
  chapter?: string;
  topic?: string;
  dueDate: ISODate;
  durationMinutes: number;
  priority: Priority;
  status: TaskStatus;
  completedAt?: ISODateTime;
  /** Human-readable explanation of why the task exists. */
  reason: string;
  /** Evidence origin, so insights stay traceable. */
  source: "planner" | "analysis" | "revision" | "notebook" | "user";
  sourceRef?: { analysisId?: ID; observationId?: string; notebookIds?: ID[]; revisionIds?: ID[] };
  /** User-created or user-edited tasks are never replaced by regeneration. */
  pinned?: boolean;
  checklist?: string[];
}

export interface RevisionItem {
  id: ID;
  examId: ID;
  topicId?: ID;
  notebookId?: ID;
  label: string;
  dueAt: ISODate;
  status: "pending" | "done";
  checkpoint: string;
}

export interface PlanChange {
  id: ID;
  examId: ID;
  at: ISODateTime;
  trigger: string;
  summary: string;
  details: string[];
}

/* ------------------------------------------------------------------ */
/* Persisted root                                                      */
/* ------------------------------------------------------------------ */

export interface AppData {
  version: number;
  settings: Settings;
  exams: Exam[];
  topics: SyllabusTopic[];
  analyses: Analysis[];
  tasks: StudyTask[];
  revisions: RevisionItem[];
  notebook: NotebookEntry[];
  practiceSets: PracticeSet[];
  planChanges: PlanChange[];
  /** examId → date (YYYY-MM-DD) the plan was last generated. */
  planMeta?: Record<ID, ISODate>;
  isDemo: boolean;
}
