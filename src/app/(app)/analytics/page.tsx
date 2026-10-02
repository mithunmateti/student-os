"use client";
import { useMemo, useState } from "react";
import { ChartColumn, ScanSearch } from "lucide-react";
import { Bars, ChartCard, Heatmap, HBarList, LineTrend, subjectColorOf, Waterfall } from "@/components/charts";
import { ObservationCard } from "@/components/domain";
import { Card, EmptyState, LinkButton, PageHeader, Segmented, Select } from "@/components/ui";
import { breakdown, detectPatterns, errorBreakdown, explainChange, scoreAnalysis, shortTitle } from "@/domain/analysis";
import { ERROR_GROUP_LABEL } from "@/domain/catalog";
import { allFinalized, familyAnalyses, targetExams } from "@/domain/selectors";
import { fmtNum, fmtPct1, pct, round2 } from "@/domain/util";
import { useStore } from "@/store/store";

type Range = "3" | "5" | "all";

export default function AnalyticsPage() {
  const exams = useStore((s) => s.exams);
  const analyses = useStore((s) => s.analyses);
  const cats = useStore((s) => s.settings.errorCategories);
  const goals = targetExams({ exams });
  const [scope, setScope] = useState<string>(goals[0]?.id ?? "all");
  const [range, setRange] = useState<Range>("all");

  const list = useMemo(() => {
    const base = scope === "all" ? allFinalized({ analyses }) : familyAnalyses({ exams, analyses }, scope);
    return range === "all" ? base : base.slice(-Number(range));
  }, [scope, range, exams, analyses]);
  const data = useMemo(() => list.map((a) => ({ a, s: scoreAnalysis(a), label: shortTitle(a.title) })), [list]);
  const observations = useMemo(() => detectPatterns(list, cats, Math.max(3, list.length)), [list, cats]);

  if (!allFinalized({ analyses }).length) {
    return (
      <div className="animate-in">
        <PageHeader title="Analytics" subtitle="Trends across your analyzed exams." />
        <Card><EmptyState icon={ChartColumn} title="Analytics needs at least one analyzed exam" action={<LinkButton href="/analyzer/new" variant="primary" icon={ScanSearch}>Analyze an exam</LinkButton>}>Score, accuracy, attempt and error trends appear once you've analyzed tests — and get more useful with every one.</EmptyState></Card>
      </div>
    );
  }

  const first = data[0];
  const last = data[data.length - 1];
  const prev = data[data.length - 2];
  const subjects = [...new Set(data.flatMap((d) => d.a.questions.map((q) => q.subject)))].filter(Boolean);
  const sameSize = data.every((d) => Math.abs(d.s.maxScore - data[0].s.maxScore) < 0.01);

  // Subject trend (% of subject max).
  const subjData = data.map((d) => {
    const row: Record<string, number | string | null> = { label: d.label };
    for (const sub of subjects) {
      const r = breakdown(d.a, d.s, "subject").find((x) => x.subject === sub);
      row[sub] = r && r.max ? round2((r.score / r.max) * 100) : null;
    }
    return row;
  });
  const subjMin = Math.min(0, Math.floor(Math.min(...subjData.flatMap((r) => subjects.map((s) => (typeof r[s] === "number" ? (r[s] as number) : 0)))) / 20) * 20);
  const subjDeltas = subjects.map((sub) => ({ sub, d: data.length > 1 ? ((subjData[subjData.length - 1][sub] as number) ?? 0) - ((subjData[0][sub] as number) ?? 0) : 0 }));
  const bestSub = [...subjDeltas].sort((x, y) => y.d - x.d)[0];
  const worstSub = [...subjDeltas].sort((x, y) => x.d - y.d)[0];

  // Chapter heatmap: chapters with enough questions.
  const chapterStats = new Map<string, { subject: string; perTest: Map<string, { c: number; a: number }>; total: number }>();
  for (const d of data) {
    for (const r of breakdown(d.a, d.s, "chapter")) {
      if (!r.chapter || r.chapter === "Unclassified") continue;
      const k = `${r.subject}::${r.chapter}`;
      const v = chapterStats.get(k) ?? { subject: r.subject, perTest: new Map(), total: 0 };
      v.perTest.set(d.a.id, { c: r.correct, a: r.attempted });
      v.total += r.questions;
      chapterStats.set(k, v);
    }
  }
  const heatAvg = (k: string) => {
    const v = chapterStats.get(k)!;
    let c = 0, a = 0;
    v.perTest.forEach((x) => { c += x.c; a += x.a; });
    return a ? c / a : null;
  };
  const heatRows = [...chapterStats.entries()].filter(([, v]) => v.total >= 3).map(([k]) => k).sort((x, y) => (heatAvg(x) ?? -1) - (heatAvg(y) ?? -1));
  const weakest = [...heatRows].filter((k) => heatAvg(k) !== null).sort((x, y) => (heatAvg(x) ?? 1) - (heatAvg(y) ?? 1)).slice(0, 3);

  // Error distribution across the window.
  const errTotals = new Map<string, { label: string; group: string; count: number; forfeited: number }>();
  for (const d of data) for (const e of errorBreakdown(d.a, d.s, cats)) {
    const v = errTotals.get(e.category) ?? { label: e.label, group: e.group, count: 0, forfeited: 0 };
    v.count += e.count;
    v.forfeited = round2(v.forfeited + e.forfeited);
    errTotals.set(e.category, v);
  }
  const errRows = [...errTotals.entries()].sort((x, y) => y[1].forfeited - x[1].forfeited);
  const groupTotals = errRows.reduce<Record<string, number>>((m, [, v]) => ({ ...m, [v.group]: (m[v.group] ?? 0) + v.count }), {});
  const topGroup = Object.entries(groupTotals).filter(([g]) => g !== "undiagnosed").sort((x, y) => y[1] - x[1])[0];

  const change = prev ? explainChange(last.s, prev.s) : null;
  const wrongMax = last.a.questions.filter((q) => last.s.byId[q.id]?.status === "wrong").reduce((m, q) => m + last.s.byId[q.id].max, 0);
  const negSeries = data.map((d) => ({ label: d.label, neg: sameSize ? d.s.negativeImpact : round2((d.s.negativeImpact / (d.s.maxScore || 1)) * 100) }));

  return (
    <div className="animate-in space-y-6">
      <PageHeader title="Analytics" subtitle="Every chart ends with what it means. Charts compare percentages whenever papers differ in size."
        actions={<>
          <Select aria-label="Exam scope" className="w-64" value={scope} onChange={(e) => setScope(e.target.value)}>
            {goals.map((g) => <option key={g.id} value={g.id}>{g.name} (with mocks)</option>)}
            <option value="all">All analyzed exams</option>
          </Select>
          <Segmented label="Range" value={range} onChange={setRange} options={[{ value: "3", label: "Last 3" }, { value: "5", label: "Last 5" }, { value: "all", label: "All" }]} />
        </>} />

      {!data.length ? (
        <Card><EmptyState icon={ChartColumn} title="No analyzed tests in this scope">Pick another exam, or analyze a mock linked to this goal exam.</EmptyState></Card>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Score over time" subtitle="Score as % of each paper's maximum"
              table={{ head: ["Test", "Date", "Score", "Max", "%"], rows: data.map((d) => [d.a.title, d.a.takenOn, d.s.score, d.s.maxScore, `${fmtPct1(d.s.percentage)}`]) }}
              interpretation={data.length < 2 ? "One test so far — the trend appears with the next analysis." : `${fmtPct1(first.s.percentage)} → ${fmtPct1(last.s.percentage)} across ${data.length} tests. ${change?.narrative ?? ""}`}>
              <LineTrend data={data.map((d) => ({ label: d.label, pct: d.s.percentage }))} series={[{ key: "pct", name: "Score %", color: "var(--chart-1)" }]} yFormat={(v) => `${v}%`} />
            </ChartCard>
            <ChartCard title="Accuracy and attempt rate over time" subtitle="Accuracy = correct ÷ attempted · Attempt rate = attempted ÷ questions"
              table={{ head: ["Test", "Accuracy", "Attempt rate"], rows: data.map((d) => [d.a.title, pct(d.s.accuracy), pct(d.s.attemptRate)]) }}
              interpretation={data.length < 2 ? `Accuracy ${pct(last.s.accuracy)} on ${pct(last.s.attemptRate)} of questions attempted.` :
                `Accuracy moved ${pct(first.s.accuracy)} → ${pct(last.s.accuracy)}; attempt rate ${pct(first.s.attemptRate)} → ${pct(last.s.attemptRate)}. ${Math.abs((last.s.accuracy ?? 0) - (first.s.accuracy ?? 0)) >= Math.abs(last.s.attemptRate - first.s.attemptRate) ? "Quality of attempts, not volume, is driving the change." : "Volume of attempts, more than accuracy, is driving the change."}`}>
              <LineTrend yDomain={[0, 100]} data={data.map((d) => ({ label: d.label, acc: Math.round((d.s.accuracy ?? 0) * 100), att: Math.round(d.s.attemptRate * 100) }))}
                series={[{ key: "acc", name: "Accuracy", color: "var(--chart-1)" }, { key: "att", name: "Attempt rate", color: "var(--chart-2)", dashed: true }]} yFormat={(v) => `${v}%`} />
            </ChartCard>
            <ChartCard title="Negative-mark impact over time" subtitle={sameSize ? "Marks lost to wrong-answer penalties" : "Penalties as % of the paper's maximum"}
              table={{ head: ["Test", "Penalty marks", "Wrong answers"], rows: data.map((d) => [d.a.title, `−${d.s.negativeImpact}`, d.s.wrong]) }}
              interpretation={data.length < 2 ? `Penalties cost ${fmtNum(last.s.negativeImpact)} marks on ${last.s.wrong} wrong answers.` : `Penalties went from ${fmtNum(first.s.negativeImpact)} to ${fmtNum(last.s.negativeImpact)} marks${sameSize ? "" : " (compare the % view — paper sizes differ)"}. ${last.s.negativeImpact < first.s.negativeImpact ? "Fewer careless attempts are paying off." : last.s.negativeImpact > first.s.negativeImpact ? "More wrong attempts are eating into gains — be more selective." : "Unchanged."}`}>
              <Bars data={negSeries} series={[{ key: "neg", name: sameSize ? "Penalty marks" : "Penalty % of max", color: "var(--bad)" }]} yFormat={(v) => (sameSize ? `${v}` : `${v}%`)} />
            </ChartCard>
            <ChartCard title="Subject score trend" subtitle="Each subject's score as % of its maximum"
              table={{ head: ["Test", ...subjects], rows: subjData.map((r) => [String(r.label), ...subjects.map((s) => (r[s] === null ? "—" : `${r[s]}%`))]) }}
              interpretation={data.length < 2 ? "Subject trends need two or more tests." : bestSub && worstSub && bestSub.sub !== worstSub.sub ? `${bestSub.sub} improved most (${bestSub.d >= 0 ? "+" : ""}${Math.round(bestSub.d)} pts); ${worstSub.sub} ${worstSub.d < 0 ? `slipped ${Math.round(-worstSub.d)} pts` : `improved least (+${Math.round(worstSub.d)} pts)`}.` : undefined}>
              <LineTrend data={subjData} series={subjects.slice(0, 4).map((s) => ({ key: s, name: s, color: subjectColorOf(s, subjects) }))} yFormat={(v) => `${v}%`} yDomain={[subjMin, 100]} />
            </ChartCard>
          </div>

          <ChartCard title="Chapter accuracy heatmap" subtitle="Correct ÷ attempted per chapter per test, weakest chapters first. Cells print counts because samples are small."
            interpretation={weakest.length ? `Lowest accuracy overall: ${weakest.map((k) => `${k.split("::")[1]} (${pct(heatAvg(k))})`).join(", ")}. These are where targeted practice pays most.` : undefined}>
            <Heatmap rows={heatRows} cols={data.map((d) => d.label)}
              cellText={(k, col) => { const d = data.find((x) => x.label === col); const v = d && chapterStats.get(k)!.perTest.get(d.a.id); return v ? `${v.c}/${v.a}` : "·"; }}
              rowLabel={(k) => <><span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: subjectColorOf(chapterStats.get(k)!.subject, subjects) }} aria-hidden />{k.split("::")[1]}</>}
              value={(k, col) => { const d = data.find((x) => x.label === col); const v = d && chapterStats.get(k)!.perTest.get(d.a.id); return v && v.a ? v.c / v.a : null; }}
              cellLabel={(k, col) => { const d = data.find((x) => x.label === col); const v = d && chapterStats.get(k)!.perTest.get(d.a.id); return v ? `${k.split("::")[1]} · ${col}: ${v.c} of ${v.a} attempted correct` : `${k.split("::")[1]} · ${col}: not in this test or none attempted`; }} />
          </ChartCard>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Error-type distribution" subtitle={`Primary reasons across ${data.length} test${data.length === 1 ? "" : "s"}, ranked by marks lost`}
              table={{ head: ["Reason", "Questions", "Marks lost"], rows: errRows.map(([, v]) => [v.label, v.count, `−${v.forfeited}`]) }}
              interpretation={topGroup ? `${ERROR_GROUP_LABEL[topGroup[0]] ?? topGroup[0]} errors are the largest group (${topGroup[1]} questions). ${topGroup[0] === "execution" ? "You mostly know the material — practise careful execution." : topGroup[0] === "knowledge" ? "Concept and recall gaps dominate — prioritise re-learning weak chapters." : topGroup[0] === "strategy" ? "Exam strategy (time, selection, guessing) is the lever." : ""}` : "Tag reasons in the Analyzer to see this breakdown."}>
              <HBarList format={(v) => `−${fmtNum(v)}`} rows={errRows.slice(0, 10).map(([k, v]) => ({ key: k, label: <>{v.label} <span className="text-fg-3">· {v.count}</span></>, value: v.forfeited,
                color: v.group === "undiagnosed" ? "var(--muted-status)" : v.group === "knowledge" ? "var(--chart-1)" : v.group === "execution" ? "var(--chart-2)" : v.group === "strategy" ? "var(--chart-3)" : "var(--chart-4)" }))} />
            </ChartCard>
            <ChartCard title={`Mark-loss breakdown · ${last.a.title}`} subtitle="From maximum to your score"
              interpretation={`Of ${fmtNum(last.s.maxScore - last.s.score)} marks not earned, ${fmtNum(last.s.forfeitedUnattempted)} came from skipped questions and ${fmtNum(last.s.forfeitedWrong)} from wrong answers (including ${fmtNum(last.s.negativeImpact)} in penalties).`}>
              <Waterfall format={(v) => fmtNum(v)} steps={[
                { label: "Maximum", value: last.s.maxScore, kind: "total" },
                { label: "Unattempted", value: last.s.forfeitedUnattempted, kind: "loss" },
                { label: "Wrong (not earned)", value: wrongMax, kind: "loss" },
                { label: "Penalties", value: last.s.negativeImpact, kind: "loss" },
                ...(last.s.forfeitedPartial ? [{ label: "Partial", value: last.s.forfeitedPartial, kind: "loss" as const }] : []),
                { label: "Score", value: last.s.score, kind: "total" },
              ]} />
            </ChartCard>
          </div>

          <section id="patterns">
            <h2 className="mb-3 text-[15px] font-semibold">Evidence-linked observations</h2>
            {observations.length ? <div className="grid gap-3 lg:grid-cols-2">{observations.map((o) => <ObservationCard key={o.id} o={o} />)}</div>
              : <p className="text-sm text-fg-3">No patterns with enough evidence yet. Patterns need repeated occurrences across questions or tests.</p>}
          </section>
        </>
      )}
    </div>
  );
}
