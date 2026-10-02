"use client";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, ChevronLeft, ChevronRight, HelpCircle, NotebookPen, Sparkles } from "lucide-react";
import { StatusChip } from "@/components/domain";
import { QuestionBody } from "@/components/question-view";
import { Badge, Button, Callout, Card, cn, EmptyState, Kbd, LinkButton, ProgressBar, Segmented, Textarea, toast } from "@/components/ui";
import { suggestError } from "@/domain/ai/heuristics";
import { lostQuestions } from "@/domain/analysis";
import { ERROR_GROUP_LABEL, FAST_CHIP_ORDER, UNKNOWN_ERROR } from "@/domain/catalog";
import { rootExamId } from "@/domain/selectors";
import { formatKey, formatResponse } from "@/domain/scoring";
import { fmtNum, norm } from "@/domain/util";
import { useAnalysis, useHotkeys, useScore } from "@/lib/hooks";
import { useStore } from "@/store/store";
import { getSearchParams } from "@/lib/url";

type Filter = "all" | "wrong" | "unattempted" | "todo";
const SHORTCUTS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

export default function ErrorsPage() {
  const { analysisId } = useParams<{ analysisId: string }>();
  const a = useAnalysis(analysisId)!;
  const s = useScore(a);
  const router = useRouter();
  const cats = useStore((st) => st.settings.errorCategories);
  const topics = useStore((st) => st.topics);
  const notebook = useStore((st) => st.notebook);
  const { setResponse, upsertNotebook, removeNotebookFor, regeneratePlan, setStage } = useStore.getState();
  const [filter, setFilter] = useState<Filter>("all");
  const [current, setCurrent] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [fix, setFix] = useState("");
  const [showMore, setShowMore] = useState(false);

  const lost = useMemo(() => {
    if (!a || !s) return [];
    const l = lostQuestions(a, s);
    const rank = { wrong: 0, partial: 1, unattempted: 2 } as Record<string, number>;
    return [...l].sort((x, y) => rank[s.byId[x.id].status] - rank[s.byId[y.id].status] || x.index - y.index);
  }, [a, s]);
  const visible = lost.filter((q) => {
    const st = s?.byId[q.id]?.status;
    if (filter === "wrong") return st === "wrong" || st === "partial";
    if (filter === "unattempted") return st === "unattempted";
    if (filter === "todo") return !a.responses[q.id]?.errorPrimary;
    return true;
  });
  const active = cats.filter((c) => !c.hidden);
  const chipOrder = [...FAST_CHIP_ORDER.map((id) => active.find((c) => c.id === id)).filter(Boolean), ...active.filter((c) => !FAST_CHIP_ORDER.includes(c.id))] as typeof cats;
  const primaryChips = chipOrder.slice(0, 10);
  const moreChips = chipOrder.slice(10);

  useEffect(() => {
    const qp = getSearchParams().get("q");
    const first = lost.find((q) => q.id === qp) ?? lost.find((q) => !a.responses[q.id]?.errorPrimary) ?? lost[0];
    if (first) setCurrent(first.id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const q = lost.find((x) => x.id === current) ?? visible[0];
  const r = q ? a.responses[q.id] : undefined;
  const res = q && s ? s.byId[q.id] : undefined;
  const nb = q ? notebook.find((n) => n.analysisId === a.id && n.questionId === q.id) : undefined;
  const topic = q ? topics.find((t) => norm(t.chapter) === norm(q.chapter) && (norm(t.topic) === norm(q.topic) || !q.topic)) : undefined;
  const suggestion = q ? suggestError(q, r, res, topic) : null;

  useEffect(() => {
    setNote(r?.errorNote ?? nb?.whatWentWrong ?? "");
    setFix(nb?.correctedApproach ?? "");
    setShowMore(false);
  }, [q?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const idx = q ? visible.findIndex((x) => x.id === q.id) : -1;
  const go = (d: 1 | -1) => {
    const next = visible[idx + d];
    if (next) setCurrent(next.id);
  };
  const saveText = () => {
    if (!q) return;
    if ((r?.errorNote ?? "") !== note) setResponse(a.id, q.id, { errorNote: note });
    if (nb && (nb.whatWentWrong !== note || nb.correctedApproach !== fix)) upsertNotebook(a.id, q.id, { whatWentWrong: note, correctedApproach: fix });
  };
  const tag = (catId: string) => {
    if (!q) return;
    setResponse(a.id, q.id, { errorPrimary: catId, errorSecondary: (r?.errorSecondary ?? []).filter((x) => x !== catId), diagnosedAt: new Date().toISOString(), errorNote: note });
    // Wrong answers go to the Error Notebook by default (unless diagnosed as a pure guess).
    const status = res?.status;
    if (nb) upsertNotebook(a.id, q.id, { errorType: catId, whatWentWrong: note, correctedApproach: fix });
    else if (status !== "unattempted" && catId !== "guess" && catId !== UNKNOWN_ERROR) upsertNotebook(a.id, q.id, { errorType: catId, whatWentWrong: note, correctedApproach: fix });
  };
  const toggleSecondary = (catId: string) => {
    if (!q || r?.errorPrimary === catId) return;
    const cur = r?.errorSecondary ?? [];
    setResponse(a.id, q.id, { errorSecondary: cur.includes(catId) ? cur.filter((x) => x !== catId) : [...cur, catId] });
  };
  const saveNext = () => {
    saveText();
    const next = visible.slice(idx + 1).find((x) => !a.responses[x.id]?.errorPrimary) ?? visible[idx + 1];
    if (next) setCurrent(next.id);
    else toast("That was the last one in this list.", "info");
  };
  const finish = () => {
    saveText();
    setStage(a.id, "report");
    const change = regeneratePlan(rootExamId(useStore.getState(), a.examId), `Diagnosis of ${a.title}`);
    toast(change ? `Plan updated from your diagnosis: ${change.summary}` : "Diagnosis saved.", "good", undefined, 6000);
    router.push(`/analyzer/${a.id}/report`);
  };

  useHotkeys((e) => {
    if (!q) return;
    const i = SHORTCUTS.indexOf(e.key);
    if (i >= 0 && primaryChips[i]) { e.preventDefault(); tag(primaryChips[i].id); }
    else if (e.key === "u" || e.key === "U") tag(UNKNOWN_ERROR);
    else if ((e.key === "s" || e.key === "S") && suggestion) tag(suggestion.category);
    else if (e.key === "Enter") { e.preventDefault(); saveNext(); }
    else if (e.key === "ArrowRight") go(1);
    else if (e.key === "ArrowLeft") go(-1);
  }, [q, r, note, fix, suggestion, primaryChips, visible, idx]);

  if (!a || !s) return null;
  if (!lost.length) {
    return <Card><EmptyState icon={Check} title="Nothing to diagnose — every question earned full marks" action={<LinkButton href={`/analyzer/${a.id}/report`} variant="primary">See the report</LinkButton>}>Impressive. Your report still shows strengths and trends.</EmptyState></Card>;
  }
  const done = lost.filter((x) => a.responses[x.id]?.errorPrimary).length;
  const catLabel = (id?: string) => (id === UNKNOWN_ERROR ? "Review later" : cats.find((c) => c.id === id)?.short ?? id);

  return (
    <div className="grid gap-6 pb-10 lg:grid-cols-[280px_1fr]">
      <aside aria-label="Diagnosis progress" className="space-y-3 lg:sticky lg:top-6 lg:self-start">
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="flex items-baseline justify-between text-sm"><span className="font-medium">Diagnosed</span><span className="tabular text-fg-2">{done}/{lost.length}</span></div>
          <ProgressBar value={done / lost.length} tone="good" className="mt-2" label="Diagnosis progress" />
          <p className="mt-2 text-xs text-fg-3">Not sure why? Tag “Review later” — never force a diagnosis.</p>
        </div>
        <Segmented size="xs" label="Filter lost questions" value={filter} onChange={setFilter} options={[
          { value: "all", label: "All", count: lost.length },
          { value: "wrong", label: "Wrong", count: lost.filter((x) => s.byId[x.id].status !== "unattempted").length },
          { value: "unattempted", label: "Skipped", count: lost.filter((x) => s.byId[x.id].status === "unattempted").length },
          { value: "todo", label: "To do", count: lost.length - done },
        ]} />
        <ul className="max-h-[60vh] space-y-1 overflow-y-auto pr-1 scroll-thin" aria-label="Lost questions">
          {visible.map((x) => {
            const e = a.responses[x.id]?.errorPrimary;
            return (
              <li key={x.id}>
                <button onClick={() => { saveText(); setCurrent(x.id); }} aria-current={q?.id === x.id}
                  className={cn("flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition", q?.id === x.id ? "bg-accent-soft text-fg ring-1 ring-accent/30" : "hover:bg-surface-3")}>
                  <span className="w-9 font-mono text-xs font-semibold">Q{x.index}</span>
                  <span className={cn("size-1.5 shrink-0 rounded-full", s.byId[x.id].status === "unattempted" ? "bg-muted-status" : "bg-bad")} aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-fg-2">{x.chapter || x.subject}</span>
                  {e ? <Badge tone={e === UNKNOWN_ERROR ? "warn" : "neutral"}>{catLabel(e)}</Badge> : <span className="text-[11px] text-fg-3">to do</span>}
                </button>
              </li>
            );
          })}
        </ul>
        <Button variant="primary" className="w-full" iconRight={ArrowRight} onClick={finish}>Finish & update plan</Button>
      </aside>

      {q && res ? (
        <div className="min-w-0 space-y-4">
          <Card className="p-5">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-semibold">Question {q.index} — {res.status === "unattempted" ? "Unattempted" : res.status === "partial" ? "Partial" : "Wrong"}</h2>
              <StatusChip status={res.status} />
              <span className="text-sm text-fg-3">{q.subject}{q.chapter ? ` · ${q.chapter}` : ""}{q.topic ? ` › ${q.topic}` : ""}</span>
              <span className="ml-auto text-sm font-semibold text-bad tabular">−{fmtNum(res.forfeited)} vs full marks</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-4 text-sm">
              <span>Your answer: <b className="tabular">{formatResponse(q, r)}</b></span>
              <span>Correct answer: <b className="text-good tabular">{formatKey(q)}</b></span>
              {r?.guessed && <Badge tone="warn">You marked this as a guess</Badge>}
              {r?.outOfTime && <Badge tone="warn">You ran out of time</Badge>}
            </div>
            <details className="mt-4 rounded-lg border border-border px-4 py-3" open={!!q.text}>
              <summary className="text-sm font-medium">Question</summary>
              <div className="mt-3"><QuestionBody q={q} r={r} /></div>
            </details>
          </Card>

          <Card className="p-5">
            <h3 className="text-[15px] font-semibold">Why did you lose the mark?</h3>
            {suggestion && r?.errorPrimary !== suggestion.category && (
              <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-accent/30 bg-accent-soft/50 px-3 py-2 text-sm">
                <Sparkles className="size-4 text-accent-text" aria-hidden />
                <span className="flex-1"><b>Suggestion: {cats.find((c) => c.id === suggestion.category)?.label}</b> — {suggestion.why}</span>
                <Button size="xs" variant="soft" onClick={() => tag(suggestion.category)}>Accept <Kbd>S</Kbd></Button>
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Primary error reason">
              {primaryChips.map((c, i) => (
                <ChipButton key={c.id} on={r?.errorPrimary === c.id} onClick={() => tag(c.id)} shortcut={SHORTCUTS[i]} title={c.description}>{c.short}</ChipButton>
              ))}
              {showMore && moreChips.map((c) => <ChipButton key={c.id} on={r?.errorPrimary === c.id} onClick={() => tag(c.id)} title={c.description}>{c.short}</ChipButton>)}
              {moreChips.length > 0 && <button className="px-2 text-sm font-medium text-accent-text hover:underline" onClick={() => setShowMore((v) => !v)}>{showMore ? "Fewer" : `+${moreChips.length} more`}</button>}
              <ChipButton on={r?.errorPrimary === UNKNOWN_ERROR} onClick={() => tag(UNKNOWN_ERROR)} shortcut="U" tone="warn"><HelpCircle className="size-3.5" />Unknown / review later</ChipButton>
            </div>
            {r?.errorPrimary && r.errorPrimary !== UNKNOWN_ERROR && (
              <div className="mt-4">
                <div className="mb-1.5 text-xs font-medium text-fg-3">Also contributed (optional)</div>
                <div className="flex flex-wrap gap-1.5">
                  {chipOrder.filter((c) => c.id !== r.errorPrimary).map((c) => (
                    <button key={c.id} aria-pressed={!!r.errorSecondary?.includes(c.id)} onClick={() => toggleSecondary(c.id)}
                      className={cn("rounded-full border px-2.5 py-0.5 text-xs transition", r.errorSecondary?.includes(c.id) ? "border-accent bg-accent-soft text-accent-text" : "border-border text-fg-3 hover:text-fg")}>{c.short}</button>
                  ))}
                </div>
              </div>
            )}
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div>
                <label htmlFor="err-note" className="label">What went wrong? (optional)</label>
                <Textarea id="err-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} onBlur={saveText} placeholder="e.g. used g = 9.8 but the question said 10" />
              </div>
              <div>
                <label htmlFor="err-fix" className="label">Corrected approach (optional)</label>
                <Textarea id="err-fix" rows={2} value={fix} onChange={(e) => setFix(e.target.value)} onBlur={saveText} placeholder="What you'd do differently next time" />
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={!!nb} onChange={(e) => (e.target.checked ? upsertNotebook(a.id, q.id, { whatWentWrong: note, correctedApproach: fix }) : removeNotebookFor(a.id, q.id))} />
                <NotebookPen className="size-4 text-fg-3" aria-hidden /> Add to Error Notebook {nb ? <span className="text-xs text-fg-3">· redo scheduled {nb.nextRetryAt ? `for ${nb.nextRetryAt}` : ""}</span> : null}
              </label>
              <span className="flex-1" />
              <Button variant="ghost" icon={ChevronLeft} disabled={idx <= 0} onClick={() => go(-1)}>Prev</Button>
              <Button variant="ghost" iconRight={ChevronRight} disabled={idx >= visible.length - 1} onClick={() => go(1)}>Skip</Button>
              <Button variant="primary" onClick={saveNext}>Save & Next <Kbd>↵</Kbd></Button>
            </div>
          </Card>
          <Callout icon={HelpCircle} className="text-xs">
            Shortcuts: <Kbd>1</Kbd>–<Kbd>0</Kbd> pick a reason · <Kbd>U</Kbd> review later · <Kbd>S</Kbd> accept suggestion · <Kbd>↵</Kbd> save & next · <Kbd>←</Kbd><Kbd>→</Kbd> move.
            Categories can be renamed or added in Settings.
          </Callout>
          <p className="text-xs text-fg-3">Error groups: {Object.entries(ERROR_GROUP_LABEL).map(([k, v]) => `${v} (${active.filter((c) => c.group === k).map((c) => c.short).join(", ")})`).filter((x) => !x.endsWith("()")).join(" · ")}</p>
        </div>
      ) : (
        <Card><EmptyState icon={Check} title="Nothing in this filter">Switch filters on the left.</EmptyState></Card>
      )}
    </div>
  );
}

function ChipButton({ on, onClick, children, shortcut, title, tone }: { on: boolean; onClick: () => void; children: React.ReactNode; shortcut?: string; title?: string; tone?: "warn" }) {
  return (
    <button role="radio" aria-checked={on} onClick={onClick} title={title}
      className={cn("inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition",
        on ? (tone === "warn" ? "border-warn bg-warn-soft text-warn" : "border-accent bg-accent text-accent-fg") : "border-border-strong bg-surface text-fg-2 hover:border-fg-3 hover:text-fg")}>
      {children}
      {shortcut && <span className={cn("rounded px-1 font-mono text-[10px]", on ? "bg-white/20" : "bg-surface-3 text-fg-3")}>{shortcut}</span>}
    </button>
  );
}
