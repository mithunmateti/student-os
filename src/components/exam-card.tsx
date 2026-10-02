"use client";
import Link from "next/link";
import { useShallow } from "zustand/react/shallow";
import { CalendarDays, Clock, Compass, ScanSearch, Target } from "lucide-react";
import { Countdown, ExamTypeBadge } from "@/components/domain";
import { Badge, Card, LinkButton, ProgressBar } from "@/components/ui";
import { scoreAnalysis } from "@/domain/analysis";
import type { Exam } from "@/domain/types";
import { daysBetween, fmtNum, formatDate, pct, today } from "@/domain/util";
import { useStore } from "@/store/store";

export function ExamCard({ exam }: { exam: Exam }) {
  const analyses = useStore(useShallow((s) => s.analyses.filter((a) => a.examId === exam.id)));
  const topics = useStore(useShallow((s) => s.topics.filter((t) => t.examId === exam.id)));
  const parent = useStore((s) => s.exams.find((e) => e.id === exam.parentExamId));
  const latest = [...analyses].filter((a) => a.finalizedAt).sort((a, b) => b.takenOn.localeCompare(a.takenOn))[0];
  const s = latest ? scoreAnalysis(latest) : null;
  const covered = topics.filter((t) => t.coverage === "covered" || t.coverage === "revised").length;
  const upcoming = daysBetween(today(), exam.date) >= 0;
  return (
    <Card className="flex flex-col p-5 transition hover:border-border-strong">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/exam/${exam.id}`} className="text-[15px] font-semibold tracking-tight hover:underline">{exam.name}</Link>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-fg-3">
            <span className="inline-flex items-center gap-1"><CalendarDays className="size-3.5" aria-hidden />{formatDate(exam.date)}</span>
            <span className="inline-flex items-center gap-1"><Clock className="size-3.5" aria-hidden />{exam.durationMinutes} min</span>
            {parent && <span>· for {parent.name}</span>}
          </div>
        </div>
        <ExamTypeBadge exam={exam} />
      </div>
      <div className="mt-4 flex-1 space-y-3">
        {upcoming && (
          <div className="flex items-center gap-2 text-sm"><span className="text-fg-3">Countdown</span> <Countdown date={exam.date} className="font-semibold" /></div>
        )}
        {!exam.parentExamId && topics.length > 0 && (
          <div>
            <div className="flex justify-between text-xs text-fg-3"><span>Syllabus coverage</span><span className="tabular">{covered}/{topics.length}</span></div>
            <ProgressBar value={covered / topics.length} size="sm" className="mt-1" label="Syllabus coverage" />
          </div>
        )}
        {s && latest && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-fg-3">Latest</span>
            <span className="font-semibold tabular">{fmtNum(s.score)}/{fmtNum(s.maxScore)}</span>
            <Badge tone="neutral">{pct(s.accuracy)} accuracy</Badge>
          </div>
        )}
        {exam.targetScore && <div className="text-xs text-fg-3"><Target className="mr-1 inline size-3.5" aria-hidden />Target {exam.targetScore}{exam.targetRange ? ` · ${exam.targetRange}` : ""}</div>}
      </div>
      <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
        <LinkButton href={`/exam/${exam.id}`} size="sm">Open</LinkButton>
        {!exam.parentExamId && <LinkButton href={`/pilot/${exam.id}`} size="sm" variant="ghost" icon={Compass}>Plan</LinkButton>}
        <LinkButton href={`/analyzer/new?exam=${exam.id}`} size="sm" variant="ghost" icon={ScanSearch}>{analyses.length ? "Analyze again" : "Analyze"}</LinkButton>
      </div>
    </Card>
  );
}
