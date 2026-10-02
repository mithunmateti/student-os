"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  ArrowRight, BookOpen, CalendarDays, CalendarClock, Compass, Flame, NotebookPen, Plus, ScanSearch, Sparkles, TriangleAlert,
} from "lucide-react";
import { ChartCard, Bars, HBarList, LineTrend, subjectColorOf } from "@/components/charts";
import { ComingUp, DayDetails, MonthCalendar, WeekStrip } from "@/components/agenda";
import { Countdown, Delta, ObservationCard, ReadinessPanel } from "@/components/domain";
import { ThemeButton } from "@/components/shell";
import { Badge, Callout, Card, CardHeader, cn, EmptyState, LinkButton, ProgressRing } from "@/components/ui";
import { explainChange, recommend, scoreAnalysis, shortTitle, topLossSources } from "@/domain/analysis";
import { TASK_TYPE_META } from "@/domain/catalog";
import { chapterPerformance } from "@/domain/planner";
import { describeRule } from "@/domain/scoring";
import { lastSevenDays, monthOf, studyStreak } from "@/domain/agenda";
import { allFinalized, upcomingExams } from "@/domain/selectors";
import type { Exam } from "@/domain/types";
import { addDays, daysBetween, fmtNum, formatDate, formatRelativeDay, pct, relativeDayInline, fmtPct1 } from "@/domain/util";
import { useFamily, useObservations, usePrimaryTarget, useReadiness, useToday } from "@/lib/hooks";
import { useStore } from "@/store/store";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default function DashboardPage() {
  const d = useToday();
  const { exams, tasks, analyses, notebook, settings, planChanges } = useStore(
    useShallow((s) => ({ exams: s.exams, tasks: s.tasks, analyses: s.analyses, notebook: s.notebook, settings: s.settings, planChanges: s.planChanges })),
  );
  const target = usePrimaryTarget();
  const family = useFamily(target?.id);
  const observations = useObservations(target?.id);
  const readiness = useReadiness(target);
  const finalized = useMemo(() => allFinalized({ analyses }), [analyses]);
  const latest = finalized[finalized.length - 1];
  const drafts = analyses.filter((a) => !a.finalizedAt);

  // One selected day drives the week strip, the mini calendar and the day's to-do list.
  const [selected, setSelected] = useState(d);
  const [stripStart, setStripStart] = useState(d);
  const [month, setMonth] = useState(monthOf(d));
  const select = (x: string) => {
    setSelected(x);
    if (x < stripStart || x > addDays(stripStart, 6)) setStripStart(x);
    if (monthOf(x) !== month) setMonth(monthOf(x));
  };

  if (!exams.length) return <NewUser name={settings.studentName} />;

  const daysLeft = target ? daysBetween(d, target.date) : null;
  const finalWeek = daysLeft !== null && daysLeft >= 0 && daysLeft <= 7;
  const latestChange = planChanges.find((c) => c.examId === target?.id);
  const dueMistakes = notebook.filter((n) => n.mastery !== "mastered" && n.nextRetryAt && n.nextRetryAt <= d).length;
  const overdue = tasks.filter((t) => t.dueDate < d && t.status === "pending").length;

  return (
    <div className="space-y-5 animate-in">
      {/* Large-title header, Student OS style */}
      <div className="flex items-end justify-between gap-3 px-1">
        <div className="min-w-0">
          <p className="eyebrow">{formatDate(d, { weekday: "long", day: "numeric", month: "long" })}</p>
          <h1 className="text-[38px] leading-[44px] font-black tracking-[-0.4px]">Today</h1>
          <p className="mt-0.5 text-[15px] text-fg-3">{greeting()}{settings.studentName ? `, ${settings.studentName}` : ""}.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2 pb-1">
          <ThemeButton />
          <Link href="/analyzer/new" aria-label="Analyze an exam" title="Analyze an exam" className="grid size-10 place-items-center rounded-full bg-surface text-accent lg:hidden"><ScanSearch className="size-[18px]" aria-hidden /></Link>
          <Link href="/exams/new" aria-label="Create an exam" title="Create an exam" className="grid size-10 place-items-center rounded-full bg-accent text-white"><Plus className="size-5" aria-hidden /></Link>
        </div>
      </div>

      <SummaryTiles target={target} />

      {(overdue > 0 || dueMistakes > 0) && (
        <div className="grid gap-2 sm:grid-cols-2">
          {overdue > 0 && (
            <Link href="/todo" className="flex min-h-12 items-center gap-2.5 rounded-2xl bg-warn-soft px-4 text-[15px] font-bold text-warn">
              <TriangleAlert className="size-[18px] shrink-0" aria-hidden />
              <span className="flex-1">{overdue} task{overdue === 1 ? "" : "s"} overdue</span>
              <span className="text-sm">Sort out →</span>
            </Link>
          )}
          {dueMistakes > 0 && (
            <Link href="/notebook?filter=due" className="flex min-h-12 items-center gap-2.5 rounded-2xl bg-surface px-4 text-[15px] font-bold">
              <NotebookPen className="size-[18px] shrink-0 text-accent" aria-hidden />
              <span className="flex-1">{dueMistakes} mistake{dueMistakes === 1 ? "" : "s"} due for a retry</span>
              <span className="text-sm text-accent-text">Retry →</span>
            </Link>
          )}
        </div>
      )}
      {finalWeek && target && (
        <Callout tone="warn" icon={Flame} title={`Final prep mode: ${target.name} is ${daysLeft === 0 ? "today" : `in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`}`}
          action={<LinkButton href={`/pilot/${target.id}`} size="sm" variant="secondary">Final-week plan</LinkButton>}>
          Your plan now favours weak areas, high-yield revision, recent mistakes and timed practice. No new low-priority topics.
        </Callout>
      )}
      {drafts.length > 0 && (
        <Callout tone="accent" icon={ScanSearch} title={`You have ${drafts.length} unfinished analysis${drafts.length === 1 ? "" : "es"}`}
          action={<LinkButton href={`/analyzer/${drafts[0].id}`} size="sm" variant="secondary" iconRight={ArrowRight}>Resume</LinkButton>}>
          “{drafts[0].title}” is saved as a draft at the {drafts[0].stage} step.
        </Callout>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* PRIMARY: the week and the selected day's to-do list */}
        <div className="min-w-0 space-y-5">
          <section aria-label="Your week" className="space-y-2">
            <div className="flex items-baseline justify-between px-1">
              <h2 className="text-[13px] font-extrabold tracking-wide text-fg-3 uppercase">Your week</h2>
              <div className="flex items-center gap-3">
                {selected !== d && <button onClick={() => select(d)} className="inline-flex min-h-9 items-center text-sm font-bold text-accent-text">Back to today</button>}
                <Link href="/todo" className="inline-flex min-h-9 items-center text-sm font-bold text-accent-text">All to-dos →</Link>
              </div>
            </div>
            <WeekStrip start={stripStart} onStart={setStripStart} selected={selected} onSelect={select} />
          </section>

          <DayDetails date={selected} heading={selected === d ? "Today's plan" : undefined} showLink />

          {latest ? <LatestAnalysis id={latest.id} /> : (
            <Card>
              <EmptyState icon={ScanSearch} title="Analyze your first test" action={<LinkButton href="/analyzer/new" variant="primary" icon={ScanSearch}>Analyze an exam</LinkButton>}>
                Upload a question paper and answer key (or enter them manually). You'll see where every mark went, and your plan will adapt to it.
              </EmptyState>
            </Card>
          )}

          <RecommendedActions targetId={target?.id} />
        </div>

        {/* SECONDARY */}
        <div className="min-w-0 space-y-5">
          <div className="card p-3">
            <MonthCalendar month={month} onMonth={setMonth} selected={selected} onSelect={select} compact />
            <Link href={`/calendar?date=${selected}`} className="mt-1 flex min-h-10 items-center justify-center gap-1.5 rounded-2xl text-sm font-bold text-accent-text hover:bg-surface-2">
              <CalendarDays className="size-4" aria-hidden />Open full calendar
            </Link>
          </div>
          <Card>
            <CardHeader icon={CalendarClock} title="Coming up" subtitle="Exams, mock tests and days off" />
            <ComingUp />
          </Card>
          {target && readiness && (
            <Card id="readiness" className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <Link href={`/exam/${target.id}`} className="text-sm font-semibold hover:underline">{target.name}</Link>
                <Countdown date={target.date} className="text-sm font-medium" />
              </div>
              <ReadinessPanel readiness={readiness} compact />
            </Card>
          )}
          <WeakestAreas targetId={target?.id} />
          <Card>
            <CardHeader icon={Sparkles} title="Recurring mistakes" subtitle="Patterns with enough evidence behind them" />
            <div className="space-y-2 px-5 pb-5">
              {observations.filter((o) => o.severity !== "positive").slice(0, 3).map((o) => <ObservationCard key={o.id} o={o} compact />)}
              {observations.filter((o) => o.severity !== "positive").length === 0 && (
                <p className="text-sm text-fg-3">{family.length ? "No recurring patterns yet — they appear once the same kind of mistake shows up repeatedly." : "Analyze a test to start detecting patterns."}</p>
              )}
              {observations.length > 3 && <Link href="/analytics" className="inline-flex min-h-9 items-center text-sm font-medium text-accent-text hover:underline">All {observations.length} observations →</Link>}
            </div>
          </Card>
          {latestChange && (
            <Card>
              <CardHeader icon={Compass} title="What changed in your plan" subtitle={`${latestChange.trigger} · ${formatRelativeDay(latestChange.at.slice(0, 10))}`} />
              <ul className="space-y-1.5 px-5 pb-5 text-[13px] text-fg-2">
                {latestChange.details.slice(0, 6).map((x) => (
                  <li key={x} className="flex gap-2">
                    <span className={x.startsWith("↑") ? "text-bad" : x.startsWith("↓") ? "text-good" : "text-accent-text"} aria-hidden>{x[0]}</span>
                    <span>{x.slice(2)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      <Trends />
      <RecentExams />
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** Four glanceable tiles: today's progress, study streak, next exam, this week's study time. */
function SummaryTiles({ target }: { target?: Exam }) {
  const d = useToday();
  const tasks = useStore((s) => s.tasks);
  const exams = useStore((s) => s.exams);
  const today = tasks.filter((t) => t.dueDate === d && t.status !== "skipped");
  const done = today.filter((t) => t.status === "done");
  const minsLeft = today.filter((t) => t.status !== "done").reduce((m, t) => m + t.durationMinutes, 0);
  const streak = useMemo(() => studyStreak(tasks, d), [tasks, d]);
  const studiedToday = done.length > 0;
  const week = useMemo(() => lastSevenDays(tasks, d), [tasks, d]);
  const weekDone = week.reduce((m, x) => m + x.done, 0);
  const peak = Math.max(60, ...week.map((x) => Math.max(x.done, x.planned)));
  const next = upcomingExams({ exams }, d).find((e) => !e.parentExamId) ?? upcomingExams({ exams }, d)[0] ?? target;
  const nextDays = next ? daysBetween(d, next.date) : null;
  const tile = "card flex min-h-[132px] flex-col p-4";
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div className={tile}>
        <span className="text-[13px] font-extrabold text-fg-3">Today</span>
        <div className="mt-auto flex items-center gap-3">
          <ProgressRing value={today.length ? done.length / today.length : 0} size={52} stroke={6} label="Today's progress" />
          <div className="min-w-0">
            <div className="text-[17px] leading-tight font-black">{done.length} of {today.length} done</div>
            <div className="text-xs font-semibold text-fg-3">{today.length ? (minsLeft ? `${minsLeft} min left` : "All finished") : "Nothing planned"}</div>
          </div>
        </div>
      </div>

      <div className={tile}>
        <span className="text-[13px] font-extrabold text-fg-3">Study streak</span>
        <div className="mt-auto flex items-center gap-3">
          <span className={cn("grid size-[52px] shrink-0 place-items-center rounded-full", streak ? "bg-warn-soft text-warn" : "bg-surface-2 text-fg-3")}>
            <Flame className="size-6" aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="text-[17px] leading-tight font-black tabular">{streak} day{streak === 1 ? "" : "s"}</div>
            <div className="text-xs font-semibold text-fg-3">{studiedToday ? "You studied today" : streak ? "Tick a task to keep it" : "Tick a task to start"}</div>
          </div>
        </div>
      </div>

      {next && nextDays !== null ? (
        <Link href={`/exam/${next.id}`} className={cn(tile, "bg-bad-soft transition hover:brightness-[0.98]")}>
          <span className="text-[13px] font-extrabold text-bad">Next exam</span>
          <div className="mt-auto">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[34px] leading-none font-black text-bad tabular">{nextDays}</span>
              <span className="text-[15px] font-bold text-bad">{nextDays === 1 ? "day" : "days"}</span>
            </div>
            <div className="mt-1 truncate text-[14px] font-bold text-fg">{next.name}</div>
            <div className="text-xs font-semibold text-fg-2">{formatDate(next.date, { weekday: "short", day: "numeric", month: "short" })}</div>
          </div>
        </Link>
      ) : (
        <Link href="/exams/new" className={tile}>
          <span className="text-[13px] font-extrabold text-fg-3">Next exam</span>
          <span className="mt-auto text-[15px] font-bold text-accent-text">Add an exam date →</span>
        </Link>
      )}

      <div className={tile}>
        <span className="text-[13px] font-extrabold text-fg-3">Last 7 days</span>
        <div className="mt-auto">
          <div className="flex h-10 items-end gap-1" role="img" aria-label={`Studied ${weekDone} minutes in the last 7 days: ${week.map((x) => `${formatDate(x.date, { weekday: "short" })} ${x.done} min`).join(", ")}`}>
            {week.map((x) => (
              <span key={x.date} className="relative flex-1 overflow-hidden rounded-[4px] bg-surface-3" style={{ height: `${Math.max(12, (Math.max(x.planned, x.done) / peak) * 100)}%` }}>
                <span className={cn("absolute inset-x-0 bottom-0 rounded-[4px]", x.date === d ? "bg-accent" : "bg-[var(--chart-1)]/70")} style={{ height: `${x.planned ? (x.done / Math.max(x.planned, x.done)) * 100 : 0}%` }} />
              </span>
            ))}
          </div>
          <div className="mt-1.5 text-[17px] leading-tight font-black tabular">{weekDone >= 60 ? `${Math.floor(weekDone / 60)}h ${weekDone % 60}m` : `${weekDone} min`}</div>
          <div className="text-xs font-semibold text-fg-3">studied</div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function NewUser({ name }: { name: string }) {
  return (
    <div className="animate-in">
      <h1 className="px-1 text-[32px] leading-[38px] font-black tracking-[-0.4px] sm:text-[38px] sm:leading-[44px]">Welcome{name ? `, ${name}` : ""}.</h1>
      <p className="mt-1 text-sm text-fg-3">Two ways to start. You can do both — they feed each other.</p>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card className="p-6">
          <Compass className="size-6 text-accent-text" aria-hidden />
          <h2 className="mt-3 text-lg font-semibold">Plan for an upcoming exam</h2>
          <p className="mt-1 text-sm text-fg-2">Add the exam date and syllabus. Student OS builds a daily plan with protected revision time.</p>
          <ol className="mt-4 space-y-1.5 text-sm text-fg-3">
            <li>1. Create the exam and import your syllabus (a PDF or photo works)</li>
            <li>2. Set your available study time</li>
            <li>3. Get today's tasks, each with a reason</li>
          </ol>
          <LinkButton href="/exams/new" variant="primary" className="mt-5" icon={Plus}>Create an exam</LinkButton>
        </Card>
        <Card className="p-6">
          <ScanSearch className="size-6 text-accent-text" aria-hidden />
          <h2 className="mt-3 text-lg font-semibold">Analyze a test you've taken</h2>
          <p className="mt-1 text-sm text-fg-2">Upload the paper and key, or enter answers manually. See where every mark went and why.</p>
          <ol className="mt-4 space-y-1.5 text-sm text-fg-3">
            <li>1. Import and verify questions + answer key</li>
            <li>2. Confirm the marking scheme and enter your answers</li>
            <li>3. Tag why you lost marks → get next actions</li>
          </ol>
          <LinkButton href="/analyzer/new" className="mt-5" icon={ScanSearch}>Analyze an exam</LinkButton>
        </Card>
      </div>
    </div>
  );
}

function LatestAnalysis({ id }: { id: string }) {
  const a = useStore((s) => s.analyses.find((x) => x.id === id))!;
  const finalized = useStore(useShallow((s) => allFinalized(s)));
  const cats = useStore((s) => s.settings.errorCategories);
  const s = useMemo(() => scoreAnalysis(a), [a]);
  const prevA = finalized[finalized.findIndex((x) => x.id === id) - 1];
  const change = useMemo(() => (prevA ? explainChange(s, scoreAnalysis(prevA)) : null), [s, prevA]);
  const top = useMemo(() => topLossSources(a, s, cats, 1)[0], [a, s, cats]);
  const undiagnosed = a.questions.filter((q) => s.byId[q.id]?.status === "wrong" && !a.responses[q.id]?.errorPrimary).length;
  const unresolved = useStore((st) => st.notebook.filter((n) => n.analysisId === id && n.mastery !== "mastered").length);
  return (
    <Card>
      <CardHeader icon={ScanSearch} title="Latest analysis" subtitle={`${a.title} · ${formatDate(a.takenOn)}`}
        action={<LinkButton href={`/analyzer/${a.id}/report`} size="sm" variant="ghost" iconRight={ArrowRight}>Full report</LinkButton>} />
      <div className="grid grid-cols-2 gap-px overflow-hidden border-y border-border bg-border sm:grid-cols-4">
        {[
          { l: "Score", v: `${fmtNum(s.score)} / ${fmtNum(s.maxScore)}`, d: change?.comparable && <Delta value={change.scoreDelta} /> },
          { l: "Score %", v: pct((s.percentage ?? 0) / 100, 1), d: change && <Delta value={change.percentageDelta} suffix=" pts" /> },
          { l: "Attempt accuracy", v: pct(s.accuracy), d: <span className="text-[11px] text-fg-3">{s.correct} of {s.attempted} attempted</span> },
          { l: "Negative marks", v: `−${fmtNum(s.negativeImpact)}`, d: change?.comparable && <Delta value={change.penaltyDelta} invert /> },
        ].map((x) => (
          <div key={x.l} className="bg-surface px-4 py-3">
            <div className="text-xs text-fg-3">{x.l}</div>
            <div className="mt-0.5 text-xl font-semibold tabular">{x.v}</div>
            <div className="mt-0.5 min-h-4">{x.d}</div>
          </div>
        ))}
      </div>
      <div className="space-y-3 px-5 py-4 text-sm">
        {change && <p className="text-fg-2">{change.narrative}</p>}
        <div className="flex flex-wrap gap-2">
          {top && (
            <Badge tone="bad" icon={TriangleAlert} className="max-w-full whitespace-normal">Biggest loss: {top.chapter} (−{fmtNum(top.forfeited)}{top.dominantError ? `, mostly ${top.dominantError.label.toLowerCase()}` : ""})</Badge>
          )}
          {undiagnosed > 0 && <Link href={`/analyzer/${a.id}/errors`} className="inline-flex min-h-9 items-center"><Badge tone="warn">{undiagnosed} mistakes not yet diagnosed →</Badge></Link>}
          {unresolved > 0 && <Link href="/notebook" className="inline-flex min-h-9 items-center"><Badge tone="accent" icon={NotebookPen}>{unresolved} in Error Notebook</Badge></Link>}
        </div>
      </div>
    </Card>
  );
}

function WeakestAreas({ targetId }: { targetId?: string }) {
  const family = useFamily(targetId);
  const cats = useStore((s) => s.settings.errorCategories);
  const rows = useMemo(() => {
    const perf = chapterPerformance(family, 3);
    const catLabel = new Map(cats.map((c) => [c.id, c.short]));
    return [...perf.entries()]
      .filter(([, p]) => p.forfeited > 0)
      .sort((a, b) => b[1].forfeited - a[1].forfeited)
      .slice(0, 5)
      .map(([k, p]) => {
        const [subject, chapter] = k.split("::");
        const topErr = Object.entries(p.errors).sort((a, b) => b[1] - a[1])[0];
        const title = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
        const chapterName = family.flatMap((a) => a.questions).find((q) => q.chapter.toLowerCase() === chapter)?.chapter ?? title(chapter);
        const subj = family.flatMap((a) => a.questions).find((q) => q.subject.toLowerCase() === subject)?.subject ?? title(subject);
        return { chapter: chapterName, subject: subj, p, topErr: topErr ? `${catLabel.get(topErr[0]) ?? topErr[0]} ×${topErr[1]}` : undefined };
      });
  }, [family, cats]);
  const subjects = [...new Set(rows.map((r) => r.subject))];
  return (
    <Card>
      <CardHeader icon={TriangleAlert} title="Weakest areas" subtitle={family.length ? `Marks lost, last ${Math.min(3, family.length)} test${family.length === 1 ? "" : "s"}` : undefined} />
      <div className="px-5 pb-5">
        {rows.length ? (
          <HBarList
            rows={rows.map((r) => ({
              key: r.chapter,
              label: <><span className="font-medium text-fg">{r.chapter}</span> <span className="text-fg-3">· {r.subject}</span></>,
              value: r.p.forfeited,
              color: subjectColorOf(r.subject, subjects),
              sub: `${r.p.accuracy === null ? "Nothing attempted" : `${pct(r.p.accuracy)} accuracy (${r.p.correct}/${r.p.attempted})`}${r.topErr ? ` · ${r.topErr}` : ""}`,
            }))}
            format={(v) => `−${fmtNum(v)}`}
          />
        ) : (
          <p className="text-sm text-fg-3">Weak areas appear after your first analyzed test.</p>
        )}
      </div>
    </Card>
  );
}

function RecommendedActions({ targetId }: { targetId?: string }) {
  const observations = useObservations(targetId);
  const cats = useStore((s) => s.settings.errorCategories);
  const tasks = useStore((s) => s.tasks);
  const recs = useMemo(() => recommend(observations, cats).slice(0, 5), [observations, cats]);
  if (!recs.length) return null;
  return (
    <Card>
      <CardHeader icon={Sparkles} title="Recommended next actions" subtitle="Generated from your exam evidence — already scheduled into your plan" />
      <ol className="divide-y divide-border border-t border-border">
        {recs.map((r, i) => {
          const scheduled = tasks.filter((t) => t.sourceRef?.observationId?.startsWith(r.id + "@")).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
          const nextT = scheduled.find((t) => t.status === "pending");
          const done = scheduled.filter((t) => t.status === "done").length;
          return (
            <li key={r.id} className="flex gap-3 px-5 py-3">
              <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-surface-3 text-[11px] font-semibold text-fg-2">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{r.title}</span>
                  <Badge tone="neutral">{TASK_TYPE_META[r.taskType].short} · {r.minutes}m{r.sessions > 1 ? ` × ${r.sessions}` : ""}</Badge>
                </div>
                <p className="mt-0.5 text-[13px] text-fg-2">{r.detail}</p>
                <p className="mt-1 text-xs text-fg-3">Evidence: {r.reason}</p>
              </div>
              <div className="shrink-0 text-right text-xs">
                {nextT ? <span className="text-fg-2">Scheduled {relativeDayInline(nextT.dueDate)}</span> : done ? <span className="text-good">Done</span> : <span className="text-fg-3">Queued</span>}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function Trends() {
  const analyses = useStore((s) => s.analyses);
  const finalized = useMemo(() => allFinalized({ analyses }), [analyses]);
  const data = useMemo(() => finalized.map((a) => {
    const s = scoreAnalysis(a);
    return { a, s, label: shortTitle(a.title) };
  }), [finalized]);
  if (data.length < 2) {
    return data.length === 1 ? (
      <Callout icon={BookOpen} title="Trends unlock after your second analyzed test">Score, accuracy and subject trends compare tests over time. Analyze your next mock to see them.</Callout>
    ) : null;
  }
  const subjects = [...new Set(data.flatMap((x) => x.a.questions.map((q) => q.subject)))];
  const last = data[data.length - 1];
  const first = data[0];
  const latestSubj = subjects.map((sub) => {
    const qs = last.a.questions.filter((q) => q.subject === sub);
    const sc = qs.reduce((m, q) => m + (last.s.byId[q.id]?.awarded ?? 0), 0);
    const mx = qs.reduce((m, q) => m + (last.s.byId[q.id]?.max ?? 0), 0);
    return { label: sub, value: mx ? Math.round((sc / mx) * 1000) / 10 : 0 };
  });
  const bestSub = [...latestSubj].sort((a, b) => b.value - a.value)[0];
  const worstSub = [...latestSubj].sort((a, b) => a.value - b.value)[0];
  const accDelta = (last.s.accuracy ?? 0) - (first.s.accuracy ?? 0);
  const attDelta = last.s.attemptRate - first.s.attemptRate;
  return (
    <div>
      <h2 className="mb-3 text-[15px] font-semibold">Trends</h2>
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Score trend" subtitle="Score as % of maximum"
          table={{ head: ["Test", "Score", "Max", "%"], rows: data.map((x) => [x.a.title, x.s.score, x.s.maxScore, `${fmtPct1(x.s.percentage)}`]) }}
          interpretation={`From ${fmtPct1(first.s.percentage)} to ${fmtPct1(last.s.percentage)} over ${data.length} tests. ${explainChange(last.s, data[data.length - 2].s).narrative}`}>
          <LineTrend data={data.map((x) => ({ label: x.label, pct: x.s.percentage }))} series={[{ key: "pct", name: "Score %", color: "var(--chart-1)" }]} yFormat={(v) => `${v}%`} />
        </ChartCard>
        <ChartCard title="Accuracy vs attempt rate" subtitle="Accuracy = correct ÷ attempted · Attempt rate = attempted ÷ questions"
          table={{ head: ["Test", "Accuracy", "Attempt rate"], rows: data.map((x) => [x.a.title, pct(x.s.accuracy), pct(x.s.attemptRate)]) }}
          interpretation={`Accuracy ${accDelta >= 0 ? "rose" : "fell"} ${Math.abs(Math.round(accDelta * 100))} pts and attempt rate ${attDelta >= 0 ? "rose" : "fell"} ${Math.abs(Math.round(attDelta * 100))} pts since ${first.label}. ${Math.abs(accDelta) > Math.abs(attDelta) ? "Changes are coming from accuracy more than volume." : "Changes are coming from how much you attempt more than accuracy."}`}>
          <LineTrend data={data.map((x) => ({ label: x.label, acc: Math.round((x.s.accuracy ?? 0) * 100), att: Math.round(x.s.attemptRate * 100) }))}
            series={[{ key: "acc", name: "Attempt accuracy", color: "var(--chart-1)" }, { key: "att", name: "Attempt rate", color: "var(--chart-2)", dashed: true }]} yFormat={(v) => `${v}%`} yDomain={[0, 100]} />
        </ChartCard>
        <ChartCard title="Subject comparison" subtitle={`${last.a.title} · score % by subject`}
          table={{ head: ["Subject", "Score %"], rows: latestSubj.map((x) => [x.label, `${x.value}%`]) }}
          interpretation={bestSub && worstSub && bestSub.label !== worstSub.label ? `${bestSub.label} is strongest (${bestSub.value}%); ${worstSub.label} trails at ${worstSub.value}% — that gap is where the plan leans.` : undefined}>
          <Bars data={latestSubj.map((x) => ({ label: x.label, value: x.value }))} series={[{ key: "value", name: "Score %", color: "var(--chart-1)" }]} yFormat={(v) => `${v}%`}
            colorBy={(row) => subjectColorOf(String(row.label), subjects)} />
        </ChartCard>
      </div>
    </div>
  );
}

function RecentExams() {
  const exams = useStore((s) => s.exams);
  const analyses = useStore((s) => s.analyses);
  const recent = [...analyses].sort((a, b) => b.takenOn.localeCompare(a.takenOn)).slice(0, 5);
  if (!recent.length) return null;
  return (
    <Card>
      <CardHeader icon={BookOpen} title="Recent exams" action={<LinkButton href="/analyzer" size="sm" variant="ghost" iconRight={ArrowRight}>All analyses</LinkButton>} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-y border-border text-left text-xs text-fg-3">
              <th className="px-5 py-2 font-medium">Exam</th><th className="px-3 py-2 font-medium">Date</th><th className="px-3 py-2 font-medium">Score</th>
              <th className="px-3 py-2 font-medium">Accuracy</th><th className="px-3 py-2 font-medium">Marking</th><th className="px-5 py-2"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="tabular">
            {recent.map((a) => {
              const s = scoreAnalysis(a);
              const exam = exams.find((e) => e.id === a.examId);
              return (
                <tr key={a.id} className="border-b border-border/70 last:border-0">
                  <td className="px-5 py-2.5"><Link href={`/analyzer/${a.id}`} className="font-medium hover:underline">{a.title}</Link>{exam?.parentExamId && <span className="ml-2 text-xs text-fg-3">mock</span>}</td>
                  <td className="px-3 py-2.5 text-fg-2">{formatDate(a.takenOn, { day: "numeric", month: "short" })}</td>
                  <td className="px-3 py-2.5">{a.finalizedAt ? `${fmtNum(s.score)}/${fmtNum(s.maxScore)}` : <Badge tone="warn">Draft · {a.stage}</Badge>}</td>
                  <td className="px-3 py-2.5 text-fg-2">{a.finalizedAt ? pct(s.accuracy) : "—"}</td>
                  <td className="px-3 py-2.5 text-xs text-fg-3">{a.sections[0] ? describeRule(a.sections[0].rule) : "—"}</td>
                  <td className="px-5 py-2.5 text-right"><Link href={`/analyzer/${a.id}`} className="text-xs font-medium text-accent-text hover:underline">{a.finalizedAt ? "Report" : "Continue"}</Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
