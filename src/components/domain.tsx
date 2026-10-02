"use client";
/** Domain components shared across screens. */
import Link from "next/link";
import { Children, useState, type ReactNode } from "react";
import {
  ArrowRight, BookOpen, Brain, Calculator, CalendarDays, Check, ChevronDown, CircleCheck, CircleMinus, CircleX, ClipboardCheck,
  Clock, FileText, Flag, Gauge, Layers, Lightbulb, ListChecks, LoaderCircle, Repeat, RotateCcw, ScanSearch, Sparkles, Target, Timer,
  TrendingDown, TrendingUp, TriangleAlert, Zap, type LucideIcon,
} from "lucide-react";
import { TASK_TYPE_META } from "@/domain/catalog";
import type { Observation } from "@/domain/analysis";
import type { Readiness } from "@/domain/planner";
import { STATUS_LABEL } from "@/domain/scoring";
import type { Difficulty, Exam, Priority, ResultStatus, StudyTask, TaskType } from "@/domain/types";
import { addDays, daysBetween, formatDate, formatRelativeDay, today } from "@/domain/util";
import { useStore } from "@/store/store";
import { useSaveStatus } from "@/store/storage";
import { Badge, Button, cn, ProgressBar, subjectClass, toast, type Tone } from "./ui";

/* -------------------------- Difficulty picker -------------------------- */

const DIFF_OPTS: { v: Difficulty; label: string; on: string }[] = [
  { v: "easy", label: "Easy", on: "bg-good-soft text-good ring-good/40" },
  { v: "medium", label: "Medium", on: "bg-warn-soft text-warn ring-warn/40" },
  { v: "hard", label: "Hard", on: "bg-bad-soft text-bad ring-bad/40" },
];

/** Easy / Medium / Hard pills. Harder topics get more study time and rank higher in the plan. */
export function DifficultyPicker({ value, onChange, label, size = "sm" }: { value: Difficulty; onChange: (d: Difficulty) => void; label: string; size?: "sm" | "xs" }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex shrink-0 gap-0.5 rounded-lg border border-border bg-surface-2 p-0.5">
      {DIFF_OPTS.map((o) => (
        <button key={o.v} type="button" role="radio" aria-checked={value === o.v} onClick={(e) => { e.stopPropagation(); if (value !== o.v) onChange(o.v); }}
          className={cn("rounded-md font-medium transition", size === "sm" ? "h-8 px-2.5 text-[13px]" : "h-8 px-2 text-xs",
            value === o.v ? `ring-1 ${o.on}` : "text-fg-3 hover:bg-surface hover:text-fg")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ----------------------------- Status chip ---------------------------- */

const STATUS_META: Record<ResultStatus, { tone: Tone; icon: LucideIcon }> = {
  correct: { tone: "good", icon: CircleCheck },
  wrong: { tone: "bad", icon: CircleX },
  unattempted: { tone: "muted", icon: CircleMinus },
  partial: { tone: "warn", icon: TriangleAlert },
  bonus: { tone: "accent", icon: Sparkles },
  dropped: { tone: "neutral", icon: CircleMinus },
  unkeyed: { tone: "warn", icon: TriangleAlert },
  not_counted: { tone: "neutral", icon: CircleMinus },
};

export function StatusChip({ status, className }: { status: ResultStatus; className?: string }) {
  const m = STATUS_META[status];
  return (
    <Badge tone={m.tone} icon={m.icon} className={className}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const tone: Tone = priority === "high" ? "bad" : priority === "medium" ? "warn" : "neutral";
  return (
    <Badge tone={tone} icon={priority === "high" ? Flag : undefined}>
      {priority === "high" ? "High" : priority === "medium" ? "Medium" : "Low"}
    </Badge>
  );
}

/* ------------------------------ Task card ----------------------------- */

export const TASK_ICONS: Record<TaskType, LucideIcon> = {
  learn: BookOpen,
  review_notes: FileText,
  active_recall: Brain,
  practice: Calculator,
  timed_set: Timer,
  redo_mistakes: RotateCcw,
  formula_review: Layers,
  mock_test: ClipboardCheck,
  exam_analysis: ScanSearch,
  revision: Repeat,
  strategy: Target,
};

const SOURCE_LABEL: Record<StudyTask["source"], string> = {
  planner: "Plan",
  analysis: "From exam analysis",
  revision: "Spaced revision",
  notebook: "Error Notebook",
  user: "Added by you",
};

function taskLink(t: StudyTask): { href: string; label: string } | null {
  if (t.type === "exam_analysis") return { href: "/analyzer/new", label: "Open Analyzer" };
  if (t.type === "redo_mistakes" && t.source === "notebook") return { href: "/notebook?filter=due", label: "Open due mistakes" };
  if (t.source === "analysis" && t.sourceRef?.analysisId) return { href: `/analyzer/${t.sourceRef.analysisId}/report`, label: "See evidence" };
  return null;
}

export function TaskCard({ task, compact, showDate, examLabel }: { task: StudyTask; compact?: boolean; showDate?: boolean; examLabel?: string }) {
  const toggle = useStore((s) => s.toggleTask);
  const skip = useStore((s) => s.skipTask);
  const move = useStore((s) => s.moveTask);
  const del = useStore((s) => s.deleteTask);
  const difficulty = useStore((s) => (task.topicId ? s.topics.find((t) => t.id === task.topicId)?.difficulty : undefined));
  const setDifficulty = useStore((s) => s.setTopicDifficulty);
  const [open, setOpen] = useState(false);
  const Icon = TASK_ICONS[task.type];
  const done = task.status === "done";
  const skipped = task.status === "skipped";
  const link = taskLink(task);
  const overdue = task.status === "pending" && task.dueDate < today();

  return (
    <div className={cn("group bg-surface", subjectClass(task.subject), skipped && "opacity-60")}>
      <div className="flex items-start gap-1 py-1 pr-1.5 pl-1.5">
        <button
          onClick={() => toggle(task.id)}
          aria-label={done ? `Mark “${task.title}” as not done` : `Mark “${task.title}” as done`}
          aria-pressed={done}
          className="grid size-11 shrink-0 place-items-center"
        >
          <svg viewBox="0 0 26 26" className="size-[26px]" aria-hidden>
            {done ? (
              <>
                <circle cx="13" cy="13" r="12" fill="var(--dot)" />
                <path d="m8 13.4 3.3 3.2L18 9.8" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </>
            ) : <circle cx="13" cy="13" r="11.5" fill="none" stroke="var(--border-strong)" strokeWidth="1.8" />}
          </svg>
        </button>
        <div className="min-w-0 flex-1 py-2">
          <div className={cn("text-[16px] leading-[22px] font-semibold text-fg [overflow-wrap:anywhere]", done && "text-faint line-through")}>{task.title}</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[13px] text-fg-3">
            {task.subject && <span className="subj-tag">{task.subject}</span>}
            <span className="inline-flex items-center gap-1">
              <Icon className="size-3.5" aria-hidden />
              {TASK_TYPE_META[task.type].label}
            </span>
            <span className="inline-flex items-center gap-1"><Clock className="size-3" aria-hidden />{task.durationMinutes} min</span>
            {examLabel && <span className="font-semibold text-accent-text">{examLabel}</span>}
            {showDate && <span className={cn(overdue && "font-semibold text-bad")}>{overdue ? "Overdue · " : ""}{formatRelativeDay(task.dueDate)}</span>}
            {!compact && task.priority === "high" && !done && <PriorityBadge priority="high" />}
            {task.source === "analysis" && <Badge tone="accent" icon={Sparkles}>From analysis</Badge>}
            {skipped && <Badge tone="neutral">Skipped</Badge>}
          </div>
          {difficulty && task.topicId && !done && (
            <div className="mt-2">
              <DifficultyPicker size="xs" value={difficulty} label={`Difficulty of ${task.topic ?? task.title}`}
                onChange={(d) => { setDifficulty(task.topicId!, d); toast(`${task.topic ?? "Topic"} set to ${d}. Plan updated.`); }} />
            </div>
          )}
          {open && (
            <div className="mt-2.5 space-y-2 animate-in">
              <div className="rounded-[14px] bg-surface-2 px-3 py-2.5 text-[13px] text-fg-2">
                <span className="font-semibold text-fg">Why: </span>
                {task.reason}
                <div className="mt-1 text-xs text-fg-3">Source: {SOURCE_LABEL[task.source]}{task.chapter ? ` · ${task.chapter}` : ""}{task.topic ? ` › ${task.topic}` : ""}</div>
              </div>
              {task.checklist && (
                <ul className="space-y-1 text-[13px] text-fg-2">
                  {task.checklist.map((c) => (
                    <li key={c} className="flex gap-2"><ListChecks className="mt-0.5 size-3.5 shrink-0 text-fg-3" aria-hidden />{c}</li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap gap-1.5">
                {link && (
                  <Link href={link.href} className="inline-flex h-8 items-center gap-1 rounded-full bg-accent-soft px-3 text-[13px] font-semibold text-accent-text hover:brightness-95">
                    {link.label} <ArrowRight className="size-3.5" />
                  </Link>
                )}
                {task.status !== "done" && (
                  <>
                    <Button size="xs" variant="soft" onClick={() => move(task.id, addDays(task.dueDate < today() ? today() : task.dueDate, 1))}>Move to tomorrow</Button>
                    <Button size="xs" variant="soft" onClick={() => skip(task.id)}>{skipped ? "Unskip" : "Skip"}</Button>
                  </>
                )}
                {task.source === "user" && <Button size="xs" variant="ghost" className="text-bad" onClick={() => del(task.id)}>Delete</Button>}
              </div>
            </div>
          )}
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label="Show why this task is in your plan, and more options"
          className="mt-1.5 grid size-9 shrink-0 place-items-center rounded-full text-faint hover:bg-surface-2 hover:text-fg"
        >
          <ChevronDown className={cn("size-[18px] transition", open && "rotate-180")} aria-hidden />
        </button>
      </div>
    </div>
  );
}

/** Groups task rows into one rounded card with hairline separators, like an iOS list. */
export function TaskList({ children, className }: { children: ReactNode; className?: string }) {
  const rows = Children.toArray(children);
  return (
    <div className={cn("overflow-hidden rounded-[20px] bg-surface", className)}>
      {rows.map((r, i) => (
        <div key={i}>
          {i > 0 && <div className="ml-[52px] h-px bg-border" aria-hidden />}
          {r}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------ Exam bits ----------------------------- */

export function Countdown({ date, className }: { date: string; className?: string }) {
  const n = daysBetween(today(), date);
  const label = n === 0 ? "Today" : n === 1 ? "Tomorrow" : n > 0 ? `${n} days` : `${-n} days ago`;
  return <span className={cn("tabular", n >= 0 && n <= 7 && "text-warn", className)}>{label}</span>;
}

export function ExamTypeBadge({ exam }: { exam: Exam }) {
  if (exam.parentExamId) return <Badge tone="neutral">Mock / test</Badge>;
  return <Badge tone="accent" icon={Target}>Goal exam</Badge>;
}

/* ---------------------------- Observations ---------------------------- */

const OBS_TONE: Record<Observation["severity"], { tone: Tone; icon: LucideIcon; label: string }> = {
  high: { tone: "bad", icon: TriangleAlert, label: "High impact" },
  medium: { tone: "warn", icon: Zap, label: "Medium" },
  low: { tone: "neutral", icon: Lightbulb, label: "Low" },
  positive: { tone: "good", icon: TrendingUp, label: "Strength" },
};

export function ObservationCard({ o, compact }: { o: Observation; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const m = OBS_TONE[o.severity];
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3">
      <div className="flex items-start gap-3">
        <m.icon className={cn("mt-0.5 size-4 shrink-0", { good: "text-good", bad: "text-bad", warn: "text-warn", neutral: "text-fg-3", accent: "text-accent-text", muted: "text-fg-3" }[m.tone])} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-fg">{o.title}</p>
            <Badge tone={m.tone}>{m.label}</Badge>
          </div>
          <p className="mt-1 text-[13px] leading-relaxed text-fg-2">{o.evidence}</p>
          {!compact && o.refs.length > 0 && (
            <div className="mt-2">
              <button onClick={() => setOpen((v) => !v)} className="inline-flex min-h-9 items-center text-[13px] font-medium text-accent-text hover:underline" aria-expanded={open}>
                {open ? "Hide" : "Show"} {o.refs.length} linked question{o.refs.length === 1 ? "" : "s"}
              </button>
              {open && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {o.refs.map((r) => (
                    <Link key={r.analysisId + r.questionId} href={`/analyzer/${r.analysisId}/results?q=${r.questionId}`} className="rounded-md border border-border bg-surface-2 px-2 py-0.5 text-xs text-fg-2 hover:border-accent hover:text-fg">
                      {r.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Readiness ----------------------------- */

export function ReadinessPanel({ readiness, compact }: { readiness: Readiness; compact?: boolean }) {
  const toneBar = { good: "good", ok: "warn", weak: "bad", none: "muted" } as const;
  const toneText = { good: "text-good", ok: "text-warn", weak: "text-bad", none: "text-fg-3" };
  const trendIcon = readiness.trend === "improving" ? TrendingUp : readiness.trend === "declining" ? TrendingDown : Gauge;
  const TI = trendIcon;
  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="eyebrow">Readiness index</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-4xl font-semibold tracking-tight tabular">{readiness.index ?? "—"}</span>
            {readiness.index !== null && <span className="text-sm text-fg-3">/ 100</span>}
          </div>
        </div>
        <Badge tone={readiness.trend === "improving" ? "good" : readiness.trend === "declining" ? "bad" : "neutral"} icon={TI}>
          {readiness.trend === "insufficient" ? "Trend needs 2+ tests" : `Mock trend ${readiness.trend}`}
        </Badge>
      </div>
      <p className="mt-1 text-xs text-fg-3">A weighted blend of the signals below — never a black box. Weights shown in brackets.</p>
      <ul className={cn("mt-4 grid gap-3", !compact && "sm:grid-cols-2")}>
        {readiness.signals.map((s) => (
          <li key={s.id} title={s.detail}>
            <div className="flex items-baseline justify-between gap-2 text-[13px]">
              <span className="text-fg-2">{s.label} <span className="text-[11px] text-fg-3">({Math.round(s.weight * 100)}%)</span></span>
              <span className={cn("font-semibold tabular", toneText[s.tone])}>{s.display}</span>
            </div>
            <ProgressBar value={s.value ?? 0} tone={toneBar[s.tone]} size="sm" className="mt-1.5" label={s.label} />
            {!compact && <p className="mt-1 text-[11.5px] text-fg-3">{s.detail}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------- Autosave ----------------------------- */

export function SaveIndicator() {
  const { state } = useSaveStatus();
  if (state === "idle") return null;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs", state === "error" ? "text-bad" : "text-fg-3")} aria-live="polite">
      {state === "saving" ? <LoaderCircle className="size-3 animate-spin" aria-hidden /> : state === "saved" ? <CircleCheck className="size-3 text-good" aria-hidden /> : <TriangleAlert className="size-3" aria-hidden />}
      {state === "saving" ? "Saving…" : state === "saved" ? "All changes saved" : "Save failed — export a backup"}
    </span>
  );
}

export function Delta({ value, suffix = "", invert, className }: { value: number | null | undefined; suffix?: string; invert?: boolean; className?: string }) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const up = value > 0;
  const good = invert ? !up : up;
  if (value === 0) return <span className={cn("text-xs text-fg-3", className)}>no change</span>;
  const I = up ? TrendingUp : TrendingDown;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium tabular", good ? "text-good" : "text-bad", className)}>
      <I className="size-3" aria-hidden />
      {up ? "+" : "−"}{Math.abs(Math.round(value * 10) / 10)}{suffix}
    </span>
  );
}

export function SectionTitle({ children, action, id }: { children: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 id={id} className="text-[15px] font-semibold tracking-tight">{children}</h2>
      {action}
    </div>
  );
}

export function DateText({ date }: { date: string }) {
  return <span title={formatDate(date)}>{formatRelativeDay(date)}</span>;
}

export { CalendarDays };
