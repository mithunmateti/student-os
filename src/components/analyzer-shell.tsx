"use client";
/** Header + stepper shared by every analysis step. */
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Check, Lock } from "lucide-react";
import type { AnalysisStage } from "@/domain/types";
import { formatDate } from "@/domain/util";
import { useAnalysis } from "@/lib/hooks";
import { stageIndex } from "@/store/store";
import { SaveIndicator } from "./domain";
import { NotFound } from "./shell";
import { Badge, cn } from "./ui";

export const STEPS: { stage: AnalysisStage; label: string; short: string }[] = [
  { stage: "review", label: "Review import", short: "Review" },
  { stage: "marking", label: "Marking scheme", short: "Marking" },
  { stage: "answers", label: "Your answers", short: "Answers" },
  { stage: "results", label: "Results", short: "Results" },
  { stage: "errors", label: "Diagnose errors", short: "Errors" },
  { stage: "report", label: "Report", short: "Report" },
];

export function AnalyzerShell({ children }: { children: ReactNode }) {
  const { analysisId } = useParams<{ analysisId: string }>();
  const a = useAnalysis(analysisId);
  const path = usePathname();
  if (!a) return <NotFound what="Analysis" back="/analyzer" />;
  const current = STEPS.find((s) => path.endsWith(`/${s.stage}`))?.stage ?? a.stage;
  const reached = stageIndex(a.stage);
  const resultsAvailable = !!a.finalizedAt;
  return (
    <div className="animate-in">
      <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-end md:justify-between no-print">
        <div className="min-w-0">
          <div className="eyebrow"><Link href="/analyzer" className="hover:underline">Exam Analyzer</Link></div>
          <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight">{a.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-fg-3">
            <span>Taken {formatDate(a.takenOn)}</span>·<span>{a.questions.length} questions</span>
            {a.finalizedAt ? <Badge tone="good">Analyzed</Badge> : <Badge tone="warn">Draft — autosaved</Badge>}
            {a.locked && <Badge tone="neutral" icon={Lock}>Answers locked</Badge>}
          </div>
        </div>
        <SaveIndicator />
      </div>
      <nav aria-label="Analysis steps" className="mb-6 overflow-x-auto scroll-thin no-print">
        <ol className="flex min-w-max items-center gap-1 rounded-xl border border-border bg-surface p-1">
          {STEPS.map((s, i) => {
            const enabled = i <= reached || (resultsAvailable && i <= stageIndex("report"));
            const done = i < reached || (s.stage === "results" && resultsAvailable && current !== "results");
            const active = s.stage === current;
            const content = (
              <span className={cn("flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition",
                active ? "bg-accent text-accent-fg shadow-sm" : enabled ? "text-fg-2 hover:bg-surface-3 hover:text-fg" : "text-fg-3 opacity-60")}>
                <span className={cn("grid size-5 place-items-center rounded-full text-[11px] font-semibold",
                  active ? "bg-accent-fg/20" : done ? "bg-good text-white" : "bg-surface-3")}>
                  {done && !active ? <Check className="size-3" strokeWidth={3} /> : i + 1}
                </span>
                <span className="hidden sm:inline">{s.label}</span><span className="sm:hidden">{s.short}</span>
              </span>
            );
            return (
              <li key={s.stage}>
                {enabled ? <Link href={`/analyzer/${a.id}/${s.stage}`} aria-current={active ? "step" : undefined}>{content}</Link> : <span aria-disabled="true" title="Complete the previous steps first">{content}</span>}
              </li>
            );
          })}
        </ol>
      </nav>
      {children}
    </div>
  );
}
