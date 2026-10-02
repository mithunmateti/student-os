"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useState } from "react";
import { ArrowRight, ChevronDown, Compass, History, Info, Pencil, Search, Stethoscope } from "lucide-react";
import { StatusChip } from "@/components/domain";
import { QuestionBody } from "@/components/question-view";
import { Badge, Button, Callout, Card, CardHeader, cn, EmptyState, Input, LinkButton, Segmented, Select } from "@/components/ui";
import { breakdown, scoreAnalysis } from "@/domain/analysis";
import { formatKey, formatResponse, STATUS_LABEL } from "@/domain/scoring";
import type { ResultStatus } from "@/domain/types";
import { fmtNum, fmtSigned, formatDate, pct, fmtPct1 } from "@/domain/util";
import { useAnalysis, useScore } from "@/lib/hooks";
import { useStore } from "@/store/store";
import { rootExamId } from "@/domain/selectors";
import { getSearchParams } from "@/lib/url";

export default function ResultsPage() {
  const { analysisId } = useParams<{ analysisId: string }>();
  const a = useAnalysis(analysisId)!;
  const s = useScore(a);
  const router = useRouter();
  const cats = useStore((st) => st.settings.errorCategories);
  const change = useStore((st) => st.planChanges.find((c) => a && c.examId === rootExamId(st, a.examId) && c.trigger.includes(a.title)));
  const rootExam = useStore((st) => (a ? st.exams.find((e) => e.id === rootExamId(st, a.examId)) : undefined));
  const [status, setStatus] = useState<"all" | ResultStatus>("all");
  const [subject, setSubject] = useState("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    const id = getSearchParams().get("q");
    if (id) {
      setOpen(id);
      setTimeout(() => document.getElementById(`row-${id}`)?.scrollIntoView({ block: "center" }), 100);
    }
  }, []);

  const subjects = useMemo(() => (s ? breakdown(a, s, "subject") : []), [a, s]);
  if (!a || !s) return null;
  if (!a.finalizedAt) {
    return <Card><EmptyState icon={Info} title="Results aren't calculated yet" action={<LinkButton href={`/analyzer/${a.id}/${a.stage === "results" ? "answers" : a.stage}`} variant="primary">Continue the analysis</LinkButton>}>Finish reviewing the paper, confirm marking and enter your answers first.</EmptyState></Card>;
  }
  const catLabel = new Map(cats.map((c) => [c.id, c.short]));
  const ordered = [...a.questions].sort((x, y) => x.index - y.index);
  const rows = ordered.filter((x) => {
    const r = s.byId[x.id];
    if (status !== "all" && r?.status !== status) return false;
    if (subject !== "all" && x.subject !== subject) return false;
    if (q.trim() && String(x.index) !== q.trim().replace(/^q/i, "")) return false;
    return true;
  });
  const lost = s.wrong + s.unattempted + s.partial;
  const diagnosed = ordered.filter((x) => ["wrong", "unattempted", "partial"].includes(s.byId[x.id]?.status) && a.responses[x.id]?.errorPrimary).length;
  const counts: Record<string, number> = { all: ordered.length, correct: s.correct, wrong: s.wrong, unattempted: s.unattempted };
  if (s.partial) counts.partial = s.partial;
  if (s.bonus) counts.bonus = s.bonus;
  if (s.dropped) counts.dropped = s.dropped;
  if (s.unkeyed) counts.unkeyed = s.unkeyed;

  return (
    <div className="space-y-6">
      {/* Score summary */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-2xl border border-border bg-surface p-5 sm:col-span-2 lg:col-span-1">
          <div className="text-xs font-medium text-fg-3">Total score</div>
          <div className="mt-1 text-4xl font-semibold tracking-tight tabular">{fmtNum(s.score)}<span className="text-lg font-normal text-fg-3"> / {fmtNum(s.maxScore)}</span></div>
          <div className="mt-1 text-sm text-fg-2">{fmtPct1(s.percentage)} of maximum</div>
          {rootExam?.targetScore && rootExam.id === a.examId && <div className="mt-1 text-xs text-fg-3">Target {rootExam.targetScore}</div>}
        </div>
        {[
          { l: "Attempt accuracy", v: pct(s.accuracy), sub: `${s.correct} correct ÷ ${s.attempted} attempted`, hint: "Share of the questions you attempted that were correct. Not the same as score %." },
          { l: "Attempt rate", v: pct(s.attemptRate), sub: `${s.attempted} of ${s.gradable} questions attempted`, hint: "Attempted ÷ gradable questions (excludes bonus, dropped and unkeyed)." },
          { l: "Negative-mark impact", v: `−${fmtNum(s.negativeImpact)}`, sub: `penalties on ${s.wrong} wrong answer${s.wrong === 1 ? "" : "s"}`, hint: "Marks deducted for wrong answers.", tone: "text-bad" },
          { l: "Correct · Wrong · Unattempted", v: <span><span className="text-good">{s.correct}</span> · <span className="text-bad">{s.wrong}</span> · <span className="text-fg-3">{s.unattempted}</span></span>, sub: `+${fmtNum(s.grossPositive)} gained, ${fmtNum(s.grossNegative)} lost` },
        ].map((x) => (
          <div key={x.l} className="rounded-2xl border border-border bg-surface p-5" title={x.hint}>
            <div className="text-xs font-medium text-fg-3">{x.l}</div>
            <div className={cn("mt-1 text-2xl font-semibold tracking-tight tabular", x.tone)}>{x.v}</div>
            <div className="mt-1 text-xs text-fg-3">{x.sub}</div>
          </div>
        ))}
      </div>
      <p className="-mt-3 text-xs text-fg-3">Score % = net score ÷ maximum. Accuracy = correct ÷ attempted. They answer different questions: accuracy measures judgement on what you attempted; score % includes what you left.
        {(s.bonus || s.dropped || s.unkeyed || s.partial || s.notCounted) ? ` Also: ${[s.partial && `${s.partial} partial`, s.bonus && `${s.bonus} bonus`, s.dropped && `${s.dropped} dropped`, s.unkeyed && `${s.unkeyed} without key (excluded)`, s.notCounted && `${s.notCounted} over the optional-section limit`].filter(Boolean).join(", ")}.` : ""}</p>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        {change && (
          <Callout tone="good" icon={Compass} title={`Exam Pilot updated your plan for ${rootExam?.name ?? "your goal exam"}`}
            action={<LinkButton href={`/pilot/${change.examId}`} size="sm">See plan</LinkButton>}>
            {change.summary} {lost > 0 && diagnosed < lost ? "Tag why you lost marks to sharpen it further." : ""}
          </Callout>
        )}
        {lost > 0 && (
          <Callout icon={Stethoscope} title={`${lost} questions lost marks · ${diagnosed} diagnosed`}
            action={<Button variant="primary" size="sm" iconRight={ArrowRight} onClick={() => router.push(`/analyzer/${a.id}/errors`)}>Diagnose</Button>}>
            A wrong answer isn't automatically a concept gap. Tell Exam Pilot why — it takes about 5 seconds per question.
          </Callout>
        )}
      </div>

      <Card>
        <CardHeader title="By subject" subtitle="Where the marks came from and went" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-y border-border text-left text-xs text-fg-3">
              <th className="px-5 py-2 font-medium">Subject</th><th className="px-3 py-2 text-right font-medium">Score</th><th className="px-3 py-2 text-right font-medium">Correct</th><th className="px-3 py-2 text-right font-medium">Wrong</th>
              <th className="px-3 py-2 text-right font-medium">Unattempted</th><th className="px-3 py-2 text-right font-medium">Accuracy</th><th className="px-5 py-2 text-right font-medium">Marks short</th>
            </tr></thead>
            <tbody className="tabular">
              {subjects.map((r) => (
                <tr key={r.key} className="border-b border-border/70 last:border-0">
                  <td className="px-5 py-2.5 font-medium">{r.subject}</td>
                  <td className="px-3 py-2.5 text-right">{fmtNum(r.score)}/{fmtNum(r.max)}</td>
                  <td className="px-3 py-2.5 text-right text-good">{r.correct}</td><td className="px-3 py-2.5 text-right text-bad">{r.wrong}</td>
                  <td className="px-3 py-2.5 text-right text-fg-3">{r.unattempted}</td><td className="px-3 py-2.5 text-right">{pct(r.accuracy)}</td>
                  <td className="px-5 py-2.5 text-right text-bad">−{fmtNum(r.forfeited)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader title="Every question" subtitle="Click a row to see the question with your answer and the key"
          action={<div className="flex gap-2"><LinkButton href={`/analyzer/${a.id}/review`} size="sm" variant="ghost" icon={Pencil}>Correct the key</LinkButton><LinkButton href={`/analyzer/${a.id}/answers`} size="sm" variant="ghost" icon={Pencil}>Edit answers</LinkButton></div>} />
        <div className="flex flex-wrap items-center gap-2 px-5 pb-3">
          <Segmented label="Filter by status" value={status} onChange={setStatus} options={Object.entries(counts).map(([k, n]) => ({ value: k as "all" | ResultStatus, label: k === "all" ? "All" : STATUS_LABEL[k as ResultStatus], count: n }))} />
          <Select aria-label="Filter by subject" className="h-8 w-40 py-0" value={subject} onChange={(e) => setSubject(e.target.value)}>
            <option value="all">All subjects</option>{subjects.map((x) => <option key={x.subject} value={x.subject}>{x.subject}</option>)}
          </Select>
          <div className="relative w-32"><Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-fg-3" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Q no." className="h-8 py-1 pl-8" aria-label="Find question number" /></div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr className="border-y border-border bg-surface-2 text-left text-xs text-fg-3">
              <th className="px-5 py-2 font-medium">Q</th><th className="px-2 py-2 font-medium">Subject · chapter</th><th className="px-2 py-2 font-medium">Your answer</th><th className="px-2 py-2 font-medium">Correct</th>
              <th className="px-2 py-2 font-medium">Result</th><th className="px-2 py-2 text-right font-medium">Marks</th><th className="px-2 py-2 font-medium">Error type</th><th className="w-8 px-5"><span className="sr-only">Actions</span></th>
            </tr></thead>
            <tbody>
              {rows.map((x) => {
                const res = s.byId[x.id];
                const r = a.responses[x.id];
                const isOpen = open === x.id;
                return (
                  <Fragment key={x.id}>
                    <tr id={`row-${x.id}`} onClick={() => setOpen(isOpen ? null : x.id)} className={cn("cursor-pointer border-b border-border/70 hover:bg-surface-2", isOpen && "bg-surface-2")}>
                      <td className="px-5 py-2 font-mono text-xs font-semibold">Q{x.index}</td>
                      <td className="px-2 py-2"><div className="text-[13px]">{x.subject}</div><div className="text-xs text-fg-3">{x.chapter || "—"}</div></td>
                      <td className="px-2 py-2 font-medium tabular">{formatResponse(x, r)}{r?.guessed && <Badge tone="warn" className="ml-1.5">guess</Badge>}</td>
                      <td className="px-2 py-2 tabular">{formatKey(x)}</td>
                      <td className="px-2 py-2">{res && <StatusChip status={res.status} />}</td>
                      <td className={cn("px-2 py-2 text-right font-semibold tabular", res?.awarded > 0 ? "text-good" : res?.awarded < 0 ? "text-bad" : "text-fg-3")}>{res ? fmtSigned(res.awarded) : ""}</td>
                      <td className="px-2 py-2 text-xs">{r?.errorPrimary ? <Badge tone="neutral">{r.errorPrimary === "unknown" ? "Review later" : catLabel.get(r.errorPrimary) ?? r.errorPrimary}</Badge> : ["wrong", "unattempted", "partial"].includes(res?.status) ? <span className="text-fg-3">—</span> : null}</td>
                      <td className="px-5 py-2"><ChevronDown className={cn("size-4 text-fg-3 transition", isOpen && "rotate-180")} aria-hidden /></td>
                    </tr>
                    {isOpen && (
                      <tr className="border-b border-border bg-surface-2"><td colSpan={8} className="px-5 py-4">
                        <QuestionBody q={x} r={r} />
                        {r?.errorNote && <p className="mt-3 text-sm text-fg-2"><b>Your note:</b> {r.errorNote}</p>}
                        {["wrong", "unattempted", "partial"].includes(res?.status) && <LinkButton href={`/analyzer/${a.id}/errors?q=${x.id}`} size="sm" className="mt-3" icon={Stethoscope}>Diagnose this question</LinkButton>}
                      </td></tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {!rows.length && <p className="px-5 py-8 text-center text-sm text-fg-3">No questions match.</p>}
        </div>
      </Card>

      {a.changes.length > 1 && (
        <Card>
          <CardHeader icon={History} title="Audit trail" subtitle="Every change made after results were calculated" />
          <ul className="divide-y divide-border border-t border-border text-sm">
            {[...a.changes].reverse().map((c, i) => (
              <li key={i} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
                <span className="w-32 text-xs text-fg-3">{formatDate(c.at.slice(0, 10), { day: "numeric", month: "short" })} {new Date(c.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                <span className="flex-1">{c.detail}</span>
                {c.scoreBefore !== undefined && c.scoreAfter !== undefined && c.scoreBefore !== c.scoreAfter && <Badge tone={c.scoreAfter > c.scoreBefore ? "good" : "bad"}>Score {fmtNum(c.scoreBefore)} → {fmtNum(c.scoreAfter)}</Badge>}
                {c.kind === "finalized" && <Badge tone="accent">Scored {fmtNum(c.scoreAfter ?? 0)}</Badge>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="flex justify-end gap-2">
        <LinkButton href={`/analyzer/${a.id}/report`}>Skip to report</LinkButton>
        {lost > 0 && <LinkButton href={`/analyzer/${a.id}/errors`} variant="primary" iconRight={ArrowRight}>Diagnose lost marks</LinkButton>}
      </div>
    </div>
  );
}
