"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, type ReactNode } from "react";
import { ArrowRight, Braces, Compass, Download, FileSpreadsheet, FileText, NotebookPen, Printer } from "lucide-react";
import { Bars, ChartCard, HBarList, subjectColorOf, Waterfall } from "@/components/charts";
import { Delta, ObservationCard, StatusChip } from "@/components/domain";
import { Badge, Button, Card, EmptyState, LinkButton } from "@/components/ui";
import { breakdown, detectPatterns, errorBreakdown, explainChange, recommend, scoreAnalysis, shortTitle, topLossSources } from "@/domain/analysis";
import { TASK_TYPE_META, UNKNOWN_ERROR } from "@/domain/catalog";
import { formatKey, formatResponse, resolveRule } from "@/domain/scoring";
import { familyAnalyses, rootExamId } from "@/domain/selectors";
import { fmtNum, formatDate, pct, fmtPct1 } from "@/domain/util";
import { download, questionsCsv, reportMarkdown, slug } from "@/lib/export";
import { useAnalysis, useScore } from "@/lib/hooks";
import { useStore } from "@/store/store";

function Section({ n, title, children, subtitle }: { n: number; title: string; children: ReactNode; subtitle?: ReactNode }) {
  return (
    <section className="card p-5" aria-labelledby={`sec-${n}`}>
      <div className="mb-4 flex items-baseline gap-3">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent-text">{n}</span>
        <div>
          <h2 id={`sec-${n}`} className="text-[15px] font-semibold tracking-tight">{title}</h2>
          {subtitle && <p className="text-xs text-fg-3">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

export default function ReportPage() {
  const { analysisId } = useParams<{ analysisId: string }>();
  const a = useAnalysis(analysisId)!;
  const s = useScore(a);
  const cats = useStore((st) => st.settings.errorCategories);
  const exams = useStore((st) => st.exams);
  const analyses = useStore((st) => st.analyses);
  const notebook = useStore((st) => st.notebook);
  const tasks = useStore((st) => st.tasks);

  const ctx = useMemo(() => {
    if (!a || !s || !a.finalizedAt) return null;
    const root = rootExamId({ exams }, a.examId);
    let fam = familyAnalyses({ exams, analyses }, root);
    if (!fam.some((x) => x.id === a.id)) fam = [...fam, a];
    const upTo = fam.slice(0, fam.findIndex((x) => x.id === a.id) + 1);
    const observations = detectPatterns(upTo, cats);
    const recs = recommend(observations, cats);
    const prev = upTo[upTo.length - 2];
    return {
      root, upTo, observations, recs, prev,
      subjects: breakdown(a, s, "subject"),
      chapters: breakdown(a, s, "chapter").filter((r) => r.questions > 0).slice(0, 12),
      errors: errorBreakdown(a, s, cats),
      top: topLossSources(a, s, cats, 5),
      change: prev ? explainChange(s, scoreAnalysis(prev)) : null,
    };
  }, [a, s, cats, exams, analyses]);

  if (!a || !s) return null;
  if (!ctx) return <Card><EmptyState icon={FileText} title="The report appears once results are calculated" action={<LinkButton href={`/analyzer/${a.id}`} variant="primary">Continue the analysis</LinkButton>} /></Card>;

  const penaltyRule = resolveRule(a.questions[0], a.sections);
  const breakEven = penaltyRule.correct + penaltyRule.wrong > 0 ? penaltyRule.wrong / (penaltyRule.correct + penaltyRule.wrong) : 0;
  const wrongMax = a.questions.filter((q) => s.byId[q.id]?.status === "wrong").reduce((m, q) => m + s.byId[q.id].max, 0);
  const redo = [...a.questions].filter((q) => s.byId[q.id]?.status === "wrong" || s.byId[q.id]?.status === "partial")
    .sort((x, y) => s.byId[y.id].forfeited - s.byId[x.id].forfeited || x.index - y.index);
  const nbEntries = notebook.filter((n) => n.analysisId === a.id);
  const catLabel = (id?: string) => (id === UNKNOWN_ERROR ? "Review later" : cats.find((c) => c.id === id)?.label ?? id ?? "Not diagnosed");
  const subjectsAll = ctx.subjects.map((x) => x.subject);
  const lostTotal = s.forfeitedWrong + s.forfeitedUnattempted + s.forfeitedPartial;
  const worstSubject = [...ctx.subjects].sort((x, y) => y.forfeited - x.forfeited)[0];
  const topErr = ctx.errors.find((e) => e.group !== "undiagnosed");
  const execCount = ctx.errors.filter((e) => e.group === "execution").reduce((m, e) => m + e.count, 0);
  const knowCount = ctx.errors.filter((e) => e.group === "knowledge").reduce((m, e) => m + e.count, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Where did I lose marks, why, and what should I do next?</h2>
          <p className="text-sm text-fg-3">{a.title} · {formatDate(a.takenOn)} · every number below is computed from your {a.questions.length} verified questions.</p>
        </div>
        <div className="flex flex-wrap gap-2 no-print">
          <Button size="sm" icon={Printer} onClick={() => window.print()}>Print / PDF</Button>
          <Button size="sm" icon={FileText} onClick={() => download(`${slug(a.title)}-report.md`, reportMarkdown(a, cats, ctx.recs, ctx.prev), "text/markdown")}>Markdown</Button>
          <Button size="sm" icon={FileSpreadsheet} onClick={() => download(`${slug(a.title)}-questions.csv`, questionsCsv(a, cats), "text/csv")}>CSV</Button>
          <Button size="sm" icon={Braces} onClick={() => download(`${slug(a.title)}.json`, JSON.stringify({ app: "student-os", kind: "analysis", analysis: a, score: { ...s, results: undefined, byId: undefined } }, null, 2), "application/json")}>Exam data</Button>
        </div>
      </div>

      {/* Key takeaways */}
      <Card className="border-accent/30 bg-accent-soft/30 p-5">
        <h3 className="eyebrow mb-2">In one minute</h3>
        <ul className="space-y-1.5 text-[14px] text-fg">
          <li>• You scored <b>{fmtNum(s.score)}/{fmtNum(s.maxScore)}</b> ({fmtPct1(s.percentage)}), getting <b>{pct(s.accuracy)}</b> of attempted questions right.</li>
          {ctx.change && <li>• {ctx.change.narrative}</li>}
          {worstSubject && worstSubject.forfeited > 0 && <li>• <b>{worstSubject.subject}</b> cost the most: −{fmtNum(worstSubject.forfeited)} of the {fmtNum(lostTotal)} marks you didn't get.</li>}
          {ctx.top[0] && <li>• Biggest single leak: <b>{ctx.top[0].chapter}</b> (−{fmtNum(ctx.top[0].forfeited)}){ctx.top[0].dominantError ? `, mostly ${ctx.top[0].dominantError.label.toLowerCase()}` : ""}.</li>}
          {topErr && <li>• Most common reason: <b>{topErr.label}</b> ({topErr.count} question{topErr.count === 1 ? "" : "s"}, −{fmtNum(topErr.forfeited)}).{execCount > knowCount && execCount >= 3 ? " Execution slips outnumber knowledge gaps — practise accuracy, not more theory." : ""}</li>}
          {ctx.recs[0] && <li>• First thing to do: <b>{ctx.recs[0].title}</b>.</li>}
        </ul>
      </Card>

      <Section n={1} title="Score summary">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {[
            ["Score", `${fmtNum(s.score)} / ${fmtNum(s.maxScore)}`, `${fmtPct1(s.percentage)} of maximum`],
            ["Correct", s.correct, `+${fmtNum(s.grossPositive)} marks`],
            ["Wrong", s.wrong, `${fmtNum(s.grossNegative)} marks`],
            ["Unattempted", s.unattempted, `${fmtNum(s.forfeitedUnattempted)} marks not earned`],
            ["Negative-mark impact", `−${fmtNum(s.negativeImpact)}`, `${s.gradable ? pct(s.negativeImpact / s.maxScore, 1) : "—"} of max`],
          ].map(([l, v, sub]) => (
            <div key={String(l)} className="rounded-xl border border-border px-4 py-3"><div className="text-xs text-fg-3">{l}</div><div className="mt-0.5 text-xl font-semibold tabular">{v}</div><div className="text-xs text-fg-3">{sub}</div></div>
          ))}
        </div>
      </Section>

      <Section n={2} title="Attempt vs accuracy" subtitle="Accuracy = correct ÷ attempted. Attempt rate = attempted ÷ gradable questions.">
        <div className="grid gap-5 md:grid-cols-[260px_1fr]">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-fg-2">Attempt rate</span><b className="tabular">{pct(s.attemptRate)}</b></div>
            <div className="flex justify-between"><span className="text-fg-2">Attempt accuracy</span><b className="tabular">{pct(s.accuracy)}</b></div>
            <div className="flex justify-between"><span className="text-fg-2">Break-even accuracy</span><b className="tabular">{pct(breakEven)}</b></div>
            <p className="pt-1 text-xs leading-relaxed text-fg-3">
              With +{penaltyRule.correct}/−{penaltyRule.wrong} marking, a question is worth attempting when you're more than {pct(breakEven)} sure.{" "}
              {s.accuracy !== null && s.accuracy > breakEven + 0.35 && s.attemptRate < 0.8 ? "Your accuracy is well above that — attempting more is likely to raise your score." : s.accuracy !== null && s.accuracy < breakEven + 0.15 ? "Your accuracy is close to break-even — be more selective." : "Your attempt/accuracy balance is reasonable."}
            </p>
          </div>
          <Bars height={200} data={ctx.subjects.map((r) => ({ label: r.subject, acc: Math.round((r.accuracy ?? 0) * 100), att: Math.round(r.attemptRate * 100) }))}
            series={[{ key: "att", name: "Attempt rate %", color: "var(--chart-2)" }, { key: "acc", name: "Accuracy %", color: "var(--chart-1)" }]} yFormat={(v) => `${v}%`} />
        </div>
      </Section>

      <Section n={3} title="Marks lost to wrong answers — and everywhere else" subtitle="From the maximum score down to your score, step by step">
        <Waterfall format={(v) => fmtNum(v)} steps={[
          { label: "Maximum", value: s.maxScore, kind: "total" },
          { label: "Left unattempted", value: s.forfeitedUnattempted, kind: "loss" },
          { label: "Wrong: marks not earned", value: wrongMax, kind: "loss" },
          { label: "Wrong: penalties", value: s.negativeImpact, kind: "loss" },
          ...(s.forfeitedPartial ? [{ label: "Partial shortfall", value: s.forfeitedPartial, kind: "loss" as const }] : []),
          { label: "Your score", value: s.score, kind: "total" },
        ]} />
        <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-[13px] text-fg-2">
          Wrong answers cost {fmtNum(s.forfeitedWrong)} marks in total ({fmtNum(wrongMax)} not earned + {fmtNum(s.negativeImpact)} in penalties); skipped questions cost {fmtNum(s.forfeitedUnattempted)}.
          {s.forfeitedWrong > s.forfeitedUnattempted ? " Fixing wrong answers is worth more than attempting more questions." : " You'd gain more by attempting more of the questions you skipped."}
        </p>
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section n={4} title="Subject breakdown">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-fg-3"><th className="pb-2 font-medium">Subject</th><th className="pb-2 text-right font-medium">Score</th><th className="pb-2 text-right font-medium">C/W/U</th><th className="pb-2 text-right font-medium">Accuracy</th><th className="pb-2 text-right font-medium">Lost</th></tr></thead>
            <tbody className="tabular">{ctx.subjects.map((r) => (
              <tr key={r.key} className="border-t border-border">
                <td className="py-2"><span className="mr-2 inline-block size-2 rounded-full" style={{ background: subjectColorOf(r.subject, subjectsAll) }} aria-hidden />{r.subject}</td>
                <td className="py-2 text-right">{fmtNum(r.score)}/{fmtNum(r.max)}</td><td className="py-2 text-right text-fg-2">{r.correct}/{r.wrong}/{r.unattempted}</td>
                <td className="py-2 text-right">{pct(r.accuracy)}</td><td className="py-2 text-right text-bad">−{fmtNum(r.forfeited)}</td>
              </tr>
            ))}</tbody>
          </table>
        </Section>
        <Section n={5} title="Chapter breakdown" subtitle="Chapters ranked by marks lost">
          <HBarList format={(v) => `−${fmtNum(v)}`} rows={ctx.chapters.filter((c) => c.forfeited > 0).slice(0, 8).map((c) => ({
            key: c.key, label: <><b className="font-medium text-fg">{c.chapter}</b> <span className="text-fg-3">· {c.subject}</span></>, value: c.forfeited,
            color: subjectColorOf(c.subject, subjectsAll), sub: `${c.correct}/${c.questions} correct · accuracy ${pct(c.accuracy)}`,
          }))} />
        </Section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section n={6} title="Error-type breakdown" subtitle="Why marks were lost (primary reason per question)">
          <HBarList format={(v) => `−${fmtNum(v)}`} rows={ctx.errors.map((e) => ({
            key: e.category, label: <>{e.label} <span className="text-fg-3">· {e.count}</span></>, value: e.forfeited,
            color: e.group === "undiagnosed" ? "var(--muted-status)" : e.group === "knowledge" ? "var(--chart-1)" : e.group === "execution" ? "var(--chart-2)" : e.group === "strategy" ? "var(--chart-3)" : "var(--chart-4)",
          }))} />
          <p className="mt-3 text-xs text-fg-3">Colours group reasons: knowledge (blue), execution (orange), exam strategy (green), process (yellow), not yet diagnosed (grey).</p>
          {ctx.errors.some((e) => e.group === "undiagnosed") && <LinkButton href={`/analyzer/${a.id}/errors`} size="sm" className="mt-3 no-print">Diagnose the rest</LinkButton>}
        </Section>
        <Section n={7} title="Top mark-loss sources">
          <ol className="space-y-2.5">
            {ctx.top.map((t, i) => (
              <li key={t.chapter} className="flex gap-3">
                <span className="w-5 text-sm font-semibold text-fg-3 tabular">{i + 1}.</span>
                <div className="flex-1 text-sm">
                  <div className="flex justify-between gap-2"><b>{t.chapter}</b><span className="font-semibold text-bad tabular">−{fmtNum(t.forfeited)}</span></div>
                  <div className="text-xs text-fg-3">{t.subject} · {t.wrong} wrong · {t.unattempted} unattempted of {t.questions}{t.dominantError ? ` · mostly ${t.dominantError.label.toLowerCase()} (${t.dominantError.count})` : ""}</div>
                </div>
              </li>
            ))}
          </ol>
        </Section>
      </div>

      <Section n={8} title="Questions to redo" subtitle="Wrong or partial answers, biggest mark swing first">
        {redo.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead><tr className="text-left text-xs text-fg-3"><th className="pb-2 font-medium">Q</th><th className="pb-2 font-medium">Chapter</th><th className="pb-2 font-medium">You / key</th><th className="pb-2 font-medium">Status</th><th className="pb-2 font-medium">Reason</th><th className="pb-2 text-right font-medium">Swing</th></tr></thead>
              <tbody>{redo.slice(0, 25).map((q) => (
                <tr key={q.id} className="border-t border-border">
                  <td className="py-2"><Link href={`/analyzer/${a.id}/results?q=${q.id}`} className="font-mono text-xs font-semibold text-accent-text hover:underline">Q{q.index}</Link></td>
                  <td className="py-2 text-fg-2">{q.chapter || q.subject}</td>
                  <td className="py-2 tabular">{formatResponse(q, a.responses[q.id])} / <span className="text-good">{formatKey(q)}</span></td>
                  <td className="py-2"><StatusChip status={s.byId[q.id].status} /></td>
                  <td className="py-2 text-xs text-fg-2">{catLabel(a.responses[q.id]?.errorPrimary)}</td>
                  <td className="py-2 text-right font-semibold text-bad tabular">−{fmtNum(s.byId[q.id].forfeited)}</td>
                </tr>
              ))}</tbody>
            </table>
            {redo.length > 25 && <p className="mt-2 text-xs text-fg-3">+{redo.length - 25} more in the CSV export.</p>}
          </div>
        ) : <p className="text-sm text-fg-3">No wrong answers. 🎯</p>}
      </Section>

      <Section n={9} title="Error Notebook additions" subtitle="Mistakes saved for spaced retries">
        {nbEntries.length ? (
          <div className="flex flex-wrap gap-2">
            {nbEntries.map((n) => {
              const q = a.questions.find((x) => x.id === n.questionId);
              return <Badge key={n.id} tone={n.mastery === "mastered" ? "good" : "accent"} icon={NotebookPen}>Q{q?.index} · {n.chapter} · {catLabel(n.errorType)}{n.nextRetryAt ? ` · retry ${n.nextRetryAt}` : ""}</Badge>;
            })}
            <LinkButton href="/notebook" size="xs" variant="ghost" iconRight={ArrowRight} className="no-print">Open notebook</LinkButton>
          </div>
        ) : <p className="text-sm text-fg-3">Nothing added yet. Wrong answers you diagnose are added automatically (except pure guesses).</p>}
      </Section>

      <Section n={10} title="Recommended next study actions" subtitle="Generated from the evidence below — and already scheduled in Student OS">
        {ctx.recs.length ? (
          <ol className="space-y-3">
            {ctx.recs.map((r, i) => {
              const sched = tasks.filter((t) => t.sourceRef?.observationId?.startsWith(r.id + "@")).sort((x, y) => x.dueDate.localeCompare(y.dueDate));
              return (
                <li key={r.id} className="rounded-xl border border-border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">{i + 1}. {r.title}</span>
                    <Badge tone={r.priority === "high" ? "bad" : r.priority === "medium" ? "warn" : "neutral"}>{r.priority}</Badge>
                    <Badge tone="neutral">{TASK_TYPE_META[r.taskType].label} · {r.minutes} min{r.sessions > 1 ? ` × ${r.sessions}` : ""}</Badge>
                    {sched.length > 0 && <Badge tone="accent" icon={Compass}>In plan · {sched.find((t) => t.status === "pending")?.dueDate ?? "done"}</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-fg-2">{r.detail}</p>
                  {r.checklist && <ul className="mt-1.5 list-inside list-disc text-xs text-fg-2">{r.checklist.map((c) => <li key={c}>{c}</li>)}</ul>}
                  <p className="mt-1.5 text-xs text-fg-3">Evidence: {r.reason}</p>
                </li>
              );
            })}
          </ol>
        ) : <p className="text-sm text-fg-3">No strong patterns yet. Diagnose your lost questions to unlock targeted actions.</p>}
        {ctx.observations.length > 0 && (
          <details className="mt-4">
            <summary className="text-sm font-medium text-accent-text">All {ctx.observations.length} evidence-linked observations</summary>
            <div className="mt-3 space-y-2">{ctx.observations.map((o) => <ObservationCard key={o.id} o={o} />)}</div>
          </details>
        )}
        <div className="mt-4 no-print"><LinkButton href={`/pilot/${ctx.root}`} variant="primary" icon={Compass}>Open my updated plan</LinkButton></div>
      </Section>

      <Section n={11} title="Comparison with previous exams">
        {ctx.upTo.length > 1 ? (
          <>
            {ctx.change && <p className="mb-3 text-sm text-fg-2">{ctx.change.narrative}</p>}
            <ChartCard title="Score % and accuracy by test" className="border-0 shadow-none"
              table={{ head: ["Test", "Score", "%", "Accuracy", "Attempted", "Negative"], rows: ctx.upTo.map((x) => { const sx = scoreAnalysis(x); return [x.title, `${sx.score}/${sx.maxScore}`, `${fmtPct1(sx.percentage)}`, pct(sx.accuracy), pct(sx.attemptRate), `−${sx.negativeImpact}`]; }) }}>
              <Bars height={200} data={ctx.upTo.slice(-6).map((x) => { const sx = scoreAnalysis(x); return { label: shortTitle(x.title), pct: sx.percentage ?? 0, acc: Math.round((sx.accuracy ?? 0) * 100) }; })}
                series={[{ key: "pct", name: "Score %", color: "var(--chart-1)" }, { key: "acc", name: "Accuracy %", color: "var(--chart-3)" }]} yFormat={(v) => `${v}%`} />
            </ChartCard>
            {ctx.change && (
              <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                {ctx.change.comparable ? (
                  <>
                    <div className="rounded-xl border border-border px-4 py-3"><div className="text-xs text-fg-3">Score</div><Delta value={ctx.change.scoreDelta} className="text-base" /></div>
                    <div className="rounded-xl border border-border px-4 py-3"><div className="text-xs text-fg-3">Marks gained</div><Delta value={ctx.change.gainsDelta} className="text-base" /></div>
                    <div className="rounded-xl border border-border px-4 py-3"><div className="text-xs text-fg-3">Penalties</div><Delta value={ctx.change.penaltyDelta} invert className="text-base" /></div>
                  </>
                ) : (
                  <>
                    <div className="rounded-xl border border-border px-4 py-3"><div className="text-xs text-fg-3">Score %</div><Delta value={ctx.change.percentageDelta} suffix=" pts" className="text-base" /></div>
                    <div className="rounded-xl border border-border px-4 py-3"><div className="text-xs text-fg-3">Attempt rate</div><Delta value={ctx.change.attemptRateDelta * 100} suffix=" pts" className="text-base" /></div>
                    <div className="rounded-xl border border-border px-4 py-3 text-xs text-fg-3">Papers differ in size — compared as percentages.</div>
                  </>
                )}
                <div className="rounded-xl border border-border px-4 py-3"><div className="text-xs text-fg-3">Accuracy</div><Delta value={ctx.change.accuracyDelta !== null ? ctx.change.accuracyDelta * 100 : null} suffix=" pts" className="text-base" /></div>
              </div>
            )}
          </>
        ) : <p className="text-sm text-fg-3">This is the first analyzed test for this exam. Your next analysis will be compared here.</p>}
      </Section>
      <p className="text-center text-xs text-fg-3 no-print">Report exported files contain only this analysis. <Download className="inline size-3" /> Full backups live in Settings.</p>
    </div>
  );
}
