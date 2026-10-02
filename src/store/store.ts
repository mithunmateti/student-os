"use client";
/**
 * Application store (zustand). The persistence layer and every mutation live
 * here; all calculations are delegated to the pure domain modules so the UI
 * never computes scores or plans itself.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { buildSnapshot, scoreAnalysis } from "@/domain/analysis";
import { buildDemoData, DATA_VERSION, emptyData } from "@/domain/demo/seed";
import { generatePlan, revisionItemsForTopic } from "@/domain/planner";
import { formatKey, formatResponse, parseNumerical } from "@/domain/scoring";
import { describeAdaptation, planInput, rootExamId, targetExams } from "@/domain/selectors";
import type {
  AnalysisChange, Analysis, AnalysisStage, AppData, CoverageStatus, Exam, NotebookEntry, OptionKey, PlanChange, PracticeSet,
  QResponse, Question, Settings, StudyTask, SyllabusTopic,
} from "@/domain/types";
import { addDays, today, uid } from "@/domain/util";
import { createIdbStorage, listenForOtherTabs, quietly, THEME_KEY } from "./storage";

// Storage names keep the app's original "exam-pilot" prefix so data saved before the rename to Student OS still loads.
const STORE_KEY = "exam-pilot-data";
const STAGES: AnalysisStage[] = ["review", "marking", "answers", "results", "errors", "report"];

export function stageIndex(s: AnalysisStage) {
  return STAGES.indexOf(s);
}

export interface Actions {
  /* lifecycle */
  startFresh: (name: string) => void;
  loadDemo: () => void;
  replaceAll: (data: AppData) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  ensureFreshPlans: () => void;

  /* exams & syllabus */
  createExam: (exam: Omit<Exam, "id" | "createdAt" | "updatedAt">, topics: Omit<SyllabusTopic, "id" | "examId">[]) => string;
  updateExam: (id: string, patch: Partial<Exam>) => void;
  deleteExam: (id: string) => void;
  addTopics: (examId: string, topics: Omit<SyllabusTopic, "id" | "examId">[]) => void;
  updateTopic: (id: string, patch: Partial<SyllabusTopic>) => void;
  /** Swaps an exam's whole syllabus (e.g. after importing the real one) and rebuilds the plan. */
  replaceTopics: (examId: string, topics: Omit<SyllabusTopic, "id" | "examId">[]) => void;
  /** Changes a topic's difficulty and rebuilds the plan (study time and ranking depend on it). */
  setTopicDifficulty: (id: string, difficulty: SyllabusTopic["difficulty"]) => void;
  setCoverage: (id: string, coverage: CoverageStatus) => void;
  deleteTopics: (ids: string[]) => void;
  mergeTopics: (ids: string[], name: string) => void;
  splitTopic: (id: string, names: string[]) => void;

  /* plan */
  regeneratePlan: (examId: string, trigger?: string) => PlanChange | null;
  toggleTask: (id: string) => void;
  skipTask: (id: string) => void;
  moveTask: (id: string, date: string) => void;
  addTask: (task: Omit<StudyTask, "id" | "status" | "source">) => void;
  /** Edits a task (title, date, length, priority…). Edited tasks are kept when the plan regenerates. */
  updateTask: (id: string, patch: Partial<Pick<StudyTask, "title" | "dueDate" | "durationMinutes" | "priority" | "subject" | "type">>) => void;
  deleteTask: (id: string) => void;
  /** Marks a calendar day as a day off (or a study day again) and re-plans every goal exam around it. */
  setDayOff: (date: string, off: boolean) => void;

  /* analyzer */
  createAnalysis: (a: Analysis) => string;
  updateAnalysis: (id: string, fn: (a: Analysis) => Analysis) => void;
  setStage: (id: string, stage: AnalysisStage) => void;
  setSections: (id: string, sections: Analysis["sections"]) => void;
  updateQuestion: (aid: string, qid: string, patch: Partial<Question>) => void;
  updateQuestions: (aid: string, ids: string[], patch: Partial<Question> | ((q: Question) => Partial<Question>)) => void;
  addQuestion: (aid: string, afterIndex: number, sectionId?: string) => string;
  deleteQuestion: (aid: string, qid: string) => void;
  setResponse: (aid: string, qid: string, patch: Partial<QResponse>) => void;
  setResponses: (aid: string, patches: Record<string, Partial<QResponse>>) => void;
  finalizeAnalysis: (aid: string) => PlanChange | null;
  unlockAnalysis: (aid: string) => void;
  deleteAnalysis: (aid: string) => void;

  /* error notebook */
  upsertNotebook: (aid: string, qid: string, fields?: Partial<NotebookEntry>) => string | null;
  removeNotebookFor: (aid: string, qid: string) => void;
  updateNotebook: (id: string, patch: Partial<NotebookEntry>) => void;
  recordRetry: (id: string, selected: OptionKey[], numerical?: string) => boolean | null;
  addNotebookToRevision: (id: string) => void;
  deleteNotebook: (id: string) => void;

  /* question bank */
  createPracticeSet: (name: string, items: PracticeSet["items"]) => string;
  addToPracticeSet: (setId: string, items: PracticeSet["items"]) => void;
  deletePracticeSet: (id: string) => void;
}

export type Store = AppData & Actions & { _hydrated: boolean };

function dataOf(s: Store): AppData {
  return {
    version: s.version, settings: s.settings, exams: s.exams, topics: s.topics, analyses: s.analyses, tasks: s.tasks,
    revisions: s.revisions, notebook: s.notebook, practiceSets: s.practiceSets, planChanges: s.planChanges, planMeta: s.planMeta, isDemo: s.isDemo,
  };
}

const now = () => new Date().toISOString();

function applyTheme(theme: Settings["theme"]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* ignore */
  }
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

/** Keep derived snapshot + audit trail current when a finalized analysis changes. */
function withAudit(before: Analysis, after: Analysis, kind: AnalysisChange["kind"], detail: string): Analysis {
  if (!before.finalizedAt) return { ...after, updatedAt: now() };
  const sb = before.snapshot?.score ?? scoreAnalysis(before).score;
  const s = scoreAnalysis(after);
  const change: AnalysisChange = { at: now(), kind, detail, scoreBefore: sb, scoreAfter: s.score };
  const last = after.changes[after.changes.length - 1];
  // Collapse rapid consecutive edits of the same kind into one audit entry.
  const changes = last && last.kind === kind && last.detail === detail && Date.now() - Date.parse(last.at) < 60_000
    ? [...after.changes.slice(0, -1), { ...change, scoreBefore: last.scoreBefore }]
    : [...after.changes, change];
  return { ...after, updatedAt: now(), snapshot: buildSnapshot(after, s), changes };
}

export const useStore = create<Store>()(
  persist(
    (set, get) => {
      const mapAnalysis = (id: string, fn: (a: Analysis) => Analysis) =>
        set((s) => ({ analyses: s.analyses.map((a) => (a.id === id ? fn(a) : a)) }));

      const regenerateInternal = (examId: string, trigger?: string): PlanChange | null => {
        const s = get();
        const data = dataOf(s);
        const exam = data.exams.find((e) => e.id === examId);
        if (!exam || exam.parentExamId) return null;
        const input = planInput(data, examId, today());
        if (!input) return null;
        const before = trigger ? generatePlan({ ...input, analyses: input.analyses.slice(0, -1) }).priorities : null;
        const plan = generatePlan(input);
        const others = data.tasks.filter((t) => t.examId !== examId);
        const prevIds = new Set(data.tasks.filter((t) => t.examId === examId && t.source === "analysis").map((t) => t.title));
        let change: PlanChange | null = null;
        if (trigger) {
          const newTitles = plan.tasks.filter((t) => t.source === "analysis" && t.status === "pending" && !prevIds.has(t.title)).map((t) => t.title);
          change = describeAdaptation(examId, trigger, before, plan, newTitles.length ? newTitles : plan.tasks.filter((t) => t.source === "analysis" && t.status === "pending").map((t) => t.title));
        }
        set((st) => ({
          tasks: [...others, ...plan.tasks],
          planMeta: { ...(st.planMeta ?? {}), [examId]: today() },
          planChanges: change ? [change, ...st.planChanges].slice(0, 40) : st.planChanges,
        }));
        return change;
      };

      return {
        ...emptyData(),
        _hydrated: false,

        /* ---------------------------- lifecycle --------------------------- */
        startFresh: (name) => {
          const d = emptyData(name.trim());
          d.settings.onboarded = true;
          d.settings.theme = get().settings.theme;
          set({ ...d });
        },
        loadDemo: () => {
          const d = buildDemoData(today());
          d.settings.theme = get().settings.theme;
          d.planMeta = Object.fromEntries(targetExams(d).map((e) => [e.id, today()]));
          set({ ...d });
        },
        replaceAll: (data) => {
          set({ ...emptyData(), ...data, version: DATA_VERSION });
          applyTheme(data.settings.theme);
        },
        updateSettings: (patch) => {
          set((s) => ({ settings: { ...s.settings, ...patch } }));
          if (patch.theme) applyTheme(patch.theme);
        },
        ensureFreshPlans: () => {
          const s = get();
          for (const e of targetExams(s)) {
            if ((s.planMeta ?? {})[e.id] !== today() && s.topics.some((t) => t.examId === e.id)) regenerateInternal(e.id);
          }
        },

        /* ------------------------- exams & syllabus ------------------------ */
        createExam: (exam, topics) => {
          const id = uid("exam");
          const e: Exam = { ...exam, id, createdAt: now(), updatedAt: now() };
          set((s) => ({
            exams: [...s.exams, e],
            topics: [...s.topics, ...topics.map((t) => ({ ...t, id: uid("top"), examId: id }))],
          }));
          // A new goal exam changes every plan's share of study time.
          if (!e.parentExamId) for (const g of targetExams(get())) regenerateInternal(g.id);
          return id;
        },
        updateExam: (id, patch) => set((s) => ({ exams: s.exams.map((e) => (e.id === id ? { ...e, ...patch, updatedAt: now() } : e)) })),
        deleteExam: (id) => {
          set((s) => {
            const ids = new Set([id, ...s.exams.filter((e) => e.parentExamId === id).map((e) => e.id)]);
            const analysisIds = new Set(s.analyses.filter((a) => ids.has(a.examId)).map((a) => a.id));
            return {
              exams: s.exams.filter((e) => !ids.has(e.id)),
              topics: s.topics.filter((t) => !ids.has(t.examId)),
              tasks: s.tasks.filter((t) => !ids.has(t.examId)),
              revisions: s.revisions.filter((r) => !ids.has(r.examId)),
              analyses: s.analyses.filter((a) => !analysisIds.has(a.id)),
              notebook: s.notebook.filter((n) => !analysisIds.has(n.analysisId)),
              planChanges: s.planChanges.filter((c) => !ids.has(c.examId)),
            };
          });
          for (const g of targetExams(get())) regenerateInternal(g.id);
        },
        addTopics: (examId, topics) => set((s) => ({ topics: [...s.topics, ...topics.map((t) => ({ ...t, id: uid("top"), examId }))] })),
        updateTopic: (id, patch) => set((s) => ({ topics: s.topics.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
        replaceTopics: (examId, topics) => {
          get().deleteTopics(get().topics.filter((t) => t.examId === examId).map((t) => t.id));
          get().addTopics(examId, topics);
          regenerateInternal(rootExamId(get(), examId));
        },
        setTopicDifficulty: (id, difficulty) => {
          const t = get().topics.find((x) => x.id === id);
          if (!t || t.difficulty === difficulty) return;
          set((s) => ({ topics: s.topics.map((x) => (x.id === id ? { ...x, difficulty } : x)) }));
          regenerateInternal(rootExamId(get(), t.examId));
        },
        setCoverage: (id, coverage) => {
          const s = get();
          const t = s.topics.find((x) => x.id === id);
          if (!t) return;
          const exam = s.exams.find((e) => e.id === t.examId);
          const rank = { not_started: 0, learning: 1, covered: 2, revised: 3 };
          const startsRevision = rank[coverage] >= 1 && rank[t.coverage] === 0 && !s.revisions.some((r) => r.topicId === id);
          set((st) => ({
            topics: st.topics.map((x) => (x.id === id ? { ...x, coverage, coveredAt: rank[coverage] >= 2 ? x.coveredAt ?? now() : x.coveredAt } : x)),
            revisions: startsRevision && exam ? [...st.revisions, ...revisionItemsForTopic({ ...t, coverage }, today(), st.settings.revision, exam.date)] : st.revisions,
          }));
        },
        deleteTopics: (ids) => {
          const del = new Set(ids);
          set((s) => ({
            topics: s.topics.filter((t) => !del.has(t.id)),
            revisions: s.revisions.filter((r) => !r.topicId || !del.has(r.topicId)),
            tasks: s.tasks.filter((t) => !(t.topicId && del.has(t.topicId) && t.status === "pending" && !t.pinned)),
          }));
        },
        mergeTopics: (ids, name) => {
          if (ids.length < 2) return;
          const [keep, ...rest] = ids;
          const gone = new Set(rest);
          set((s) => ({
            topics: s.topics.filter((t) => !gone.has(t.id)).map((t) => (t.id === keep ? { ...t, topic: name } : t)),
            tasks: s.tasks.map((t) => (t.topicId && gone.has(t.topicId) ? { ...t, topicId: keep } : t)),
            revisions: s.revisions.map((r) => (r.topicId && gone.has(r.topicId) ? { ...r, topicId: keep } : r)),
          }));
        },
        splitTopic: (id, names) => {
          const t = get().topics.find((x) => x.id === id);
          if (!t || names.length < 2) return;
          set((s) => ({
            topics: s.topics.flatMap((x) => (x.id === id ? names.map((n, i) => ({ ...x, id: i === 0 ? x.id : uid("top"), topic: n })) : [x])),
          }));
        },

        /* ------------------------------ plan ------------------------------- */
        regeneratePlan: (examId, trigger) => regenerateInternal(rootExamId(get(), examId), trigger),
        toggleTask: (id) => {
          const s = get();
          const t = s.tasks.find((x) => x.id === id);
          if (!t) return;
          const done = t.status !== "done";
          set((st) => ({ tasks: st.tasks.map((x) => (x.id === id ? { ...x, status: done ? "done" : "pending", completedAt: done ? now() : undefined } : x)) }));
          if (!done) return;
          // Side effects of finishing work: coverage, revision checkpoints, notebook spacing.
          if (t.topicId) {
            const topic = get().topics.find((x) => x.id === t.topicId);
            if (topic) {
              if (t.type === "learn" && topic.coverage === "not_started") get().setCoverage(topic.id, "learning");
              if ((t.type === "practice" || t.type === "timed_set") && (topic.coverage === "not_started" || topic.coverage === "learning")) get().setCoverage(topic.id, "covered");
              if (t.type === "active_recall" && topic.coverage === "covered") get().setCoverage(topic.id, "revised");
            }
          }
          if (t.sourceRef?.revisionIds?.length) {
            const ids = new Set(t.sourceRef.revisionIds);
            set((st) => {
              const revisions = st.revisions.map((r) => (ids.has(r.id) ? { ...r, status: "done" as const } : r));
              const touched = new Set(revisions.filter((r) => ids.has(r.id)).map((r) => r.topicId));
              const topics = st.topics.map((tp) => {
                if (!touched.has(tp.id)) return tp;
                const all = revisions.filter((r) => r.topicId === tp.id);
                return all.length && all.every((r) => r.status === "done") && tp.coverage === "covered" ? { ...tp, coverage: "revised" as const } : tp;
              });
              return { revisions, topics };
            });
          }
          if (t.sourceRef?.notebookIds?.length) {
            const ids = new Set(t.sourceRef.notebookIds);
            set((st) => ({ notebook: st.notebook.map((n) => (ids.has(n.id) && n.mastery !== "mastered" ? { ...n, nextRetryAt: addDays(today(), 3), mastery: n.mastery === "new" ? "reviewing" : n.mastery } : n)) }));
          }
        },
        skipTask: (id) => set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, status: t.status === "skipped" ? "pending" : "skipped" } : t)) })),
        moveTask: (id, date) => set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, dueDate: date, pinned: true } : t)) })),
        addTask: (task) => set((s) => ({ tasks: [...s.tasks, { ...task, id: uid("task"), status: "pending", source: "user", pinned: true }] })),
        updateTask: (id, patch) => set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch, pinned: true } : t)) })),
        deleteTask: (id) => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),
        setDayOff: (date, off) => {
          const p = get().settings.planner;
          const blockedDates = off ? [...new Set([...p.blockedDates, date])].sort() : p.blockedDates.filter((d) => d !== date);
          set((s) => ({ settings: { ...s.settings, planner: { ...s.settings.planner, blockedDates } } }));
          for (const g of targetExams(get())) regenerateInternal(g.id);
        },

        /* ----------------------------- analyzer ---------------------------- */
        createAnalysis: (a) => {
          set((s) => ({ analyses: [...s.analyses, a] }));
          return a.id;
        },
        updateAnalysis: (id, fn) => mapAnalysis(id, (a) => ({ ...fn(a), updatedAt: now() })),
        setStage: (id, stage) => mapAnalysis(id, (a) => (stageIndex(stage) > stageIndex(a.stage) ? { ...a, stage, updatedAt: now() } : a)),
        setSections: (id, sections) => mapAnalysis(id, (a) => withAudit(a, { ...a, sections }, "marking_changed", "Marking scheme changed")),
        updateQuestion: (aid, qid, patch) =>
          mapAnalysis(aid, (a) => {
            const q = a.questions.find((x) => x.id === qid);
            if (!q) return a;
            const next = { ...a, questions: a.questions.map((x) => (x.id === qid ? { ...x, ...patch } : x)) };
            const keyChange = "correctAnswer" in patch || "numericalAnswer" in patch || "bonus" in patch || "dropped" in patch;
            const ruleChange = "ruleOverride" in patch;
            const kind = keyChange ? "key_corrected" : ruleChange ? "marking_changed" : "question_edited";
            const detail = keyChange ? `Answer key for Q${q.index} changed from ${formatKey(q)} to ${formatKey({ ...q, ...patch })}` : ruleChange ? `Marking override for Q${q.index} changed` : `Q${q.index} edited`;
            return withAudit(a, next, kind, detail);
          }),
        updateQuestions: (aid, ids, patch) =>
          mapAnalysis(aid, (a) => {
            const set_ = new Set(ids);
            const next = { ...a, questions: a.questions.map((q) => (set_.has(q.id) ? { ...q, ...(typeof patch === "function" ? patch(q) : patch) } : q)) };
            return withAudit(a, next, "question_edited", `${ids.length} questions updated`);
          }),
        addQuestion: (aid, afterIndex, sectionId) => {
          const id = uid("q");
          mapAnalysis(aid, (a) => {
            const prev = a.questions.find((q) => q.index === afterIndex) ?? a.questions[a.questions.length - 1];
            const sec = sectionId ?? prev?.sectionId ?? a.sections[0]?.id;
            const section = a.sections.find((s) => s.id === sec);
            const q: Question = {
              id, index: afterIndex + 1, number: (prev?.number ?? 0) + 1, sectionId: sec, subject: prev?.subject ?? section?.subject ?? "General",
              chapter: "", topic: "", type: prev?.type === "numerical" ? "numerical" : "single", text: "",
              options: prev?.type === "numerical" ? [] : ["A", "B", "C", "D"].map((key) => ({ key, text: "" })),
              correctAnswer: [], confidence: {}, reviewed: false, importNotes: ["Added manually"],
            };
            const shifted = a.questions.map((x) => (x.index > afterIndex ? { ...x, index: x.index + 1 } : x));
            return { ...a, questions: [...shifted, q].sort((x, y) => x.index - y.index), updatedAt: now() };
          });
          return id;
        },
        deleteQuestion: (aid, qid) =>
          mapAnalysis(aid, (a) => {
            const q = a.questions.find((x) => x.id === qid);
            if (!q) return a;
            const questions = a.questions.filter((x) => x.id !== qid).map((x) => (x.index > q.index ? { ...x, index: x.index - 1 } : x));
            const responses = { ...a.responses };
            delete responses[qid];
            return withAudit(a, { ...a, questions, responses }, "question_edited", `Q${q.index} deleted`);
          }),
        setResponse: (aid, qid, patch) =>
          mapAnalysis(aid, (a) => {
            const prev = a.responses[qid] ?? { questionId: qid, selected: [], entered: false };
            const r: QResponse = { ...prev, ...patch };
            const next = { ...a, responses: { ...a.responses, [qid]: r } };
            const answerChanged = "selected" in patch || "numerical" in patch;
            if (!answerChanged) return { ...next, updatedAt: now() };
            const q = a.questions.find((x) => x.id === qid);
            return withAudit(a, next, "answer_changed", `Your answer for Q${q?.index} changed from ${q ? formatResponse(q, prev) : "?"} to ${q ? formatResponse(q, r) : "?"}`);
          }),
        setResponses: (aid, patches) =>
          mapAnalysis(aid, (a) => {
            const responses = { ...a.responses };
            for (const [qid, p] of Object.entries(patches)) responses[qid] = { ...(responses[qid] ?? { questionId: qid, selected: [], entered: false }), ...p };
            return withAudit(a, { ...a, responses }, "answer_changed", `${Object.keys(patches).length} answers updated`);
          }),
        finalizeAnalysis: (aid) => {
          const a = get().analyses.find((x) => x.id === aid);
          if (!a) return null;
          const s = scoreAnalysis(a);
          const first = !a.finalizedAt;
          mapAnalysis(aid, (x) => ({
            ...x,
            finalizedAt: x.finalizedAt ?? now(),
            locked: true,
            snapshot: buildSnapshot(x, s),
            stage: stageIndex(x.stage) < stageIndex("results") ? "results" : x.stage,
            changes: first ? [...x.changes, { at: now(), kind: "finalized", detail: "Results calculated", scoreAfter: s.score }] : x.changes,
            planAppliedAt: now(),
          }));
          // Mark the exam itself as sat.
          set((st) => ({ exams: st.exams.map((e) => (e.id === a.examId && e.status === "upcoming" && e.date <= today() ? { ...e, status: "completed" } : e)) }));
          const root = rootExamId(get(), a.examId);
          return regenerateInternal(root, `Analysis of ${a.title}`);
        },
        unlockAnalysis: (aid) => mapAnalysis(aid, (a) => ({ ...a, locked: false })),
        deleteAnalysis: (aid) =>
          set((s) => ({
            analyses: s.analyses.filter((a) => a.id !== aid),
            notebook: s.notebook.filter((n) => n.analysisId !== aid),
            practiceSets: s.practiceSets.map((p) => ({ ...p, items: p.items.filter((i) => i.analysisId !== aid) })),
          })),

        /* -------------------------- error notebook ------------------------- */
        upsertNotebook: (aid, qid, fields) => {
          const s = get();
          const a = s.analyses.find((x) => x.id === aid);
          const q = a?.questions.find((x) => x.id === qid);
          if (!a || !q) return null;
          const r = a.responses[qid];
          const existing = s.notebook.find((n) => n.analysisId === aid && n.questionId === qid);
          const base = {
            subject: q.subject, chapter: q.chapter || "Unclassified", topic: q.topic, errorType: r?.errorPrimary ?? "unknown",
            studentAnswer: formatResponse(q, r), correctAnswer: formatKey(q),
          };
          if (existing) {
            set((st) => ({ notebook: st.notebook.map((n) => (n.id === existing.id ? { ...n, ...base, ...fields } : n)) }));
            return existing.id;
          }
          const entry: NotebookEntry = {
            id: uid("nb"), analysisId: aid, questionId: qid, examId: a.examId, createdAt: now(), ...base,
            whatWentWrong: r?.errorNote ?? "", correctedApproach: "", retries: [], nextRetryAt: addDays(today(), 1), mastery: "new", ...fields,
          };
          set((st) => ({ notebook: [...st.notebook, entry] }));
          return entry.id;
        },
        removeNotebookFor: (aid, qid) => set((s) => ({ notebook: s.notebook.filter((n) => !(n.analysisId === aid && n.questionId === qid && n.retries.length === 0)) })),
        updateNotebook: (id, patch) => set((s) => ({ notebook: s.notebook.map((n) => (n.id === id ? { ...n, ...patch } : n)) })),
        recordRetry: (id, selected, numerical) => {
          const s = get();
          const n = s.notebook.find((x) => x.id === id);
          const q = s.analyses.find((a) => a.id === n?.analysisId)?.questions.find((x) => x.id === n?.questionId);
          if (!n || !q) return null;
          let correct: boolean;
          if (q.type === "numerical") {
            const v = parseNumerical(numerical);
            correct = v !== null && !!q.numericalAnswer && Math.abs(v - q.numericalAnswer.value) <= Math.max(q.numericalAnswer.tolerance, 1e-9);
          } else {
            const key = new Set(q.correctAnswer);
            correct = q.type === "single" ? selected.length === 1 && key.has(selected[0]) : selected.length === key.size && selected.every((k) => key.has(k));
          }
          const prevCorrect = n.retries[n.retries.length - 1]?.correct;
          set((st) => ({
            notebook: st.notebook.map((x) =>
              x.id === id
                ? {
                    ...x,
                    retries: [...x.retries, { at: now(), selected, numerical, correct }],
                    mastery: correct ? (prevCorrect ? "mastered" : "reviewing") : x.mastery === "mastered" ? "reviewing" : x.mastery,
                    nextRetryAt: correct ? (prevCorrect ? undefined : addDays(today(), 7)) : addDays(today(), 2),
                  }
                : x,
            ),
          }));
          return correct;
        },
        addNotebookToRevision: (id) => {
          const s = get();
          const n = s.notebook.find((x) => x.id === id);
          if (!n) return;
          const root = rootExamId(s, n.examId);
          set((st) => ({
            notebook: st.notebook.map((x) => (x.id === id ? { ...x, inRevision: true } : x)),
            revisions: [
              ...st.revisions,
              { id: uid("rev"), examId: root, notebookId: id, label: `Mistake: ${n.chapter} (${n.errorType})`, dueAt: addDays(today(), 1), status: "pending", checkpoint: "Mistake review" },
              { id: uid("rev"), examId: root, notebookId: id, label: `Mistake: ${n.chapter} (${n.errorType})`, dueAt: addDays(today(), 7), status: "pending", checkpoint: "7-day mistake review" },
            ],
          }));
        },
        deleteNotebook: (id) => set((s) => ({ notebook: s.notebook.filter((n) => n.id !== id) })),

        /* --------------------------- question bank ------------------------- */
        createPracticeSet: (name, items) => {
          const id = uid("set");
          set((s) => ({ practiceSets: [...s.practiceSets, { id, name, items, createdAt: now() }] }));
          return id;
        },
        addToPracticeSet: (setId, items) =>
          set((s) => ({
            practiceSets: s.practiceSets.map((p) =>
              p.id === setId ? { ...p, items: [...p.items, ...items.filter((i) => !p.items.some((x) => x.questionId === i.questionId))] } : p,
            ),
          })),
        deletePracticeSet: (id) => set((s) => ({ practiceSets: s.practiceSets.filter((p) => p.id !== id) })),
      };
    },
    {
      name: STORE_KEY,
      version: DATA_VERSION,
      storage: createIdbStorage<AppData>(),
      partialize: (s) => dataOf(s as Store),
      onRehydrateStorage: () => (state, error) => {
        if (error) console.error("Student OS: could not load saved data", error);
        // Marking the store loaded re-saves the same data; that must not count as an unsaved change.
        quietly(() => useStore.setState({ _hydrated: true }));
        if (state) applyTheme(state.settings.theme);
      },
      merge: (persisted, current) => {
        const p = persisted as Partial<AppData> | undefined;
        if (!p || typeof p !== "object") return current;
        return { ...current, ...p, settings: { ...current.settings, ...(p.settings ?? {}) } };
      },
    },
  ),
);

export const getData = (): AppData => dataOf(useStore.getState());

// Another open tab saved: load its data so both windows always show the same thing.
if (typeof window !== "undefined") listenForOtherTabs(() => useStore.persist.rehydrate());

if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  (window as unknown as { __examPilot: typeof useStore }).__examPilot = useStore;
}
