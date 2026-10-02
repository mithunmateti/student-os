"use client";
import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { Archive, ArchiveRestore, ChevronDown, Dumbbell, Library, ListPlus, NotebookPen, Play, RotateCcw, Search, StickyNote, Trash2 } from "lucide-react";
import { StatusChip } from "@/components/domain";
import { QuestionBody } from "@/components/question-view";
import { RetryDialog } from "@/components/retry";
import { Badge, Button, Card, cn, ConfirmDialog, Dialog, EmptyState, Input, LinkButton, PageHeader, Select, Tabs, Textarea, toast } from "@/components/ui";
import { scoreAnalysis } from "@/domain/analysis";
import { UNKNOWN_ERROR } from "@/domain/catalog";
import { formatKey, formatResponse, type QuestionResult } from "@/domain/scoring";
import type { Analysis, PracticeSet, Question } from "@/domain/types";
import { useStore } from "@/store/store";

interface Row { a: Analysis; q: Question; res?: QuestionResult }
type Tab = "questions" | "sets";
const PAGE = 60;

export default function QuestionBankPage() {
  const analyses = useStore((s) => s.analyses);
  const notebook = useStore((s) => s.notebook);
  const sets = useStore((s) => s.practiceSets);
  const cats = useStore((s) => s.settings.errorCategories);
  const [tab, setTab] = useState<Tab>("questions");
  const [f, setF] = useState({ q: "", subject: "all", chapter: "all", error: "all", exam: "all", status: "all", difficulty: "all", redo: "all", archived: false });
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [retryRow, setRetryRow] = useState<Row | null>(null);
  const [noteRow, setNoteRow] = useState<Row | null>(null);
  const [setDialog, setSetDialog] = useState(false);
  const [practice, setPractice] = useState<{ set: PracticeSet; i: number; right: number } | null>(null);

  const all = useMemo<Row[]>(() => analyses.filter((a) => a.finalizedAt).flatMap((a) => {
    const s = scoreAnalysis(a);
    return a.questions.map((q) => ({ a, q, res: s.byId[q.id] }));
  }), [analyses]);
  const nbByQ = useMemo(() => new Map(notebook.map((n) => [n.questionId, n])), [notebook]);
  const key = (r: Row) => `${r.a.id}:${r.q.id}`;

  const rows = all.filter(({ a, q, res }) => {
    if (!f.archived && q.archived) return false;
    if (f.archived && !q.archived) return false;
    if (f.subject !== "all" && q.subject !== f.subject) return false;
    if (f.chapter !== "all" && q.chapter !== f.chapter) return false;
    if (f.exam !== "all" && a.id !== f.exam) return false;
    if (f.status !== "all" && res?.status !== f.status) return false;
    if (f.difficulty !== "all" && q.difficulty !== f.difficulty) return false;
    const err = a.responses[q.id]?.errorPrimary;
    if (f.error !== "all" && err !== f.error) return false;
    const nb = nbByQ.get(q.id);
    if (f.redo === "pending" && !(nb && nb.mastery !== "mastered")) return false;
    if (f.redo === "mastered" && nb?.mastery !== "mastered") return false;
    if (f.redo === "none" && nb) return false;
    if (f.q.trim()) {
      const t = f.q.toLowerCase();
      if (!`${q.text} ${q.chapter} ${q.topic} ${q.bankNote ?? ""}`.toLowerCase().includes(t)) return false;
    }
    return true;
  });
  const subjects = [...new Set(all.map((r) => r.q.subject))].filter(Boolean);
  const chapters = [...new Set(all.filter((r) => f.subject === "all" || r.q.subject === f.subject).map((r) => r.q.chapter))].filter(Boolean).sort();
  const label = (id?: string) => (id === UNKNOWN_ERROR ? "Review later" : cats.find((c) => c.id === id)?.short ?? id);
  const set = (patch: Partial<typeof f>) => { setF({ ...f, ...patch }); setLimit(PAGE); };
  const selectedRows = rows.filter((r) => selected.has(key(r)));
  const { updateQuestion, upsertNotebook, createPracticeSet, addToPracticeSet, deletePracticeSet } = useStore.getState();

  const practiceRow = practice ? (() => {
    const item = practice.set.items[practice.i];
    const a = analyses.find((x) => x.id === item?.analysisId);
    return a ? a.questions.find((q) => q.id === item.questionId) : undefined;
  })() : undefined;

  return (
    <div className="animate-in">
      <PageHeader title="Question Bank" subtitle="Every analyzed question in one searchable place. Retry, collect into practice sets, add notes, or archive."
        actions={<LinkButton href="/notebook" icon={NotebookPen}>Error Notebook</LinkButton>} />
      <Tabs value={tab} onChange={setTab} className="mb-5" tabs={[{ value: "questions", label: "Questions", count: all.filter((r) => !r.q.archived).length }, { value: "sets", label: "Practice sets", count: sets.length }]} />

      {tab === "questions" && (!all.length ? (
        <Card><EmptyState icon={Library} title="No analyzed questions yet" action={<LinkButton href="/analyzer/new" variant="primary">Analyze an exam</LinkButton>}>Questions appear here after you calculate results for an analysis.</EmptyState></Card>
      ) : (
        <>
          <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
            <div className="relative sm:col-span-2 lg:col-span-2"><Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-fg-3" /><Input value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder="Search text, chapter, notes" className="h-9 pl-8" aria-label="Search questions" /></div>
            <Select aria-label="Subject" value={f.subject} onChange={(e) => set({ subject: e.target.value, chapter: "all" })}><option value="all">All subjects</option>{subjects.map((s) => <option key={s}>{s}</option>)}</Select>
            <Select aria-label="Chapter" value={f.chapter} onChange={(e) => set({ chapter: e.target.value })}><option value="all">All chapters</option>{chapters.map((s) => <option key={s}>{s}</option>)}</Select>
            <Select aria-label="Result" value={f.status} onChange={(e) => set({ status: e.target.value })}><option value="all">Any result</option><option value="correct">Correct</option><option value="wrong">Wrong</option><option value="unattempted">Unattempted</option><option value="partial">Partial</option></Select>
            <Select aria-label="Error type" value={f.error} onChange={(e) => set({ error: e.target.value })}><option value="all">Any error type</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}<option value={UNKNOWN_ERROR}>Review later</option></Select>
            <Select aria-label="Exam" value={f.exam} onChange={(e) => set({ exam: e.target.value })}><option value="all">All exams</option>{analyses.filter((a) => a.finalizedAt).map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}</Select>
            <Select aria-label="Redo status" value={f.redo} onChange={(e) => set({ redo: e.target.value })}><option value="all">Any redo status</option><option value="pending">Redo pending</option><option value="mastered">Mastered</option><option value="none">Not in notebook</option></Select>
            <Select aria-label="Difficulty" value={f.difficulty} onChange={(e) => set({ difficulty: e.target.value })}><option value="all">Any difficulty</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></Select>
            <label className="flex items-center gap-2 text-sm text-fg-2"><input type="checkbox" className="size-4 accent-[var(--accent)]" checked={f.archived} onChange={(e) => set({ archived: e.target.checked })} />Archived</label>
          </div>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-fg-3">{rows.length} question{rows.length === 1 ? "" : "s"}</span>
            {selected.size > 0 && (
              <>
                <span className="text-fg-3">· {selectedRows.length} selected</span>
                <Button size="xs" variant="soft" icon={ListPlus} onClick={() => setSetDialog(true)}>Add to practice set</Button>
                <Button size="xs" variant="ghost" icon={Archive} onClick={() => { selectedRows.forEach((r) => updateQuestion(r.a.id, r.q.id, { archived: !f.archived })); setSelected(new Set()); toast(f.archived ? "Restored" : "Archived"); }}>{f.archived ? "Restore" : "Archive"}</Button>
                <Button size="xs" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
              </>
            )}
          </div>
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead><tr className="border-b border-border bg-surface-2 text-left text-xs text-fg-3">
                <th className="w-9 px-3 py-2"><input type="checkbox" aria-label="Select all shown" className="size-4 accent-[var(--accent)]" checked={rows.slice(0, limit).length > 0 && rows.slice(0, limit).every((r) => selected.has(key(r)))} onChange={(e) => setSelected(e.target.checked ? new Set(rows.slice(0, limit).map(key)) : new Set())} /></th>
                <th className="px-2 py-2 font-medium">Question</th><th className="px-2 py-2 font-medium">Chapter</th><th className="px-2 py-2 font-medium">Result</th><th className="px-2 py-2 font-medium">Error</th><th className="px-2 py-2 font-medium">Redo</th><th className="px-3 py-2 text-right font-medium">Actions</th>
              </tr></thead>
              <tbody>
                {rows.slice(0, limit).map((r) => {
                  const k = key(r);
                  const nb = nbByQ.get(r.q.id);
                  const isOpen = open === k;
                  return (
                    <Fragment key={k}>
                      <tr className={cn("border-b border-border/70 align-top", isOpen && "bg-surface-2")}>
                        <td className="px-3 py-2.5"><input type="checkbox" className="size-4 accent-[var(--accent)]" aria-label={`Select ${r.a.title} Q${r.q.index}`} checked={selected.has(k)} onChange={(e) => setSelected((s) => { const n = new Set(s); if (e.target.checked) n.add(k); else n.delete(k); return n; })} /></td>
                        <td className="max-w-md px-2 py-2.5">
                          <button onClick={() => setOpen(isOpen ? null : k)} className="text-left" aria-expanded={isOpen}>
                            <span className="text-xs text-fg-3">{r.a.title} · Q{r.q.index}</span>
                            <p className="line-clamp-2 text-[13px] text-fg">{r.q.text || <span className="italic text-fg-3">No text captured</span>}</p>
                          </button>
                          {r.q.bankNote && <p className="mt-1 text-xs text-accent-text"><StickyNote className="mr-1 inline size-3" />{r.q.bankNote}</p>}
                        </td>
                        <td className="px-2 py-2.5 text-[13px]"><div>{r.q.chapter || "—"}</div><div className="text-xs text-fg-3">{r.q.subject}{r.q.difficulty ? ` · ${r.q.difficulty}` : ""}</div></td>
                        <td className="px-2 py-2.5">{r.res && <StatusChip status={r.res.status} />}</td>
                        <td className="px-2 py-2.5 text-xs">{r.a.responses[r.q.id]?.errorPrimary ? <Badge tone="neutral">{label(r.a.responses[r.q.id]?.errorPrimary)}</Badge> : "—"}</td>
                        <td className="px-2 py-2.5 text-xs">{nb ? <Badge tone={nb.mastery === "mastered" ? "good" : "accent"}>{nb.mastery === "mastered" ? "Mastered" : `Due ${nb.nextRetryAt ?? "—"}`}</Badge> : <span className="text-fg-3">—</span>}</td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">
                          <button className="grid size-9 place-items-center rounded-full text-fg-3 hover:bg-surface-3 hover:text-fg" title="Retry" aria-label="Retry" onClick={() => setRetryRow(r)}><RotateCcw className="size-4" /></button>
                          <button className="grid size-9 place-items-center rounded-full text-fg-3 hover:bg-surface-3 hover:text-fg" title="Add note" aria-label="Add note" onClick={() => setNoteRow(r)}><StickyNote className="size-4" /></button>
                          <button className="grid size-9 place-items-center rounded-full text-fg-3 hover:bg-surface-3 hover:text-fg" title="Add to practice set" aria-label="Add to practice set" onClick={() => { setSelected(new Set([k])); setSetDialog(true); }}><ListPlus className="size-4" /></button>
                          <button className="grid size-9 place-items-center rounded-full text-fg-3 hover:bg-surface-3 hover:text-fg" title={r.q.archived ? "Restore" : "Archive"} aria-label={r.q.archived ? "Restore" : "Archive"} onClick={() => { updateQuestion(r.a.id, r.q.id, { archived: !r.q.archived }); toast(r.q.archived ? "Restored" : "Archived"); }}>{r.q.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}</button>
                          <button className="grid size-9 place-items-center rounded-full text-fg-3 hover:bg-surface-3 hover:text-fg" aria-label="Review" title="Review" onClick={() => setOpen(isOpen ? null : k)}><ChevronDown className={cn("size-4 transition", isOpen && "rotate-180")} /></button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="border-b border-border bg-surface-2"><td colSpan={7} className="px-5 py-4">
                          <QuestionBody q={r.q} r={r.a.responses[r.q.id]} />
                          <div className="mt-3 flex flex-wrap gap-3 text-xs text-fg-3">
                            <span>You: {formatResponse(r.q, r.a.responses[r.q.id])} · Key: {formatKey(r.q)}</span>
                            {r.q.source && <span>Source: {r.q.source.file}{r.q.source.page ? `, p.${r.q.source.page}` : ""}</span>}
                            <Link href={`/analyzer/${r.a.id}/results?q=${r.q.id}`} className="text-accent-text hover:underline">Open in analysis</Link>
                            {!nb && ["wrong", "partial", "unattempted"].includes(r.res?.status ?? "") && <button className="text-accent-text hover:underline" onClick={() => { upsertNotebook(r.a.id, r.q.id); toast("Added to Error Notebook"); }}>Add to Error Notebook</button>}
                          </div>
                        </td></tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            {!rows.length && <p className="px-5 py-10 text-center text-sm text-fg-3">No questions match these filters.</p>}
          </Card>
          {rows.length > limit && <div className="mt-3 text-center"><Button onClick={() => setLimit(limit + PAGE)}>Show {Math.min(PAGE, rows.length - limit)} more</Button></div>}
        </>
      ))}

      {tab === "sets" && (sets.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {sets.map((s) => (
            <Card key={s.id} className="p-5">
              <div className="flex items-start justify-between gap-2"><div><div className="font-semibold">{s.name}</div><div className="text-xs text-fg-3">{s.items.length} questions</div></div><Dumbbell className="size-5 text-fg-3" /></div>
              <div className="mt-4 flex gap-2">
                <Button size="sm" variant="primary" icon={Play} disabled={!s.items.length} onClick={() => setPractice({ set: s, i: 0, right: 0 })}>Practise</Button>
                <SetDelete onDelete={() => deletePracticeSet(s.id)} />
              </div>
            </Card>
          ))}
        </div>
      ) : <Card><EmptyState icon={Dumbbell} title="No practice sets yet">Select questions in the Questions tab and choose “Add to practice set” to build targeted drills.</EmptyState></Card>)}

      <RetryDialog open={!!retryRow} question={retryRow?.q} onClose={() => setRetryRow(null)} title={retryRow ? `Retry · ${retryRow.a.title} Q${retryRow.q.index}` : undefined}
        onSubmit={(sel, num, ok) => {
          if (!retryRow) return;
          const nb = nbByQ.get(retryRow.q.id);
          if (nb) useStore.getState().recordRetry(nb.id, sel, num);
          toast(ok ? "Correct!" : "Not quite — it's worth adding to your Error Notebook.", ok ? "good" : "info");
        }} />
      <NoteDialog row={noteRow} onClose={() => setNoteRow(null)} onSave={(note) => { if (noteRow) updateQuestion(noteRow.a.id, noteRow.q.id, { bankNote: note || undefined }); toast("Note saved"); }} />
      <PracticeSetDialog open={setDialog} onClose={() => setSetDialog(false)} sets={sets} count={selectedRows.length}
        onPick={(id, name) => {
          const items = selectedRows.map((r) => ({ analysisId: r.a.id, questionId: r.q.id }));
          if (id) addToPracticeSet(id, items); else createPracticeSet(name, items);
          setSelected(new Set());
          toast(`Added ${items.length} to ${name}`);
        }} />
      <RetryDialog open={!!practice && !!practiceRow} question={practiceRow} onClose={() => { if (practice) toast(`Practice finished: ${practice.right} of ${practice.set.items.length} right on first try.`, "info"); setPractice(null); }}
        progress={practice ? `${practice.set.name} · ${practice.i + 1} of ${practice.set.items.length}` : undefined}
        onSubmit={(_s, _n, ok) => practice && setPractice({ ...practice, right: practice.right + (ok ? 1 : 0) })}
        footerExtra={practice && practice.i < practice.set.items.length - 1 ? <Button variant="ghost" onClick={() => setPractice({ ...practice, i: practice.i + 1 })}>Next question →</Button> : undefined} />
    </div>
  );
}

function SetDelete({ onDelete }: { onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setOpen(true)} aria-label="Delete practice set" />
      <ConfirmDialog open={open} onClose={() => setOpen(false)} danger title="Delete practice set?" description="The questions themselves stay in the bank." confirmLabel="Delete" onConfirm={onDelete} />
    </>
  );
}

function NoteDialog({ row, onClose, onSave }: { row: Row | null; onClose: () => void; onSave: (n: string) => void }) {
  const [note, setNote] = useState("");
  return (
    <Dialog open={!!row} onClose={onClose} title={row ? `Note · ${row.a.title} Q${row.q.index}` : ""}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => { onSave(note); onClose(); }}>Save note</Button></>}>
      <Textarea key={row?.q.id} autoFocus rows={4} defaultValue={row?.q.bankNote ?? ""} onChange={(e) => setNote(e.target.value)} aria-label="Note" placeholder="e.g. Classic trap — read the sign convention" />
    </Dialog>
  );
}

function PracticeSetDialog({ open, onClose, sets, count, onPick }: { open: boolean; onClose: () => void; sets: PracticeSet[]; count: number; onPick: (id: string | null, name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <Dialog open={open} onClose={onClose} title={`Add ${count} question${count === 1 ? "" : "s"} to a practice set`} size="sm">
      <div className="space-y-2">
        {sets.map((s) => <button key={s.id} className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-left text-sm hover:border-accent" onClick={() => { onPick(s.id, s.name); onClose(); }}>{s.name}<span className="text-xs text-fg-3">{s.items.length}</span></button>)}
        <form className="flex gap-2 pt-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) { onPick(null, name.trim()); setName(""); onClose(); } }}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New set name, e.g. Kinematics drill" aria-label="New practice set name" />
          <Button type="submit" variant="primary" disabled={!name.trim()}>Create</Button>
        </form>
      </div>
    </Dialog>
  );
}
