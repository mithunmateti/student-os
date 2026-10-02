"use client";
/** The syllabus as a to-do list: tick a topic off when studied, set how hard it is for you. Used by the plan and the To-do page. */
import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { CircleCheck, ListChecks } from "lucide-react";
import type { CoverageStatus, Difficulty, SyllabusTopic } from "@/domain/types";
import { formatRelativeDay, relativeDayInline } from "@/domain/util";
import { useToday } from "@/lib/hooks";
import { useStore } from "@/store/store";
import { DifficultyPicker } from "./domain";
import { Card, cn, EmptyState, LinkButton, ProgressRing, Select, subjectClass, toast } from "./ui";

/** Every syllabus topic as a to-do item: tick it off when done, set how hard it is for you. */
export function TopicTodo({ examId }: { examId: string }) {
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

