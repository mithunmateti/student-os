"use client";
import Link from "next/link";
import { useState } from "react";
import { ScanSearch, Trash2 } from "lucide-react";
import { Badge, Button, Card, ConfirmDialog, EmptyState, LinkButton, PageHeader, toast } from "@/components/ui";
import { scoreAnalysis } from "@/domain/analysis";
import { describeRule } from "@/domain/scoring";
import { fmtNum, formatDate, pct, fmtPct1 } from "@/domain/util";
import { useStore } from "@/store/store";

export default function AnalyzerIndex() {
  const analyses = useStore((s) => s.analyses);
  const exams = useStore((s) => s.exams);
  const del = useStore((s) => s.deleteAnalysis);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const sorted = [...analyses].sort((a, b) => b.takenOn.localeCompare(a.takenOn) || b.createdAt.localeCompare(a.createdAt));
  const drafts = sorted.filter((a) => !a.finalizedAt);
  const done = sorted.filter((a) => a.finalizedAt);
  const target = analyses.find((a) => a.id === toDelete);

  return (
    <div className="animate-in">
      <PageHeader title="Exam Analyzer" subtitle="Import a paper and key, verify it, score it with your marking scheme, and diagnose every lost mark."
        actions={<LinkButton href="/analyzer/new" variant="primary" icon={ScanSearch}>Analyze an exam</LinkButton>} />
      {!analyses.length ? (
        <Card><EmptyState icon={ScanSearch} title="No analyses yet" action={<LinkButton href="/analyzer/new" variant="primary" icon={ScanSearch}>Analyze an exam</LinkButton>}>
          Upload the question paper and answer key as PDFs or photos, paste them, or enter the structure manually.
        </EmptyState></Card>
      ) : (
        <div className="space-y-8">
          {drafts.length > 0 && (
            <section>
              <h2 className="section-title mb-3">In progress (autosaved drafts)</h2>
              <div className="grid gap-3 md:grid-cols-2">
                {drafts.map((a) => (
                  <Card key={a.id} className="flex items-center gap-4 p-4">
                    <div className="min-w-0 flex-1">
                      <Link href={`/analyzer/${a.id}`} className="font-semibold hover:underline">{a.title}</Link>
                      <div className="text-xs text-fg-3">{a.questions.length} questions · at the <b className="font-medium text-fg-2">{a.stage}</b> step · updated {formatDate(a.updatedAt.slice(0, 10))}</div>
                    </div>
                    <LinkButton href={`/analyzer/${a.id}`} size="sm" variant="primary">Continue</LinkButton>
                    <Button size="sm" variant="ghost" icon={Trash2} aria-label={`Delete draft ${a.title}`} onClick={() => setToDelete(a.id)} />
                  </Card>
                ))}
              </div>
            </section>
          )}
          {done.length > 0 && (
            <section>
              <h2 className="section-title mb-3">Completed analyses</h2>
              <Card className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-border text-left text-xs text-fg-3">
                    <th className="px-5 py-2.5 font-medium">Exam</th><th className="px-3 py-2.5 font-medium">Taken</th><th className="px-3 py-2.5 font-medium">Score</th>
                    <th className="px-3 py-2.5 font-medium">Accuracy</th><th className="hidden px-3 py-2.5 font-medium sm:table-cell">Attempted</th><th className="hidden px-3 py-2.5 font-medium sm:table-cell">Negative</th><th className="hidden px-3 py-2.5 font-medium md:table-cell">Marking</th><th className="px-5"><span className="sr-only">Actions</span></th>
                  </tr></thead>
                  <tbody className="tabular">
                    {done.map((a) => {
                      const s = scoreAnalysis(a);
                      const exam = exams.find((e) => e.id === a.examId);
                      return (
                        <tr key={a.id} className="border-b border-border/70 last:border-0">
                          <td className="px-5 py-3"><Link href={`/analyzer/${a.id}/report`} className="font-semibold text-accent-text hover:underline">{a.title}</Link>{exam?.name && exam.name !== a.title && <div className="text-xs text-fg-3">{exam.name}</div>}</td>
                          <td className="px-3 py-3 text-fg-2">{formatDate(a.takenOn, { day: "numeric", month: "short" })}</td>
                          <td className="px-3 py-3 font-medium">{fmtNum(s.score)}/{fmtNum(s.maxScore)} <span className="text-xs font-normal text-fg-3">({fmtPct1(s.percentage)})</span></td>
                          <td className="px-3 py-3">{pct(s.accuracy)}</td>
                          <td className="hidden px-3 py-3 sm:table-cell">{pct(s.attemptRate)}</td>
                          <td className="hidden px-3 py-3 text-bad sm:table-cell">−{fmtNum(s.negativeImpact)}</td>
                          <td className="hidden px-3 py-3 text-xs text-fg-3 md:table-cell">{a.sections[0] ? describeRule(a.sections[0].rule) : ""}{a.sections.length > 1 ? ` +${a.sections.length - 1}` : ""}</td>
                          <td className="px-5 py-3 text-right whitespace-nowrap">
                            <Link href={`/analyzer/${a.id}/results`} className="mr-3 text-xs font-medium text-accent-text hover:underline">Results</Link>
                            <Link href={`/analyzer/${a.id}/report`} className="text-xs font-medium text-accent-text hover:underline">Report</Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Card>
              {done.some((a) => a.changes.some((c) => c.kind !== "finalized")) && <p className="mt-2 text-xs text-fg-3">Some analyses were edited after scoring — see the audit trail on their results page.</p>}
            </section>
          )}
        </div>
      )}
      <ConfirmDialog open={!!toDelete} onClose={() => setToDelete(null)} danger confirmLabel="Delete" title="Delete this analysis?"
        description={<>“{target?.title}” and its Error Notebook entries will be removed from this browser.</>}
        onConfirm={() => { if (toDelete) { del(toDelete); toast("Analysis deleted"); } }} />
      {done.length > 0 && <div className="mt-4"><Badge tone="neutral">Tip</Badge> <span className="text-xs text-fg-3">To analyze a new sitting of the same test format, choose “Reuse a previous paper” when you start.</span></div>}
    </div>
  );
}
