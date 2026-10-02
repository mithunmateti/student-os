"use client";
/**
 * Calendar and to-do building blocks shared by the dashboard, the Calendar and the
 * To-do list. They all read the same store, so ticking, adding, moving or deleting a
 * task anywhere updates every view at once (and other open windows, via live sync).
 */
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useShallow } from "zustand/react/shallow";
import { CalendarOff, CalendarPlus, CalendarDays, Check, ChevronLeft, ChevronRight, NotebookPen, Plus, SlidersHorizontal, Sun, Target } from "lucide-react";
import { buildAgenda, monthGrid, monthOf, shiftMonth, weekdayLabels, type DayAgenda } from "@/domain/agenda";
import { targetExams } from "@/domain/selectors";
import type { Priority } from "@/domain/types";
import { addDays, daysBetween, formatDate, formatRelativeDay } from "@/domain/util";
import { useToday } from "@/lib/hooks";
import { useStore } from "@/store/store";
import { TASK_DRAG_TYPE, TaskCard, TaskList } from "./domain";
import { Badge, Button, cn, LinkButton, ProgressBar, subjectClass, toast } from "./ui";

/* ------------------------------- Data ------------------------------- */

export function useAgenda(from: string, to: string): Map<string, DayAgenda> {
  const { tasks, exams, notebook, settings } = useStore(useShallow((s) => ({ tasks: s.tasks, exams: s.exams, notebook: s.notebook, settings: s.settings })));
  return useMemo(() => buildAgenda({ tasks, exams, notebook, settings }, from, to), [tasks, exams, notebook, settings, from, to]);
}

/** Where a new task belongs: every subject of the upcoming goal exams, each mapped to its exam. */
export function useTaskHome() {
  const exams = useStore((s) => s.exams);
  const d = useToday();
  return useMemo(() => {
    const goals = targetExams({ exams }).sort((a, b) => a.date.localeCompare(b.date));
    const upcoming = goals.filter((g) => g.date >= d);
    const list = upcoming.length ? upcoming : goals;
    const examFor = new Map<string, string>();
    for (const g of list) for (const s of g.subjects) if (!examFor.has(s)) examFor.set(s, g.id);
    const fallback = list[0]?.id ?? "";
    return {
      subjects: [...examFor.keys()],
      examIdFor: (subject?: string) => (subject && examFor.get(subject)) || fallback,
      examName: (id: string) => exams.find((e) => e.id === id)?.name,
      multi: list.length > 1,
    };
  }, [exams, d]);
}

/** "Today", "Tomorrow", "in 5 days", "3 days ago". */
export function relativeLabel(date: string, ref: string): string {
  const n = daysBetween(ref, date);
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n === -1) return "Yesterday";
  return n > 0 ? `In ${n} days` : `${-n} days ago`;
}

function dayAriaLabel(day: DayAgenda, ref: string): string {
  const parts = [formatDate(day.date, { weekday: "long", day: "numeric", month: "long" })];
  if (day.date === ref) parts.push("today");
  parts.push(day.total ? `${day.total} task${day.total === 1 ? "" : "s"}, ${day.done} done` : "no tasks");
  for (const e of day.exams) parts.push(`${e.parentExamId ? "mock test" : "exam"}: ${e.name}`);
  if (day.blocked) parts.push("day off");
  return parts.join(", ");
}

/** Coloured dots for a day: an exam (red), then the subjects still to study, or a tick when everything is done. */
function DayDots({ day, max = 3, inverted }: { day: DayAgenda; max?: number; inverted?: boolean }) {
  const allDone = day.total > 0 && day.done === day.total;
  return (
    <span className="flex h-1.5 items-center justify-center gap-[3px]" aria-hidden>
      {day.exams.length > 0 && <span className={cn("size-1.5 rounded-full", inverted ? "bg-white" : "bg-[var(--badge)]")} />}
      {allDone ? <Check className={cn("size-2.5", inverted ? "text-white" : "text-good")} strokeWidth={4} />
        : day.subjects.slice(0, max).map((s) => <span key={s} className={cn("size-1.5 rounded-full", subjectClass(s), inverted ? "bg-white/85" : "bg-[var(--dot)]")} />)}
      {!allDone && !day.subjects.length && day.total > day.done && <span className={cn("size-1.5 rounded-full", inverted ? "bg-white/85" : "bg-fg-3")} />}
    </span>
  );
}

/* ---------------------------- Month calendar ---------------------------- */

const WEEK_START = 1; // Monday

export function MonthCalendar({ month, onMonth, selected, onSelect, compact, droppable, className }: {
  month: string;
  onMonth: (m: string) => void;
  selected: string;
  onSelect: (date: string) => void;
  compact?: boolean;
  droppable?: boolean;
  className?: string;
}) {
  const d = useToday();
  const full = useMemo(() => monthGrid(month, WEEK_START), [month]);
  // Drop the sixth row when it's entirely next month.
  const grid = monthOf(full[35]) !== month ? full.slice(0, 35) : full;
  const agenda = useAgenda(grid[0], grid[grid.length - 1]);
  const moveTask = useStore((s) => s.moveTask);
  const [over, setOver] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const refocus = useRef(false);
  const labels = weekdayLabels(WEEK_START, compact ? "narrow" : "short");
  const focusable = grid.includes(selected) ? selected : `${month}-01`;

  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    ref.current?.querySelector<HTMLElement>(`[data-date="${selected}"]`)?.focus();
  }, [selected, month]);

  const onKey = (e: ReactKeyboardEvent) => {
    const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    // Move from the day that has focus (it can differ from the selected day after a click elsewhere).
    const from = (e.target as HTMLElement).dataset?.date ?? selected;
    let next: string | null = null;
    if (e.key in steps) next = addDays(from, steps[e.key]);
    else if (e.key === "PageUp" || e.key === "PageDown") next = `${shiftMonth(monthOf(from), e.key === "PageUp" ? -1 : 1)}${from.slice(7)}`.replace(/-(3[01]|29)$/, "-28");
    else if (e.key === "Home") next = d;
    if (!next) return;
    e.preventDefault();
    refocus.current = true;
    if (monthOf(next) !== month) onMonth(monthOf(next));
    onSelect(next);
  };

  const drop = (date: string, id: string) => {
    const t = useStore.getState().tasks.find((x) => x.id === id);
    if (!t || t.dueDate === date) return;
    const from = t.dueDate;
    moveTask(id, date);
    toast(`Moved “${t.title}” to ${formatDate(date, { weekday: "short", day: "numeric", month: "short" })}`, "good", { label: "Undo", onClick: () => moveTask(id, from) });
  };

  return (
    <div className={className}>
      <div className="mb-2 flex items-center gap-1 px-1">
        <h2 className={cn("flex-1 font-black", compact ? "text-[17px]" : "text-[22px]")} aria-live="polite">
          {formatDate(`${month}-01`, { month: "long", year: "numeric" })}
        </h2>
        {monthOf(d) !== month && (
          <button onClick={() => { onMonth(monthOf(d)); onSelect(d); }} className="h-9 rounded-full bg-accent-soft px-3 text-[13px] font-bold text-accent-text">Today</button>
        )}
        <button onClick={() => onMonth(shiftMonth(month, -1))} aria-label="Previous month" className="grid size-9 place-items-center rounded-full text-fg-2 hover:bg-surface-2"><ChevronLeft className="size-5" aria-hidden /></button>
        <button onClick={() => onMonth(shiftMonth(month, 1))} aria-label="Next month" className="grid size-9 place-items-center rounded-full text-fg-2 hover:bg-surface-2"><ChevronRight className="size-5" aria-hidden /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 pb-1" aria-hidden>
        {labels.map((l, i) => <div key={i} className="text-center text-[11px] font-bold tracking-wide text-fg-3 uppercase">{l}</div>)}
      </div>
      <div ref={ref} role="group" aria-label={`Days in ${formatDate(`${month}-01`, { month: "long", year: "numeric" })}. Use the arrow keys to move between days.`} onKeyDown={onKey}
        className="grid grid-cols-7 gap-1">
        {grid.map((date) => {
          const day = agenda.get(date)!;
          const out = monthOf(date) !== month;
          const isToday = date === d;
          const sel = date === selected;
          const past = date < d;
          return (
            <button key={date} data-date={date} tabIndex={date === focusable ? 0 : -1} onClick={() => onSelect(date)} aria-pressed={sel} aria-label={dayAriaLabel(day, d)}
              onDragOver={droppable ? (e) => { if (e.dataTransfer.types.includes(TASK_DRAG_TYPE)) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setOver(date); } } : undefined}
              onDragLeave={droppable ? () => setOver((o) => (o === date ? null : o)) : undefined}
              onDrop={droppable ? (e) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData(TASK_DRAG_TYPE); if (id) drop(date, id); } : undefined}
              className={cn(
                "relative flex min-w-0 flex-col rounded-[12px] text-left transition outline-offset-1",
                compact ? "min-h-11 items-center justify-center gap-1 py-1" : "min-h-[62px] gap-1 p-1.5 sm:min-h-[96px] sm:p-2",
                day.blocked ? "bg-[repeating-linear-gradient(135deg,var(--surface-2)_0_5px,transparent_5px_10px)]" : !compact && (out ? "bg-transparent" : "bg-surface-2/60"),
                compact && !sel && "hover:bg-surface-2",
                !compact && !sel && "hover:bg-surface-3",
                sel && (compact ? "bg-accent-soft" : "bg-accent-soft ring-2 ring-accent ring-inset"),
                over === date && "bg-accent-soft outline-2 outline-dashed outline-accent",
              )}>
              <span className={cn("flex w-full items-center gap-1", compact ? "justify-center" : "justify-between")}>
                <span className={cn("grid size-7 shrink-0 place-items-center rounded-full text-[13px] font-bold tabular",
                  isToday ? "bg-accent text-white" : out ? "text-faint" : past ? "text-fg-3" : "text-fg")}>
                  {Number(date.slice(8))}
                </span>
                {!compact && day.total > 0 && <span className={cn("hidden text-[11px] font-bold tabular sm:inline", day.done === day.total ? "text-good" : "text-fg-3")}>{day.done}/{day.total}</span>}
              </span>
              {compact ? <DayDots day={day} /> : (
                <>
                  {day.exams.slice(0, 2).map((e) => (
                    <span key={e.id} className="hidden truncate rounded-md bg-bad-soft px-1.5 py-px text-[11px] font-bold text-bad sm:block">{e.name}</span>
                  ))}
                  {day.blocked && <span className="hidden text-[11px] font-bold text-fg-3 sm:block">Day off</span>}
                  <span className="mt-auto flex w-full flex-col gap-1">
                    <span className="sm:hidden"><DayDots day={day} max={2} /></span>
                    <span className="hidden flex-wrap gap-[3px] sm:flex" aria-hidden>
                      {day.subjects.slice(0, 4).map((s) => <span key={s} className={cn("size-2 rounded-full bg-[var(--dot)]", subjectClass(s))} />)}
                    </span>
                    {day.total > 0 && (
                      <span className="hidden h-1 w-full overflow-hidden rounded-full bg-surface-3 sm:block" aria-hidden>
                        <span className="block h-full rounded-full bg-good" style={{ width: `${(day.done / day.total) * 100}%` }} />
                      </span>
                    )}
                  </span>
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------ Week strip ------------------------------ */

export function WeekStrip({ start, onStart, selected, onSelect }: { start: string; onStart: (d: string) => void; selected: string; onSelect: (d: string) => void }) {
  const d = useToday();
  const end = addDays(start, 6);
  const agenda = useAgenda(start, end);
  const dates = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return (
    <div className="flex items-center gap-1">
      <button onClick={() => onStart(addDays(start, -7))} aria-label="Previous week" className="grid size-8 shrink-0 place-items-center rounded-full text-fg-3 hover:bg-surface hover:text-fg"><ChevronLeft className="size-5" aria-hidden /></button>
      <div role="radiogroup" aria-label="Choose a day" className="grid flex-1 grid-cols-7 gap-1">
        {dates.map((date) => {
          const day = agenda.get(date)!;
          const sel = date === selected;
          return (
            <button key={date} role="radio" aria-checked={sel} aria-label={dayAriaLabel(day, d)} onClick={() => onSelect(date)}
              className={cn("flex min-w-0 flex-col items-center gap-1 rounded-2xl py-2 transition",
                sel ? "bg-accent text-white shadow-[0_6px_16px_-6px_var(--accent)]" : "bg-surface text-fg hover:bg-surface-3",
                day.blocked && !sel && "bg-[repeating-linear-gradient(135deg,var(--surface-2)_0_5px,var(--surface)_5px_10px)]")}>
              <span className={cn("text-[11px] font-bold uppercase", sel ? "text-white/85" : date === d ? "text-accent-text" : "text-fg-3")}>
                {formatDate(date, { weekday: "short" }).slice(0, 3)}
              </span>
              <span className="text-[18px] leading-none font-black tabular">{Number(date.slice(8))}</span>
              <DayDots day={day} max={2} inverted={sel} />
            </button>
          );
        })}
      </div>
      <button onClick={() => onStart(addDays(start, 7))} aria-label="Next week" className="grid size-8 shrink-0 place-items-center rounded-full text-fg-3 hover:bg-surface hover:text-fg"><ChevronRight className="size-5" aria-hidden /></button>
    </div>
  );
}

/* ------------------------------ Add a task ------------------------------ */

const LENGTHS = [15, 30, 45, 60, 90];

/** Type a task, pick a subject, press +. With `pickDate`, the day can be chosen too. */
export function AddTaskInline({ date, pickDate, idPrefix = "add" }: { date: string; pickDate?: boolean; idPrefix?: string }) {
  const addTask = useStore((s) => s.addTask);
  const d = useToday();
  const home = useTaskHome();
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState(home.subjects[0] ?? "");
  const [mins, setMins] = useState(30);
  const [priority, setPriority] = useState<Priority>("medium");
  const [when, setWhen] = useState(date);
  const [more, setMore] = useState(false);
  useEffect(() => setWhen(date), [date]);
  useEffect(() => {
    if (subject && !home.subjects.includes(subject)) setSubject(home.subjects[0] ?? "");
  }, [home.subjects, subject]);

  const target = pickDate ? when : date;
  const n = daysBetween(d, target);
  const label = n === 0 ? "today" : n === 1 ? "tomorrow" : formatDate(target, { weekday: "long", day: "numeric", month: "short" });

  const submit = () => {
    const t = title.trim();
    if (!t) return;
    addTask({ examId: home.examIdFor(subject), title: t, type: "practice", dueDate: target, durationMinutes: mins, priority, subject: subject || undefined, reason: "Added by you." });
    setTitle("");
    toast(n === 0 ? "Added to today's plan" : `Added for ${label}`);
  };

  const chip = (on: boolean) => cn("h-8 rounded-full px-3 text-[13px] font-bold transition", on ? "bg-accent text-white" : "bg-surface-2 text-fg-2 hover:text-fg");

  return (
    <form className="card space-y-2.5 p-2.5 pb-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div className="flex items-center gap-2">
        <label htmlFor={`${idPrefix}-title`} className="sr-only">Add a task for {label}</label>
        <input id={`${idPrefix}-title`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`Add a task for ${label}…`} autoComplete="off"
          className="field h-11 min-w-0 flex-1 !text-[17px]" />
        <button type="button" onClick={() => setMore((v) => !v)} aria-expanded={more} aria-label="More options" className={cn("grid size-11 shrink-0 place-items-center rounded-full", more ? "bg-accent-soft text-accent-text" : "bg-surface-2 text-fg")}>
          <SlidersHorizontal className="size-[18px]" aria-hidden />
        </button>
        <button type="submit" disabled={!title.trim()} aria-label="Add task" className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-white disabled:opacity-40">
          <Plus className="size-5" aria-hidden />
        </button>
      </div>
      {pickDate && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="When">
          <button type="button" aria-pressed={when === d} onClick={() => setWhen(d)} className={chip(when === d)}>Today</button>
          <button type="button" aria-pressed={when === addDays(d, 1)} onClick={() => setWhen(addDays(d, 1))} className={chip(when === addDays(d, 1))}>Tomorrow</button>
          <label className={cn("inline-flex h-8 items-center gap-1.5 rounded-full pr-1 pl-3 text-[13px] font-bold", n > 1 ? "bg-accent text-white" : "bg-surface-2 text-fg-2")}>
            <CalendarDays className="size-3.5" aria-hidden />Pick a day
            <input type="date" min={d} value={when} onChange={(e) => e.target.value && setWhen(e.target.value)} aria-label="Task date"
              className="h-7 rounded-full bg-surface px-2 text-[13px] font-semibold text-fg" />
          </label>
        </div>
      )}
      {home.subjects.length > 0 && (
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Subject">
          {home.subjects.map((s) => (
            <button key={s} type="button" role="radio" aria-checked={subject === s} onClick={() => setSubject(s)}
              className={cn("h-8 rounded-full border-[1.5px] px-3 text-[13px] font-bold transition", subjectClass(s),
                subject === s ? "border-[var(--dot)] bg-[var(--tint)] text-[var(--ink)]" : "border-border bg-surface text-fg-3")}>
              {s}
            </button>
          ))}
          <button type="button" role="radio" aria-checked={subject === ""} onClick={() => setSubject("")}
            className={cn("h-8 rounded-full border-[1.5px] px-3 text-[13px] font-bold transition", subject === "" ? "border-fg-3 bg-surface-2 text-fg" : "border-border bg-surface text-fg-3")}>
            General
          </button>
        </div>
      )}
      {more && (
        <div className="space-y-2 px-1 animate-in">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-16 text-[13px] font-bold text-fg-3">Length</span>
            {LENGTHS.map((m) => <button key={m} type="button" onClick={() => setMins(m)} aria-pressed={mins === m} className={chip(mins === m)}>{m} min</button>)}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-16 text-[13px] font-bold text-fg-3">Priority</span>
            {(["high", "medium", "low"] as const).map((p) => <button key={p} type="button" onClick={() => setPriority(p)} aria-pressed={priority === p} className={chip(priority === p)}>{p[0].toUpperCase() + p.slice(1)}</button>)}
          </div>
        </div>
      )}
    </form>
  );
}

/* ------------------------------ Day details ------------------------------ */

/** Everything on one day: exams, mistakes to retry, tasks, add a task, take the day off. */
export function DayDetails({ date, heading, showLink }: { date: string; heading?: string; showLink?: boolean }) {
  const d = useToday();
  const agenda = useAgenda(date, date);
  const day = agenda.get(date)!;
  const setDayOff = useStore((s) => s.setDayOff);
  const home = useTaskHome();
  const past = date < d;
  const left = day.total - day.done;
  const takeOff = () => {
    const before = useStore.getState().tasks.filter((t) => t.dueDate === date && t.status === "pending" && t.source !== "user" && !t.pinned).length;
    setDayOff(date, !day.blocked);
    if (day.blocked) toast("It's a study day again. Your plan was rebuilt to use it.");
    else toast(before ? `Day off. ${before} planned task${before === 1 ? "" : "s"} moved to other days.` : "Marked as a day off.", "good", { label: "Undo", onClick: () => setDayOff(date, false) });
  };
  const id = `day-${date}`;
  return (
    <section aria-labelledby={id} className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1 px-1">
        <div className="min-w-0">
          <p className={cn("text-[13px] font-extrabold", date === d ? "text-accent-text" : past ? "text-fg-3" : "text-accent-text")}>
            {relativeLabel(date, d)}{heading ? ` · ${formatDate(date, { weekday: "long", day: "numeric", month: "long" })}` : ""}
          </p>
          <h2 id={id} className="text-[22px] leading-7 font-black">{heading ?? formatDate(date, { weekday: "long", day: "numeric", month: "long" })}</h2>
        </div>
        <div className="flex items-center gap-3">
          {day.total > 0 && <span className="text-[13px] font-semibold text-fg-3 tabular">{left ? `${left} to do · ${day.plannedMinutes - day.doneMinutes} min` : "All done"}</span>}
          {showLink && <Link href={`/calendar?date=${date}`} className="inline-flex min-h-9 items-center text-sm font-bold text-accent-text">Calendar →</Link>}
        </div>
      </div>

      {!past && day.capacity > 0 && day.total > 0 && (
        <div className="px-1">
          <ProgressBar size="sm" value={day.plannedMinutes / day.capacity} tone={day.plannedMinutes > day.capacity ? "warn" : "accent"} label="Planned study time against time available" />
          <p className="mt-1 text-xs text-fg-3 tabular">{day.plannedMinutes} of {day.capacity} min of study time planned{day.plannedMinutes > day.capacity ? " · more than you have" : ""}</p>
        </div>
      )}

      {day.blocked && (
        <div className="flex items-center gap-2.5 rounded-2xl bg-surface-2 px-4 py-3 text-[14px] font-semibold text-fg-2">
          <Sun className="size-[18px] shrink-0 text-warn" aria-hidden />
          <span className="flex-1">Day off. Nothing new is planned for this day.</span>
        </div>
      )}

      {day.exams.map((e) => (
        <Link key={e.id} href={`/exam/${e.id}`} className="flex min-h-12 items-center gap-2.5 rounded-2xl bg-bad-soft px-4 py-2 text-[15px] font-bold text-bad">
          <Target className="size-[18px] shrink-0" aria-hidden />
          <span className="flex-1 truncate">{e.name}</span>
          <span className="text-xs font-bold">{e.parentExamId ? "Mock test" : "Exam day"} →</span>
        </Link>
      ))}

      {day.retries.length > 0 && (
        <Link href="/notebook?filter=due" className="flex min-h-12 items-center gap-2.5 rounded-2xl bg-surface px-4 text-[15px] font-bold">
          <NotebookPen className="size-[18px] shrink-0 text-accent" aria-hidden />
          <span className="flex-1">{day.retries.length} mistake{day.retries.length === 1 ? "" : "s"} to retry</span>
          <span className="text-sm text-accent-text">Retry →</span>
        </Link>
      )}

      {!past && <AddTaskInline date={date} idPrefix={`add-${date}`} />}

      {day.tasks.length ? (
        <TaskList>
          {day.tasks.map((t) => <TaskCard key={t.id} task={t} draggable examLabel={home.multi ? home.examName(t.examId) : undefined} />)}
        </TaskList>
      ) : (
        <div className="rounded-[20px] bg-surface px-5 py-8 text-center">
          <CalendarDays className="mx-auto size-7 text-fg-3" aria-hidden />
          <p className="mt-2 text-[16px] font-bold">{past ? "Nothing was planned" : day.blocked ? "Enjoy the day off" : "Nothing planned yet"}</p>
          {!past && !day.blocked && <p className="mt-0.5 text-sm text-fg-3">Add a task above, or rebuild your plan to fill free days.</p>}
        </div>
      )}

      {!past && (
        <div className="flex flex-wrap gap-2 px-1">
          <Button size="sm" variant="soft" icon={CalendarOff} onClick={takeOff}>{day.blocked ? "Make it a study day" : "Take this day off"}</Button>
          <LinkButton size="sm" variant="soft" icon={CalendarPlus} href={`/exams/new?date=${date}`}>Add an exam on this day</LinkButton>
        </div>
      )}
    </section>
  );
}

/* ------------------------------ Coming up ------------------------------ */

/** Next exams, mock tests and days off, nearest first. */
export function ComingUp({ limit = 6 }: { limit?: number }) {
  const d = useToday();
  const { exams, blocked } = useStore(useShallow((s) => ({ exams: s.exams, blocked: s.settings.planner.blockedDates })));
  const items = useMemo(() => [
    ...exams.filter((e) => !e.archived && e.date >= d).map((e) => ({ key: e.id, date: e.date, title: e.name, kind: e.parentExamId ? "Mock test" : "Goal exam", href: `/exam/${e.id}`, tone: e.parentExamId ? "accent" : "bad" })),
    ...blocked.filter((b) => b >= d && daysBetween(d, b) <= 60).map((b) => ({ key: `off-${b}`, date: b, title: "Day off", kind: "No study planned", href: `/calendar?date=${b}`, tone: "neutral" })),
  ].sort((a, b) => a.date.localeCompare(b.date)).slice(0, limit), [exams, blocked, d]);
  if (!items.length) return <p className="px-5 pb-5 text-sm text-fg-3">No exams or days off coming up. Add a mock test date to see it here.</p>;
  return (
    <ul className="px-2 pb-2">
      {items.map((it) => (
        <li key={it.key}>
          <Link href={it.href} className="flex min-h-14 items-center gap-3 rounded-2xl px-3 py-2 hover:bg-surface-2">
            <span className={cn("flex w-11 shrink-0 flex-col items-center rounded-xl py-1", it.tone === "bad" ? "bg-bad-soft text-bad" : it.tone === "accent" ? "bg-accent-soft text-accent-text" : "bg-surface-2 text-fg-2")}>
              <span className="text-[10px] font-extrabold uppercase">{formatDate(it.date, { month: "short" })}</span>
              <span className="text-[17px] leading-5 font-black tabular">{Number(it.date.slice(8))}</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-bold">{it.title}</span>
              <span className="block text-xs text-fg-3">{it.kind}</span>
            </span>
            <Badge tone={daysBetween(d, it.date) <= 7 ? "warn" : "neutral"}>{formatRelativeDay(it.date, d) === "Today" ? "Today" : relativeLabel(it.date, d)}</Badge>
          </Link>
        </li>
      ))}
    </ul>
  );
}
