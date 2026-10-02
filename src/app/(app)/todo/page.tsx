"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { BookOpen, ChevronDown, CircleCheck, ListChecks, Search, TriangleAlert } from "lucide-react";
import { AddTaskInline, useTaskHome } from "@/components/agenda";
import { TaskCard, TaskList } from "@/components/domain";
import { TopicTodo } from "@/components/topic-todo";
import { Button, Card, cn, EmptyState, LinkButton, PageHeader, ProgressRing, Segmented, Select, Tabs, toast } from "@/components/ui";
import { BUCKET_LABEL, todoBuckets, type TodoBucket } from "@/domain/agenda";
import { targetExams } from "@/domain/selectors";
import type { StudyTask } from "@/domain/types";
import { formatDate } from "@/domain/util";
import { useToday } from "@/lib/hooks";
import { getSearchParams } from "@/lib/url";
import { useStore } from "@/store/store";

type Show = "all" | "mine" | "plan";
type Tab = "tasks" | "topics";

export default function TodoPage() {
  const [tab, setTab] = useState<Tab>("tasks");
  const topicsCount = useStore((s) => s.topics.filter((t) => t.coverage !== "covered" && t.coverage !== "revised").length);
  const openTasks = useStore((s) => s.tasks.filter((t) => t.status === "pending").length);

  useEffect(() => {
    const t = getSearchParams().get("tab");
    if (t === "topics" || t === "tasks") setTab(t);
  }, []);

  return (
    <div className="animate-in">
      <PageHeader eyebrow={<span className="inline-flex items-center gap-1.5"><ListChecks className="size-4" aria-hidden />To-do</span>} title="Everything to do"
        subtitle="Your own tasks and your study plan in one list. Tick something off here and it's ticked off on the dashboard, the calendar and the plan too." />
      <Tabs value={tab} onChange={setTab} className="mb-5" tabs={[
        { value: "tasks", label: "Tasks", icon: ListChecks, count: openTasks },
        { value: "topics", label: "Syllabus topics", icon: BookOpen, count: topicsCount },
      ]} />
      {tab === "tasks" ? <TaskTodo /> : <TopicsTab />}
    </div>
  );
}

function TaskTodo() {
  const d = useToday();
  const tasks = useStore((s) => s.tasks);
  const moveTask = useStore((s) => s.moveTask);
  const home = useTaskHome();
  const [show, setShow] = useState<Show>("all");
  const [subject, setSubject] = useState("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Record<TodoBucket, boolean>>({ overdue: true, today: true, tomorrow: true, week: true, later: false, done: false });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks.filter((t) =>
      (show === "all" || (show === "mine" ? t.source === "user" : t.source !== "user")) &&
      (!subject || (subject === "General" ? !t.subject : t.subject === subject)) &&
      (!q || [t.title, t.subject, t.chapter, t.topic].some((x) => x?.toLowerCase().includes(q))));
  }, [tasks, show, subject, query]);
  const buckets = useMemo(() => todoBuckets(filtered, d), [filtered, d]);
  const todayAll = tasks.filter((t) => t.dueDate === d && t.status !== "skipped");
  const todayDone = todayAll.filter((t) => t.status === "done").length;
  const subjects = [...new Set(tasks.map((t) => t.subject).filter(Boolean) as string[])];
  const anyTasks = Object.values(buckets).some((b) => b.length);

  const moveAllOverdue = () => {
    const moved = buckets.overdue.map((t) => ({ id: t.id, from: t.dueDate }));
    for (const m of moved) moveTask(m.id, d);
    toast(`${moved.length} overdue task${moved.length === 1 ? "" : "s"} moved to today`, "good", { label: "Undo", onClick: () => moved.forEach((m) => moveTask(m.id, m.from)) });
  };

  return (
    <div className="space-y-5">
      <div className="card flex flex-wrap items-center gap-4 px-[18px] py-3.5">
        <ProgressRing value={todayAll.length ? todayDone / todayAll.length : 0} label="Today's progress" />
        <div className="min-w-40 flex-1">
          <div className="text-[19px] font-bold">{todayDone} of {todayAll.length} done today</div>
          <div className="text-sm text-fg-3">
            {buckets.overdue.length ? <span className="font-semibold text-bad">{buckets.overdue.length} overdue · </span> : null}
            {buckets.tomorrow.length} tomorrow · {buckets.week.length} later this week
          </div>
        </div>
        <LinkButton href="/calendar" size="sm" variant="soft">Open calendar</LinkButton>
      </div>

      <AddTaskInline date={d} pickDate idPrefix="todo-add" />

      <div className="flex flex-wrap items-center gap-2">
        <Segmented label="Show" value={show} onChange={setShow} options={[{ value: "all", label: "All" }, { value: "mine", label: "Added by me" }, { value: "plan", label: "From my plan" }]} />
        {subjects.length > 0 && (
          <Select aria-label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} className="!h-9 !min-h-9 w-auto !py-1 !text-[13px]">
            <option value="">All subjects</option>
            {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
            <option value="General">General (no subject)</option>
          </Select>
        )}
        <label className="relative min-w-44 flex-1">
          <span className="sr-only">Search tasks</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-3" aria-hidden />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tasks" className="field !h-9 !min-h-9 !py-1 pl-9 !text-[14px]" />
        </label>
      </div>

      {!anyTasks && (
        <Card><EmptyState icon={CircleCheck} title={tasks.length ? "Nothing matches" : "No tasks yet"}>
          {tasks.length ? "Try another filter." : "Add a task above. Tasks from your study plan show up here too."}
        </EmptyState></Card>
      )}

      {(["overdue", "today", "tomorrow", "week", "later", "done"] as const).map((b) => {
        const list = buckets[b];
        if (!list.length) return null;
        const collapsible = b === "later" || b === "done";
        const isOpen = open[b];
        const shown = b === "done" ? list.slice(0, 30) : list;
        const mins = list.reduce((m, t) => m + t.durationMinutes, 0);
        return (
          <section key={b} aria-labelledby={`todo-${b}`} className="space-y-2">
            <div className="flex items-center justify-between gap-2 px-1">
              <h2 id={`todo-${b}`} className={cn("flex items-center gap-2 text-[19px] font-black", b === "overdue" && "text-bad", b === "today" && "text-accent-text")}>
                {b === "overdue" && <TriangleAlert className="size-[18px]" aria-hidden />}
                {BUCKET_LABEL[b]}
                <span className="text-[13px] font-bold text-fg-3 tabular">{list.length}{b !== "done" ? ` · ${mins} min` : ""}</span>
              </h2>
              {b === "overdue" && <Button size="xs" variant="soft" onClick={moveAllOverdue}>Move all to today</Button>}
              {collapsible && (
                <button onClick={() => setOpen((o) => ({ ...o, [b]: !o[b] }))} aria-expanded={isOpen} className="inline-flex min-h-9 items-center gap-1 text-sm font-bold text-accent-text">
                  {isOpen ? "Hide" : "Show"} <ChevronDown className={cn("size-4 transition", isOpen && "rotate-180")} aria-hidden />
                </button>
              )}
            </div>
            {(!collapsible || isOpen) && (
              <TaskGroups tasks={shown} bucket={b} examName={home.multi ? home.examName : undefined} />
            )}
          </section>
        );
      })}
    </div>
  );
}

/** Today/tomorrow are one list; longer buckets are split by day so dates stay readable. */
function TaskGroups({ tasks, bucket, examName }: { tasks: StudyTask[]; bucket: TodoBucket; examName?: (id: string) => string | undefined }) {
  const byDay = bucket === "week" || bucket === "later" || bucket === "overdue";
  if (!byDay) {
    return <TaskList>{tasks.map((t) => <TaskCard key={t.id} task={t} showDate={bucket === "done"} examLabel={examName?.(t.examId)} />)}</TaskList>;
  }
  const days = new Map<string, StudyTask[]>();
  for (const t of tasks) (days.get(t.dueDate) ?? days.set(t.dueDate, []).get(t.dueDate)!).push(t);
  return (
    <div className="space-y-3">
      {[...days.entries()].map(([day, list]) => (
        <div key={day}>
          <Link href={`/calendar?date=${day}`} className="mb-1 inline-flex min-h-8 items-center px-2 text-[13px] font-bold text-fg-3 hover:text-accent-text">
            {formatDate(day, { weekday: "long", day: "numeric", month: "short" })}
          </Link>
          <TaskList>{list.map((t) => <TaskCard key={t.id} task={t} examLabel={examName?.(t.examId)} />)}</TaskList>
        </div>
      ))}
    </div>
  );
}

function TopicsTab() {
  const goals = useStore(useShallow((s) => targetExams(s).sort((a, b) => a.date.localeCompare(b.date))));
  const [examId, setExamId] = useState(goals[0]?.id ?? "");
  if (!goals.length) {
    return <Card><EmptyState icon={BookOpen} title="No goal exam yet" action={<LinkButton href="/exams/new" variant="primary">Create an exam</LinkButton>}>Create an exam and import its syllabus: every topic shows up here as a to-do item.</EmptyState></Card>;
  }
  const current = goals.find((g) => g.id === examId) ?? goals[0];
  return (
    <div className="space-y-4">
      {goals.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Exam">
          {goals.map((g) => (
            <button key={g.id} role="radio" aria-checked={g.id === current.id} onClick={() => setExamId(g.id)}
              className={cn("h-9 rounded-full px-4 text-[14px] font-bold", g.id === current.id ? "bg-accent text-white" : "bg-surface text-fg-2")}>
              {g.name}
            </button>
          ))}
        </div>
      )}
      <TopicTodo examId={current.id} />
    </div>
  );
}
