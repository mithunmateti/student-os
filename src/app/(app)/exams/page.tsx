"use client";
import { useMemo, useState } from "react";
import { BookOpen, Plus, ScanSearch } from "lucide-react";
import { ExamCard } from "@/components/exam-card";
import { Card, EmptyState, LinkButton, PageHeader, Segmented } from "@/components/ui";
import { useToday } from "@/lib/hooks";
import { useStore } from "@/store/store";

export default function ExamsPage() {
  const exams = useStore((s) => s.exams);
  const d = useToday();
  const [filter, setFilter] = useState<"all" | "upcoming" | "past">("all");
  const list = useMemo(() => {
    const visible = exams.filter((e) => !e.archived);
    const f = filter === "upcoming" ? visible.filter((e) => e.date >= d) : filter === "past" ? visible.filter((e) => e.date < d) : visible;
    return [...f].sort((a, b) => (filter === "past" ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)));
  }, [exams, filter, d]);
  const goals = list.filter((e) => !e.parentExamId);
  const tests = list.filter((e) => e.parentExamId);

  return (
    <div className="animate-in">
      <PageHeader title="My Exams" subtitle="Goal exams own a preparation plan. Mock and practice tests feed that plan when you analyze them."
        actions={<>
          <LinkButton href="/analyzer/new" icon={ScanSearch}>Analyze a test</LinkButton>
          <LinkButton href="/exams/new" variant="primary" icon={Plus}>Create exam</LinkButton>
        </>} />
      {exams.length === 0 ? (
        <Card><EmptyState icon={BookOpen} title="No exams yet" action={<LinkButton href="/exams/new" variant="primary" icon={Plus}>Create your first exam</LinkButton>}>
          Add the exam you're preparing for. You'll get a daily plan, and every mock you analyze will sharpen it.
        </EmptyState></Card>
      ) : (
        <>
          <Segmented label="Filter exams" value={filter} onChange={setFilter} options={[
            { value: "all", label: "All", count: exams.filter((e) => !e.archived).length },
            { value: "upcoming", label: "Upcoming", count: exams.filter((e) => !e.archived && e.date >= d).length },
            { value: "past", label: "Past", count: exams.filter((e) => !e.archived && e.date < d).length },
          ]} />
          {goals.length > 0 && (
            <section className="mt-6">
              <h2 className="section-title mb-3">Goal exams</h2>
              <div className="grid gap-4 md:grid-cols-2">{goals.map((e) => <ExamCard key={e.id} exam={e} />)}</div>
            </section>
          )}
          {tests.length > 0 && (
            <section className="mt-8">
              <h2 className="section-title mb-3">Mock & practice tests</h2>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{tests.map((e) => <ExamCard key={e.id} exam={e} />)}</div>
            </section>
          )}
          {!list.length && <p className="mt-8 text-sm text-fg-3">No {filter} exams.</p>}
        </>
      )}
    </div>
  );
}

