"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { CalendarDays, CircleCheck, Compass, Flame, History, ListChecks, ListOrdered, Plus, RefreshCw, Repeat, SlidersHorizontal, Sparkles } from "lucide-react";
import { Countdown, DifficultyPicker, TaskCard, TaskList, TASK_ICONS } from "@/components/domain";
import { NotFound } from "@/components/shell";
import { Badge, Button, Callout, Card, CardHeader, cn, Dialog, EmptyState, Field, Input, LinkButton, PageHeader, ProgressBar, ProgressRing, Select, subjectClass, Switch, Tabs, toast } from "@/components/ui";
import { TASK_TYPE_META } from "@/domain/catalog";
import { generatePlan } from "@/domain/planner";
import { capacityShare, planInput } from "@/domain/selectors";
import type { CoverageStatus, Difficulty, Priority, StudyTask, SyllabusTopic, TaskType } from "@/domain/types";
import { daysBetween, formatDate, formatRelativeDay, parseISODate, relativeDayInline, today } from "@/domain/util";
import { useExam, useToday } from "@/lib/hooks";
import { getData, useStore } from "@/store/store";
import { dropSearchParams, getSearchParams } from "@/lib/url";

type Tab = "plan" | "todo" | "priorities" | "revision" | "changes";
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function PilotPage() {
  const { examId } = useParams<{ examId: string }>();
  const exam = useExam(examId);
  const d = useToday();
  const [tab, setTab] = useState<Tab>("plan");
  const [created, setCreated] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [showDone, setShowDone] = useState(true);
  const tasks = useStore(useShallow((s) => s.tasks.filter((t) => t.examId === examId)));
  const planner = useStore((s) => s.settings.planner);
  const regenerate = useStore((s) => s.regeneratePlan);
  const topicsCount = useStore((s) => s.topics.filter((t) => t.examId === examId).length);
  const changes = useStore(useShallow((s) => s.planChanges.filter((c) => c.examId === examId)));
  const share = useStore((s) => capacityShare(s, examId, today()));

  useEffect(() => {
    const read = () => {
      const p = getSearchParams();
      if (p.get("created") === "1") setCreated(true);
      const t = p.get("tab");
      if (t === "todo" || t === "plan" || t === "priorities" || t === "revision" || t === "changes") setTab(t);
      // One-time hints: don't show "Your plan is ready" again after a reload.
      dropSearchParams("created");
    };
    read();
    // Links to another tab of the same plan (e.g. "?tab=todo") switch the tab without a reload.
    window.addEventListener("hashchange", read);
    window.addEventListener("popstate", read);
    return () => {
      window.removeEventListener("hashchange", read);
      window.removeEventListener("popstate", read);
    };
  }, []);

  const byDay = useMemo(() => {
    const m = new Map<string, StudyTask[]>();
    for (const t of tasks) {
      if (t.dueDate < d && t.status !== "pending") continue;
      const key = t.dueDate < d ? "overdue" : t.dueDate;
      (m.get(key) ?? m.set(key, []).get(key)!).push(t);
    }
    return [...m.entries()].sort((a, b) => (a[0] === "overdue" ? -1 : b[0] === "overdue" ? 1 : a[0].localeCompare(b[0])));
  }, [tasks, d]);

  if (!exam) return <NotFound what="Exam" back="/pilot" />;
  if (exam.parentExamId) {
    return (
      <Card className="mx-auto mt-6 max-w-lg"><EmptyState icon={Compass} title="Mock tests share their goal exam's plan" action={<LinkButton href={`/pilot/${exam.parentExamId}`} variant="primary">Open the goal exam's plan</LinkButton>}>
        {exam.name} is scheduled inside that plan, and analyzing it updates the plan's priorities.
      </EmptyState></Card>
    );
  }
  const daysLeft = daysBetween(d, exam.date);
  const finalPrep = daysLeft >= 0 && daysLeft <= 7;
  const upcomingDone = tasks.filter((t) => t.dueDate >= d);
  const completion = upcomingDone.length ? upcomingDone.filter((t) => t.status === "done").length / upcomingDone.length : 0;

  return (
    <div className="animate-in">
      <PageHeader eyebrow={<><Link href="/pilot" className="hover:underline">Exam Pilot</Link> · Preparation plan</>} title={exam.name}
        actions={<>
          <Button size="sm" icon={SlidersHorizontal} onClick={() => setSettingsOpen(true)}>Study time</Button>
          <Button size="sm" icon={Plus} onClick={() => setAddOpen(true)}>Add task</Button>
          <Button size="sm" variant="primary" icon={RefreshCw} onClick={() => { regenerate(exam.id); toast("Plan rebuilt. Finished tasks and your own tasks were kept."); }}>Rebuild plan</Button>
        </>}>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-fg-3">
          <span className="inline-flex items-center gap-1"><CalendarDays className="size-4" aria-hidden />{formatDate(exam.date)}</span>·
          <Countdown date={exam.date} className="font-medium" />
          {finalPrep && <Badge tone="warn" icon={Flame}>Final prep mode</Badge>}
          <span>· {topicsCount} topics</span>
          {share < 1 && <Badge tone="neutral" title="Study time is split across your goal exams by priority and how close they are">{Math.round(share * 100)}% of your study time</Badge>}
          <Link href={`/exam/${exam.id}`} className="inline-flex min-h-9 items-center font-medium text-accent-text hover:underline">Exam hub →</Link>
        </div>
      </PageHeader>

      {created && (
        <Callout tone="good" icon={CircleCheck} className="mb-6" title="Your plan is ready">
          Every syllabus topic is in your <button className="font-medium text-accent-text hover:underline" onClick={() => setTab("todo")}>topic to-do list</button>. Set how hard each one is for you, and the daily plan gives hard topics more time. Today's tasks are also on your dashboard. Tick tasks off as you go; finishing a first pass on a topic schedules its spaced revision automatically.
        </Callout>
      )}
      {finalPrep && (
        <Callout tone="warn" icon={Flame} className="mb-6" title="Final-week strategy">
          New low-priority topics are paused. Time goes to unresolved weak areas, high-yield revision, recent mistakes and timed practice, with a pre-exam final review.
        </Callout>
      )}

      <Tabs value={tab} onChange={setTab} className="mb-6" tabs={[
        { value: "plan", label: "Daily plan", icon: CalendarDays },
        { value: "todo", label: "Topic to-do list", icon: ListChecks, count: topicsCount },
        { value: "priorities", label: "Topic priorities", icon: ListOrdered },
        { value: "revision", label: "Revision", icon: Repeat },
        { value: "changes", label: "What changed", icon: History, count: changes.length },
      ]} />

      {tab === "plan" && (
        daysLeft < 0 ? (
          <Card><EmptyState icon={CalendarDays} title="This exam has passed" action={<LinkButton href={`/analyzer/new?exam=${exam.id}`} variant="primary">Analyze it</LinkButton>}>Analyze the paper to capture what happened, or create your next goal exam.</EmptyState></Card>
        ) : !topicsCount ? (
          <Card><EmptyState icon={CalendarDays} title="Add syllabus topics first" action={<LinkButton href={`/exam/${exam.id}`} variant="primary">Open exam hub</LinkButton>}>The planner schedules topics — add your syllabus in the exam hub.</EmptyState></Card>
        ) : (
          <div className="space-y-6">
            <div className="card flex flex-wrap items-center gap-4 px-[18px] py-3.5">
              <ProgressRing value={completion} label="Plan completion" />
              <div className="min-w-40 flex-1">
                <div className="text-[19px] font-bold">{upcomingDone.filter((t) => t.status === "done").length} of {upcomingDone.length} tasks done</div>
                <div className="text-sm text-fg-3">Next {planner.horizonDays} days of your plan</div>
              </div>
              <div className="w-full sm:w-auto"><Switch checked={showDone} onChange={setShowDone} label="Show finished" /></div>
            </div>
            {byDay.map(([day, list]) => {
              const visible = list.filter((t) => showDone || t.status !== "done");
              if (!visible.length) return null;
              const cap = day === "overdue" ? null : planner.blockedDates.includes(day) ? 0 : planner.minutesByWeekday[parseISODate(day).getDay()];
              const mins = list.filter((t) => t.status !== "skipped").reduce((m, t) => m + t.durationMinutes, 0);
              const done = list.filter((t) => t.status === "done").reduce((m, t) => m + t.durationMinutes, 0);
              return (
                <section key={day} aria-label={day === "overdue" ? "Overdue" : formatDate(day)}>
                  <div className="mb-2 flex items-baseline justify-between gap-3">
                    <h2 className={cn("pl-1 text-[17px] font-bold", day === "overdue" && "text-bad", day === d && "text-accent-text")}>
                      {day === "overdue" ? "Overdue" : formatRelativeDay(day, d)}
                      {day !== "overdue" && <span className="ml-2 font-normal text-fg-3">{formatDate(day, { weekday: "short", day: "numeric", month: "short" })}</span>}
                    </h2>
                    <span className="pr-1 text-xs text-fg-3 tabular">{done ? `${done}/` : ""}{mins} min{cap !== null ? ` of ${cap}` : ""}</span>
                  </div>
                  <TaskList>{visible.map((t) => <TaskCard key={t.id} task={t} />)}</TaskList>
                </section>
              );
            })}
            <p className="text-xs text-fg-3">Planning {planner.horizonDays} days ahead. The plan rolls forward each day and after every analysis; tasks you added or moved are never overwritten.</p>
          </div>
        )
      )}
      {tab === "todo" && <TopicTodo examId={exam.id} />}
      {tab === "priorities" && <Priorities examId={exam.id} />}
      {tab === "revision" && <RevisionTab examId={exam.id} />}
      {tab === "changes" && (
        <div className="space-y-3">
          {changes.length ? changes.map((c) => (
            <Card key={c.id} className="p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold"><Sparkles className="mr-1.5 inline size-4 text-accent-text" aria-hidden />{c.trigger}</h3>
                <span className="text-xs text-fg-3">{formatDate(c.at.slice(0, 10))}</span>
              </div>
              <p className="mt-1 text-sm text-fg-2">{c.summary}</p>
              <ul className="mt-2 space-y-1 text-[13px] text-fg-2">{c.details.map((x) => <li key={x}>{x}</li>)}</ul>
            </Card>
          )) : <Card><EmptyState icon={History} title="No adaptations yet">After you analyze a test, this log shows exactly how the plan changed and why.</EmptyState></Card>}
        </div>
      )}

      <PlannerSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} examId={exam.id} />
      <AddTaskDialog open={addOpen} onClose={() => setAddOpen(false)} examId={exam.id} />
    </div>
  );
}

/** Every syllabus topic as a to-do item: tick it off when done, set how hard it is for you. */
function TopicTodo({ examId }: { examId: string }) {
  const topics = useStore(useShallow((s) => s.topics.filter((t) => t.examId === examId)));
  const tasks = useStore(useShallow((s) => s.tasks.filter((t) => t.examId === examId && t.topicId && t.status === "pending")));
  const setDifficulty = useStore((s) => s.setTopicDifficulty);
  const setCoverage = useStore((s) => s.setCoverage);
  const regenerate = useStore((s) => s.regeneratePlan);
  const d = useToday();
  const [filter, setFilter] = useState<"open" | "all" | Difficulty>("open");
  if (!topics.length) {
    return <Card><EmptyState icon={ListChecks} title="No topics yet" action={<LinkButton href={`/exam/${examId}`} variant="primary">Add your syllabus</LinkButton>}>Import your syllabus in the exam hub and every topic appears here as a to-do item.</EmptyState></Card>;
  }
  const isDone = (t: SyllabusTopic) => t.coverage === "covered" || t.coverage === "revised";
  const next = new Map<string, string>();
  for (const t of [...tasks].sort((a, b) => a.dueDate.localeCompare(b.dueDate))) if (!next.has(t.topicId!)) next.set(t.topicId!, t.dueDate);
  const shown = topics.filter((t) => (filter === "open" ? !isDone(t) : filter === "all" ? true : t.difficulty === filter));
  const bySubject = new Map<string, SyllabusTopic[]>();
  for (const t of shown) (bySubject.get(t.subject) ?? bySubject.set(t.subject, []).get(t.subject)!).push(t);
  const doneCount = topics.filter(isDone).length;
  const count = (k: Difficulty) => topics.filter((t) => t.difficulty === k).length;
  const toggle = (t: SyllabusTopic) => {
    const to: CoverageStatus = isDone(t) ? "not_started" : "covered";
    setCoverage(t.id, to);
    regenerate(examId);
    toast(to === "covered" ? `“${t.topic}” done. Revision checkpoints scheduled.` : `“${t.topic}” is back on your to-do list`);
  };
  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-4 px-[18px] py-3.5">
        <ProgressRing value={doneCount / topics.length} label="Topics done" />
        <div className="min-w-40 flex-1">
          <div className="text-[19px] font-bold">{doneCount} of {topics.length} topics done</div>
          <div className="text-sm text-fg-3">{topics.length - doneCount} to go · tick a topic when you&apos;ve studied it</div>
        </div>
        <Select aria-label="Show" className="w-full sm:w-48" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
          <option value="open">Still to do ({topics.length - doneCount})</option>
          <option value="all">All topics ({topics.length})</option>
          <option value="hard">Hard ({count("hard")})</option>
          <option value="medium">Medium ({count("medium")})</option>
          <option value="easy">Easy ({count("easy")})</option>
        </Select>
      </div>
      <p className="px-1 text-[13px] text-fg-3">Set how hard each topic is for you. Hard topics get 90 minutes of first study and rank higher; easy ones get 45. The daily plan updates as soon as you change it.</p>
      {[...bySubject.entries()].map(([subject, list]) => (
        <section key={subject} className={cn("space-y-2", subjectClass(subject))}>
          <div className="flex items-baseline justify-between px-1">
            <h2 className="section-title !pl-0">{subject}</h2>
            <span className="text-[13px] font-semibold text-fg-3">{list.filter(isDone).length}/{list.length} done</span>
          </div>
          <ul className="overflow-hidden rounded-[20px] bg-surface [&>li+li]:border-t [&>li+li]:border-border">
            {list.map((t) => {
              const done = isDone(t);
              const due = next.get(t.id);
              return (
                <li key={t.id} className="flex flex-wrap items-center gap-x-2 gap-y-1.5 py-1.5 pr-4 pl-1.5">
                  <button onClick={() => toggle(t)} aria-pressed={done} aria-label={done ? `Mark “${t.topic}” as not done` : `Mark “${t.topic}” as done`}
                    className="grid size-11 shrink-0 place-items-center">
                    <svg viewBox="0 0 26 26" className="size-[26px]" aria-hidden>
                      {done ? (<><circle cx="13" cy="13" r="12" fill="var(--dot)" /><path d="m8 13.4 3.3 3.2L18 9.8" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></>)
                        : <circle cx="13" cy="13" r="11.5" fill="none" stroke="var(--border-strong)" strokeWidth="1.8" />}
                    </svg>
                  </button>
                  <div className="min-w-40 flex-1 py-1">
                    <div className={cn("text-[16px] font-semibold", done && "text-faint line-through")}>{t.topic}</div>
                    <div className="text-xs text-fg-3">
                      {t.chapter !== t.topic && <>{t.chapter} · </>}
                      {done ? "Done" : due ? <span className={cn(due < d && "font-medium text-bad")}>Next session {due < d ? "overdue" : /^(Today|Tomorrow)$/.test(formatRelativeDay(due, d)) ? relativeDayInline(due, d) : `on ${formatRelativeDay(due, d)}`}</span> : t.coverage === "learning" ? "In progress" : "Not scheduled yet: comes up as days free up"}
                    </div>
                  </div>
                  <div className="w-full pl-[52px] sm:w-auto sm:pl-0"><DifficultyPicker label={`Difficulty of ${t.topic}`} value={t.difficulty} onChange={(v) => { setDifficulty(t.id, v); toast(`“${t.topic}” set to ${v}. Plan updated.`); }} /></div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {!shown.length && <Card><EmptyState icon={CircleCheck} title={filter === "open" ? "Everything is done" : "No topics match"}>{filter === "open" ? "Every topic is ticked off. Your plan now focuses on revision and practice." : "Try another filter."}</EmptyState></Card>}
    </div>
  );
}

function Priorities({ examId }: { examId: string }) {
  const data = useStore(useShallow((s) => ({ topics: s.topics, analyses: s.analyses, tasks: s.tasks, exams: s.exams, settings: s.settings, revisions: s.revisions, notebook: s.notebook })));
  const d = useToday();
  const [open, setOpen] = useState<string | null>(null);
  const plan = useMemo(() => {
    const input = planInput(getData(), examId, d);
    return input ? generatePlan(input) : null;
  }, [data, examId, d]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!plan) return null;
  const covLabel = { not_started: "Not started", learning: "Learning", covered: "Covered", revised: "Revised" };
  return (
    <Card>
      <CardHeader title="Topic priority ranking" subtitle="Every score is a sum of visible signals — weightage, coverage, difficulty, marks lost in tests, recurring patterns and spacing." />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-y border-border text-left text-xs text-fg-3">
            <th className="px-5 py-2 font-medium">#</th><th className="px-3 py-2 font-medium">Topic</th><th className="px-3 py-2 font-medium">Coverage</th>
            <th className="px-3 py-2 font-medium">Top reasons</th><th className="px-5 py-2 text-right font-medium">Score</th>
          </tr></thead>
          <tbody>
            {plan.priorities.slice(0, 40).map((p, i) => (
              <tr key={p.topic.id} className="border-b border-border/70 align-top">
                <td className="px-5 py-2.5 text-fg-3 tabular">{i + 1}</td>
                <td className="px-3 py-2.5">
                  <div className="font-medium">{p.topic.topic}</div>
                  <div className="text-xs text-fg-3">{p.topic.subject} · {p.topic.chapter}</div>
                </td>
                <td className="px-3 py-2.5 text-xs text-fg-2">{covLabel[p.topic.coverage]}</td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {p.signals.filter((s) => s.points > 0).sort((a, b) => b.points - a.points).slice(0, open === p.topic.id ? 10 : 2).map((s) => (
                      <Badge key={s.label} tone={/lost|recurring|skipping|low recent|top mark/i.test(s.label) ? "bad" : "neutral"}>{s.label} <span className="text-fg-3">+{s.points}</span></Badge>
                    ))}
                    {p.signals.filter((s) => s.points < 0).slice(0, open === p.topic.id ? 10 : 0).map((s) => <Badge key={s.label} tone="good">{s.label} {s.points}</Badge>)}
                    {p.signals.length > 2 && <button onClick={() => setOpen(open === p.topic.id ? null : p.topic.id)} className="text-xs font-medium text-accent-text hover:underline">{open === p.topic.id ? "less" : "all signals"}</button>}
                  </div>
                </td>
                <td className="px-5 py-2.5 text-right font-semibold tabular">{p.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function RevisionTab({ examId }: { examId: string }) {
  const revisions = useStore(useShallow((s) => s.revisions.filter((r) => r.examId === examId)));
  const cfg = useStore((s) => s.settings.revision);
  const d = useToday();
  const upcoming = [...revisions].filter((r) => r.status === "pending").sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const done = revisions.filter((r) => r.status === "done").length;
  return (
    <div className="space-y-4">
      <Callout icon={Repeat} title={`Checkpoints at ${cfg.offsets.map((o) => (o === 0 ? "same day" : `+${o}d`)).join(", ")}${cfg.preExamDays ? `, plus a final review ${cfg.preExamDays} days before the exam` : ""}`}
        action={<LinkButton href="/settings#revision" size="sm">Change schedule</LinkButton>}>
        Checkpoints are created when you finish a first pass on a topic (or mark it learning/covered), and when you add a mistake to revision.
      </Callout>
      <Card>
        <CardHeader title="Upcoming checkpoints" subtitle={`${done} done · ${upcoming.length} pending`} />
        {upcoming.length ? (
          <ul className="divide-y divide-border border-t border-border">
            {upcoming.slice(0, 60).map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                <Repeat className="size-4 text-fg-3" aria-hidden />
                <span className="flex-1">{r.label}</span>
                <Badge tone="neutral">{r.checkpoint}</Badge>
                <span className={cn("w-24 text-right text-xs tabular", r.dueAt < d ? "font-medium text-bad" : "text-fg-3")}>{r.dueAt < d ? "Overdue" : formatRelativeDay(r.dueAt, d)}</span>
              </li>
            ))}
          </ul>
        ) : <EmptyState icon={Repeat} title="No checkpoints pending">They'll appear as you complete study tasks.</EmptyState>}
      </Card>
    </div>
  );
}

function PlannerSettingsDialog({ open, onClose, examId }: { open: boolean; onClose: () => void; examId: string }) {
  const planner = useStore((s) => s.settings.planner);
  const update = useStore((s) => s.updateSettings);
  const regen = useStore((s) => s.regeneratePlan);
  const [p, setP] = useState(planner);
  const [blocked, setBlocked] = useState("");
  useEffect(() => { if (open) setP(planner); }, [open, planner]);
  const save = () => {
    update({ planner: p });
    regen(examId);
    toast("Study time saved and plan regenerated");
    onClose();
  };
  return (
    <Dialog open={open} onClose={onClose} size="lg" title="Study time & planning" description="Constraints from school, coaching and life. The plan respects these limits."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save & regenerate</Button></>}>
      <div className="space-y-5">
        <div>
          <div className="label">Minutes available per day</div>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
            {WEEKDAYS.map((w, i) => (
              <Field key={w} label={w} htmlFor={`pm-${i}`}>
                <Input id={`pm-${i}`} type="number" min={0} step={15} value={p.minutesByWeekday[i]} onChange={(e) => setP({ ...p, minutesByWeekday: p.minutesByWeekday.map((m, j) => (j === i ? Math.max(0, Number(e.target.value)) : m)) })} />
              </Field>
            ))}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Full mock every (days)" htmlFor="mock" hint="0 turns off automatic mocks."><Input id="mock" type="number" min={0} value={p.mockEveryDays} onChange={(e) => setP({ ...p, mockEveryDays: Math.max(0, Number(e.target.value)) })} /></Field>
          <Field label="Protected revision share" htmlFor="rs" hint={`${Math.round(p.revisionShare * 100)}% of each day`}><Input id="rs" type="range" min={0.1} max={0.6} step={0.05} value={p.revisionShare} onChange={(e) => setP({ ...p, revisionShare: Number(e.target.value) })} /></Field>
          <Field label="Plan ahead (days)" htmlFor="hz"><Input id="hz" type="number" min={3} max={45} value={p.horizonDays} onChange={(e) => setP({ ...p, horizonDays: Math.min(45, Math.max(3, Number(e.target.value))) })} /></Field>
        </div>
        <div>
          <div className="label">Blocked dates (no study)</div>
          <div className="flex flex-wrap items-center gap-2">
            {p.blockedDates.map((b) => (
              <button key={b} onClick={() => setP({ ...p, blockedDates: p.blockedDates.filter((x) => x !== b) })} className="rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-xs hover:border-bad" aria-label={`Remove blocked date ${b}`}>{formatDate(b)} ×</button>
            ))}
            <Input type="date" className="h-8 w-40 py-1" value={blocked} onChange={(e) => setBlocked(e.target.value)} aria-label="Add blocked date" />
            <Button size="sm" onClick={() => { if (blocked && !p.blockedDates.includes(blocked)) setP({ ...p, blockedDates: [...p.blockedDates, blocked].sort() }); setBlocked(""); }}>Block</Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

function AddTaskDialog({ open, onClose, examId }: { open: boolean; onClose: () => void; examId: string }) {
  const add = useStore((s) => s.addTask);
  const topics = useStore(useShallow((s) => s.topics.filter((t) => t.examId === examId)));
  const d = useToday();
  const [f, setF] = useState({ title: "", type: "practice" as TaskType, dueDate: d, durationMinutes: 30, priority: "medium" as Priority, topicId: "" });
  const submit = () => {
    if (!f.title.trim()) return toast("Give the task a title", "bad");
    const t = topics.find((x) => x.id === f.topicId);
    add({ examId, title: f.title.trim(), type: f.type, dueDate: f.dueDate, durationMinutes: f.durationMinutes, priority: f.priority, topicId: t?.id, subject: t?.subject, chapter: t?.chapter, topic: t?.topic, reason: "Added by you." });
    toast("Task added");
    setF({ ...f, title: "" });
    onClose();
  };
  const Icon = TASK_ICONS[f.type];
  return (
    <Dialog open={open} onClose={onClose} title="Add a task" description="Your own tasks are never removed when the plan regenerates."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>Add task</Button></>}>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Field label="Title" htmlFor="t-title" className="sm:col-span-2"><Input id="t-title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Coaching DPP — Kinematics" autoFocus /></Field>
        <Field label={<span className="inline-flex items-center gap-1"><Icon className="size-3.5" />Type</span>} htmlFor="t-type">
          <Select id="t-type" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as TaskType })}>{Object.entries(TASK_TYPE_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>
        </Field>
        <Field label="Date" htmlFor="t-date"><Input id="t-date" type="date" min={d} value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></Field>
        <Field label="Duration (min)" htmlFor="t-dur"><Input id="t-dur" type="number" min={5} step={5} value={f.durationMinutes} onChange={(e) => setF({ ...f, durationMinutes: Number(e.target.value) })} /></Field>
        <Field label="Priority" htmlFor="t-prio"><Select id="t-prio" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value as Priority })}><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></Select></Field>
        <Field label="Topic (optional)" htmlFor="t-topic" className="sm:col-span-2">
          <Select id="t-topic" value={f.topicId} onChange={(e) => setF({ ...f, topicId: e.target.value })}>
            <option value="">—</option>
            {topics.map((t) => <option key={t.id} value={t.id}>{t.subject} · {t.chapter} › {t.topic}</option>)}
          </Select>
        </Field>
      </form>
    </Dialog>
  );
}

