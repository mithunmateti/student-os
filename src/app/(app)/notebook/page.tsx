"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CalendarClock, CircleCheck, CircleX, Download, NotebookPen, Repeat, RotateCcw, Search, Trash2 } from "lucide-react";
import { RetryDialog } from "@/components/retry";
import { Badge, Button, Card, ConfirmDialog, EmptyState, Input, LinkButton, PageHeader, Segmented, Select, Textarea, toast } from "@/components/ui";
import { UNKNOWN_ERROR } from "@/domain/catalog";
import type { Mastery, NotebookEntry } from "@/domain/types";
import { addDays, formatDate, relativeDayInline } from "@/domain/util";
import { download, notebookCsv } from "@/lib/export";
import { useToday } from "@/lib/hooks";
import { useStore } from "@/store/store";
import { getSearchParams } from "@/lib/url";

type Filter = "due" | "open" | "mastered" | "all";

export default function NotebookPage() {
  const notebook = useStore((s) => s.notebook);
  const analyses = useStore((s) => s.analyses);
  const cats = useStore((s) => s.settings.errorCategories);
  const { recordRetry } = useStore.getState();
  const d = useToday();
  const [filter, setFilter] = useState<Filter>("open");
  const [subject, setSubject] = useState("all");
  const [errType, setErrType] = useState("all");
  const [q, setQ] = useState("");
  const [retry, setRetry] = useState<{ ids: string[]; i: number } | null>(null);

  useEffect(() => {
    const f = getSearchParams().get("filter");
    if (f === "due") setFilter("due");
  }, []);

  const isDue = (n: NotebookEntry) => n.mastery !== "mastered" && !!n.nextRetryAt && n.nextRetryAt <= d;
  const list = useMemo(() => notebook
    .filter((n) => (filter === "due" ? isDue(n) : filter === "open" ? n.mastery !== "mastered" : filter === "mastered" ? n.mastery === "mastered" : true))
    .filter((n) => subject === "all" || n.subject === subject)
    .filter((n) => errType === "all" || n.errorType === errType)
    .filter((n) => !q.trim() || `${n.chapter} ${n.topic} ${n.whatWentWrong} ${n.correctedApproach}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Number(isDue(b)) - Number(isDue(a)) || (a.nextRetryAt ?? "9").localeCompare(b.nextRetryAt ?? "9") || b.createdAt.localeCompare(a.createdAt)),
  [notebook, filter, subject, errType, q, d]); // eslint-disable-line react-hooks/exhaustive-deps

  const due = notebook.filter(isDue);
  const subjects = [...new Set(notebook.map((n) => n.subject))];
  const errTypes = [...new Set(notebook.map((n) => n.errorType))];
  const label = (id: string) => (id === UNKNOWN_ERROR ? "Review later" : cats.find((c) => c.id === id)?.label ?? id);
  const current = retry ? notebook.find((n) => n.id === retry.ids[retry.i]) : undefined;
  const currentQ = current ? analyses.find((a) => a.id === current.analysisId)?.questions.find((x) => x.id === current.questionId) : undefined;

  return (
    <div className="animate-in">
      <PageHeader eyebrow="Question Bank" title="Error Notebook" subtitle="Every diagnosed mistake, scheduled for spaced retries until you've mastered it."
        actions={<>
          <Button icon={Download} disabled={!notebook.length} onClick={() => download("error-notebook.csv", notebookCsv(notebook, analyses, cats), "text/csv")}>Export CSV</Button>
          <Button variant="primary" icon={RotateCcw} disabled={!due.length} onClick={() => setRetry({ ids: due.map((n) => n.id), i: 0 })}>Retry {due.length} due now</Button>
        </>} />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Due for retry", due.length],
          ["Open", notebook.filter((n) => n.mastery !== "mastered").length],
          ["Reviewing", notebook.filter((n) => n.mastery === "reviewing").length],
          ["Mastered", notebook.filter((n) => n.mastery === "mastered").length],
        ].map(([l, v]) => <div key={String(l)} className="rounded-xl border border-border bg-surface px-4 py-3"><div className="text-xs text-fg-3">{l}</div><div className="text-2xl font-semibold tabular">{v}</div></div>)}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented label="Filter" value={filter} onChange={setFilter} options={[
          { value: "due", label: "Due", count: due.length }, { value: "open", label: "Open" }, { value: "mastered", label: "Mastered" }, { value: "all", label: "All", count: notebook.length },
        ]} />
        <Select aria-label="Subject" className="h-8 w-40 py-0" value={subject} onChange={(e) => setSubject(e.target.value)}><option value="all">All subjects</option>{subjects.map((s) => <option key={s}>{s}</option>)}</Select>
        <Select aria-label="Error type" className="h-8 w-48 py-0" value={errType} onChange={(e) => setErrType(e.target.value)}><option value="all">All error types</option>{errTypes.map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select>
        <div className="relative w-56"><Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-fg-3" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search chapter or notes" className="h-8 py-1 pl-8" aria-label="Search notebook" /></div>
      </div>

      {!notebook.length ? (
        <Card><EmptyState icon={NotebookPen} title="Your Error Notebook is empty" action={<LinkButton href="/analyzer" variant="primary">Go to Exam Analyzer</LinkButton>}>
          When you diagnose a wrong answer, it lands here with a retry date. Retrying mistakes after a gap is the fastest way to stop repeating them.
        </EmptyState></Card>
      ) : !list.length ? (
        <Card><EmptyState icon={CircleCheck} title={filter === "due" ? "Nothing due today" : "No entries match"}>{filter === "due" ? "Great — come back tomorrow, or retry anything from the Open list." : "Try a different filter."}</EmptyState></Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {list.map((n) => <Entry key={n.id} n={n} due={isDue(n)} label={label} onRetry={() => setRetry({ ids: [n.id], i: 0 })} />)}
        </div>
      )}

      <RetryDialog open={!!current && !!currentQ} question={currentQ} onClose={() => setRetry(null)}
        progress={retry && retry.ids.length > 1 ? `${retry.i + 1} of ${retry.ids.length}` : undefined}
        onSubmit={(sel, num) => { if (current) { const ok = recordRetry(current.id, sel, num); toast(ok ? "Correct — next retry pushed out a week" : "Logged. It'll come back in 2 days.", ok ? "good" : "info"); } }}
        footerExtra={retry && retry.i < retry.ids.length - 1 ? <Button variant="ghost" onClick={() => setRetry({ ...retry, i: retry.i + 1 })}>Next mistake →</Button> : undefined} />
    </div>
  );
}

function Entry({ n, due, label, onRetry }: { n: NotebookEntry; due: boolean; label: (id: string) => string; onRetry: () => void }) {
  const a = useStore((s) => s.analyses.find((x) => x.id === n.analysisId));
  const q = a?.questions.find((x) => x.id === n.questionId);
  const { updateNotebook, addNotebookToRevision, deleteNotebook } = useStore.getState();
  const [editing, setEditing] = useState(false);
  const [what, setWhat] = useState(n.whatWentWrong);
  const [fix, setFix] = useState(n.correctedApproach);
  const [confirmDel, setConfirmDel] = useState(false);
  const d = useToday();
  const masteryTone: Record<Mastery, "neutral" | "warn" | "good"> = { new: "neutral", reviewing: "warn", mastered: "good" };
  return (
    <Card className="flex flex-col p-4">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{n.chapter}{n.topic ? <span className="font-normal text-fg-3"> › {n.topic}</span> : null}</div>
          <div className="text-xs text-fg-3">{n.subject} · {a ? <Link href={`/analyzer/${a.id}/results?q=${n.questionId}`} className="hover:underline">{a.title} Q{q?.index}</Link> : "Deleted analysis"}</div>
        </div>
        <Badge tone="bad">{label(n.errorType)}</Badge>
        <Badge tone={masteryTone[n.mastery]}>{n.mastery === "new" ? "New" : n.mastery === "reviewing" ? "Reviewing" : "Mastered"}</Badge>
      </div>
      {q?.text && <p className="mt-2 line-clamp-2 text-[13px] text-fg-2">{q.text}</p>}
      <div className="mt-2 flex flex-wrap gap-3 text-[13px]"><span>You: <b>{n.studentAnswer}</b></span><span>Key: <b className="text-good">{n.correctAnswer}</b></span></div>
      {editing ? (
        <div className="mt-3 space-y-2">
          <Textarea rows={2} value={what} onChange={(e) => setWhat(e.target.value)} placeholder="What went wrong" aria-label="What went wrong" />
          <Textarea rows={2} value={fix} onChange={(e) => setFix(e.target.value)} placeholder="Corrected approach" aria-label="Corrected approach" />
          <div className="flex gap-2"><Button size="xs" variant="primary" onClick={() => { updateNotebook(n.id, { whatWentWrong: what, correctedApproach: fix }); setEditing(false); }}>Save</Button><Button size="xs" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button></div>
        </div>
      ) : (
        <button onClick={() => setEditing(true)} className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-left text-[13px] hover:bg-surface-3">
          <div><span className="text-fg-3">What went wrong: </span>{n.whatWentWrong || <span className="text-fg-3 italic">add a note…</span>}</div>
          <div className="mt-0.5"><span className="text-fg-3">Corrected approach: </span>{n.correctedApproach || <span className="text-fg-3 italic">add…</span>}</div>
        </button>
      )}
      {n.retries.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1 text-xs text-fg-3">
          Retries: {n.retries.map((r, i) => <span key={i} title={formatDate(r.at.slice(0, 10))}>{r.correct ? <CircleCheck className="inline size-3.5 text-good" aria-label="correct" /> : <CircleX className="inline size-3.5 text-bad" aria-label="wrong" />}</span>)}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
        <span className={`mr-auto inline-flex items-center gap-1 text-xs ${due ? "font-medium text-accent-text" : "text-fg-3"}`}>
          <CalendarClock className="size-3.5" aria-hidden />{n.mastery === "mastered" ? "Mastered" : n.nextRetryAt ? (due ? "Due now" : `Retry ${relativeDayInline(n.nextRetryAt, d)}`) : "Not scheduled"}
        </span>
        {n.mastery !== "mastered" && <Button size="xs" variant="soft" icon={RotateCcw} onClick={onRetry}>Retry now</Button>}
        <Button size="xs" variant="ghost" icon={Repeat} disabled={n.inRevision} onClick={() => { addNotebookToRevision(n.id); toast("Added to spaced revision (tomorrow and in 7 days)"); }}>{n.inRevision ? "In revision" : "Add to revision"}</Button>
        {n.mastery !== "mastered" ? <Button size="xs" variant="ghost" icon={CircleCheck} onClick={() => { updateNotebook(n.id, { mastery: "mastered", nextRetryAt: undefined }); toast("Marked understood"); }}>Mark understood</Button>
          : <Button size="xs" variant="ghost" onClick={() => updateNotebook(n.id, { mastery: "reviewing", nextRetryAt: addDays(d, 1) })}>Reopen</Button>}
        <label className="inline-flex items-center gap-1 text-xs text-fg-3">
          <span className="sr-only">Schedule redo</span>
          <input type="date" min={d} value={n.nextRetryAt ?? ""} onChange={(e) => { updateNotebook(n.id, { nextRetryAt: e.target.value || undefined, mastery: n.mastery === "mastered" ? "reviewing" : n.mastery }); toast("Redo scheduled"); }}
            className="field h-7 w-36 px-2 py-0 text-xs" aria-label="Schedule redo date" title="Schedule redo" />
        </label>
        <Button size="xs" variant="ghost" icon={Trash2} aria-label="Delete entry" onClick={() => setConfirmDel(true)} />
      </div>
      <ConfirmDialog open={confirmDel} onClose={() => setConfirmDel(false)} danger title="Remove from Error Notebook?" description="The question stays in its analysis and the Question Bank." confirmLabel="Remove" onConfirm={() => deleteNotebook(n.id)} />
    </Card>
  );
}
