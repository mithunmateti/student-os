"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Compass, Plus } from "lucide-react";
import { Countdown } from "@/components/domain";
import { Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { targetExams } from "@/domain/selectors";
import { formatDate } from "@/domain/util";
import { useStore } from "@/store/store";

export default function PilotIndex() {
  const exams = useStore((s) => s.exams);
  const router = useRouter();
  const goals = targetExams({ exams }).sort((a, b) => a.date.localeCompare(b.date));
  const only = goals.length === 1 ? goals[0].id : null;
  useEffect(() => {
    if (only) router.replace(`/pilot/${only}`);
  }, [only, router]);
  if (only) return null;
  return (
    <div className="animate-in">
      <PageHeader title="Study plan" subtitle="Your preparation plans. Each goal exam has its own adaptive daily plan." actions={<LinkButton href="/exams/new" variant="primary" icon={Plus}>Create exam</LinkButton>} />
      {goals.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {goals.map((g) => (
            <Link key={g.id} href={`/pilot/${g.id}`} className="card block p-5 transition hover:border-border-strong">
              <div className="flex items-center justify-between"><span className="font-semibold">{g.name}</span><Countdown date={g.date} className="text-sm font-medium" /></div>
              <div className="mt-1 text-sm text-fg-3">{formatDate(g.date)} · {g.subjects.join(", ")}</div>
            </Link>
          ))}
        </div>
      ) : (
        <Card><EmptyState icon={Compass} title="No goal exam yet" action={<LinkButton href="/exams/new" variant="primary" icon={Plus}>Create a goal exam</LinkButton>}>
          Student OS turns an exam date, syllabus and your study time into a daily plan that adapts to every test you analyze.
        </EmptyState></Card>
      )}
    </div>
  );
}
