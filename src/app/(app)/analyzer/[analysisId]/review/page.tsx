"use client";
import { useParams, useRouter } from "next/navigation";
import { memo, useCallback, useMemo, useState } from "react";
import { ArrowRight, Check, ClipboardPaste, ImageIcon, ListChecks, Pencil, Plus, Search, ShieldCheck, Sparkles, TriangleAlert, Wand2 } from "lucide-react";
import { KeyInput, QuestionEditorDialog } from "@/components/question-editor";
import { Badge, Button, Callout, Card, cn, Dialog, Input, Segmented, Select, Textarea, toast } from "@/components/ui";
import { classifyQuestion } from "@/domain/ai/heuristics";
import { mergeKey, unresolvedReasons } from "@/domain/import/build";
import { parseAnswerKey } from "@/domain/import/parser";
import { isKeyed } from "@/domain/scoring";
import type { Question, QuestionType } from "@/domain/types";
import { useAnalysis } from "@/lib/hooks";
import { useStore } from "@/store/store";
import { useShallow } from "zustand/react/shallow";

type Filter = "all" | "unresolved" | "nokey" | "figures";

export default function ReviewPage() {
  const { analysisId } = useParams<{ analysisId: string }>();
  const a = useAnalysis(analysisId)!;
  const router = useRouter();
  const exam = useStore((s) => s.exams.find((e) => e.id === a?.examId));
  const rootId = exam?.parentExamId ?? exam?.id;
  const topics = useStore(useShallow((s) => s.topics.filter((t) => t.examId === rootId)));
  const { updateQuestion, updateQuestions, updateAnalysis, addQuestion, deleteQuestion, setStage } = useStore.getState();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [keyOpen, setKeyOpen] = useState(false);
  const [confirmUnkeyed, setConfirmUnkeyed] = useState(false);
  const [showWarnings, setShowWarnings] = useState(true);

  const ordered = useMemo(() => (a ? [...a.questions].sort((x, y) => x.index - y.index) : []), [a]);
  const reasons = useMemo(() => new Map(ordered.map((x) => [x.id, unresolvedReasons(x)])), [ordered]);
  const unresolved = ordered.filter((x) => (reasons.get(x.id) ?? []).length > 0 || !x.reviewed);
  const noKey = ordered.filter((x) => !isKeyed(x));
  const unreviewed = ordered.filter((x) => !x.reviewed);
  const visible = ordered.filter((x) => {
    if (filter === "unresolved" && !unresolved.includes(x)) return false;
    if (filter === "nokey" && isKeyed(x)) return false;
    if (filter === "figures" && !x.hasFigure) return false;
    if (q.trim()) {
      const n = q.trim().replace(/^q/i, "");
      return String(x.index) === n || String(x.number) === n || x.text.toLowerCase().includes(q.toLowerCase());
    }
    return true;
  });
  const toggleSelect = useCallback((id: string, v: boolean) => setSelected((s) => { const n = new Set(s); if (v) n.add(id); else n.delete(id); return n; }), []);
  if (!a) return null;

  const sel = [...selected].filter((id) => ordered.some((x) => x.id === id));
  const bulk = (patch: Partial<Question> | ((x: Question) => Partial<Question>), label: string) => {
    updateQuestions(a.id, sel.length ? sel : [], patch);
    toast(`${label} · ${sel.length} question${sel.length === 1 ? "" : "s"}`);
  };
  const approveAll = () => {
    const ids = ordered.filter((x) => !x.reviewed).map((x) => x.id);
    updateQuestions(a.id, ids, { reviewed: true, confidence: {} });
    toast(`Approved ${ids.length} questions`);
  };
  const suggestTopics = () => {
    let n = 0;
    updateQuestions(a.id, ordered.filter((x) => !x.chapter && x.text.length > 10).map((x) => x.id), (x) => {
      const c = classifyQuestion(x.text, x.subject || undefined, topics, exam?.subjects ?? []);
      if (!c.chapter) return {};
      n++;
      return { chapter: c.chapter, topic: c.topic ?? "", subject: x.subject || c.subject || "", confidence: { ...x.confidence, topic: c.confidence } };
    });
    toast(n ? `Suggested topics for ${n} questions — low-confidence ones are flagged for you to check` : "No confident suggestions — questions need text or a syllabus to match against", n ? "good" : "info");
  };
  const proceed = (force = false) => {
    if (noKey.length && !force) return setConfirmUnkeyed(true);
    updateQuestions(a.id, ordered.filter((x) => !x.reviewed).map((x) => x.id), { reviewed: true, confidence: {} });
    updateAnalysis(a.id, (x) => ({ ...x, reviewConfirmedAt: new Date().toISOString() }));
    setStage(a.id, "marking");
    router.push(a.finalizedAt ? `/analyzer/${a.id}/results` : `/analyzer/${a.id}/marking`);
  };
  const lowConfCount = ordered.filter((x) => !x.reviewed && Object.values(x.confidence).some((v) => v !== undefined && v < 0.75)).length;

  return (
    <div className="pb-28">
      <Callout tone="warn" icon={ShieldCheck} title="Review imported questions and answers before scoring." className="mb-4">
        Extraction is a starting point, not the truth. Check flagged fields (amber), fill any missing answers, then confirm. Nothing is scored until you do.
        {a.finalizedAt && <span className="mt-1 block font-medium text-fg">This analysis is already scored — key corrections update the score and are recorded in the audit trail.</span>}
      </Callout>

      {a.importWarnings.length > 0 && (
        <Card className="mb-4 px-4 py-3">
          <button className="flex w-full items-center justify-between text-left text-sm font-medium" onClick={() => setShowWarnings((v) => !v)} aria-expanded={showWarnings}>
            <span className="flex items-center gap-2"><TriangleAlert className="size-4 text-warn" aria-hidden />Import notes ({a.importWarnings.length})</span>
            <span className="text-xs text-fg-3">{showWarnings ? "Hide" : "Show"}</span>
          </button>
          {showWarnings && <ul className="mt-2 space-y-1 text-[13px] text-fg-2">{a.importWarnings.map((w, i) => <li key={i}>• {w}</li>)}</ul>}
        </Card>
      )}

      <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { l: "Questions", v: ordered.length },
          { l: "Need review", v: unresolved.length, tone: unresolved.length ? "text-warn" : "text-good" },
          { l: "Low confidence", v: lowConfCount, tone: lowConfCount ? "text-warn" : "" },
          { l: "Missing key", v: noKey.length, tone: noKey.length ? "text-bad" : "" },
        ].map((s) => (
          <div key={s.l} className="rounded-xl border border-border bg-surface px-4 py-2.5"><div className="text-xs text-fg-3">{s.l}</div><div className={cn("text-xl font-semibold tabular", s.tone)}>{s.v}</div></div>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented label="Filter questions" value={filter} onChange={setFilter} options={[
          { value: "all", label: "All", count: ordered.length },
          { value: "unresolved", label: "Show only unresolved", count: unresolved.length },
          { value: "nokey", label: "No key", count: noKey.length },
          { value: "figures", label: "Figures", count: ordered.filter((x) => x.hasFigure).length },
        ]} />
        <div className="relative w-44">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-fg-3" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Q number or text" className="h-8 py-1 pl-8" aria-label="Search by question number" />
        </div>
        <span className="flex-1" />
        <Button size="sm" icon={ClipboardPaste} onClick={() => setKeyOpen(true)}>Paste answer key</Button>
        <Button size="sm" icon={Wand2} onClick={suggestTopics} title="Suggest chapters from question text (you can edit every suggestion)">Suggest topics</Button>
        <Button size="sm" icon={Plus} onClick={() => { const id = addQuestion(a.id, ordered[ordered.length - 1]?.index ?? 0); setEditing(id); }}>Add question</Button>
      </div>

      {sel.length > 0 && (
        <div className="sticky top-14 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-accent/30 bg-surface px-3 py-2 shadow-md lg:top-2 animate-in">
          <span className="text-sm font-medium">{sel.length} selected</span>
          <Button size="xs" variant="soft" icon={Check} onClick={() => bulk({ reviewed: true, confidence: {} }, "Approved")}>Approve</Button>
          <Select aria-label="Set section" className="h-7 w-36 py-0 text-xs" value="" onChange={(e) => { const s = a.sections.find((x) => x.id === e.target.value); if (s) bulk({ sectionId: s.id, ...(s.subject ? { subject: s.subject } : {}) }, `Moved to ${s.name}`); }}>
            <option value="" disabled>Section…</option>{a.sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Select aria-label="Set type" className="h-7 w-36 py-0 text-xs" value="" onChange={(e) => { const t = e.target.value as QuestionType; bulk((x) => ({ type: t, correctAnswer: t === "numerical" ? [] : t === "single" ? x.correctAnswer.slice(0, 1) : x.correctAnswer, options: t === "numerical" ? [] : x.options.length ? x.options : ["A", "B", "C", "D"].map((key) => ({ key, text: "" })) }), "Type changed"); }}>
            <option value="" disabled>Type…</option><option value="single">Single correct</option><option value="multiple">Multiple correct</option><option value="numerical">Numerical</option>
          </Select>
          <ChapterBulk topics={topics.map((t) => t.chapter)} onApply={(ch) => bulk((x) => ({ chapter: ch, confidence: { ...x.confidence, topic: 1 } }), `Chapter set to ${ch}`)} />
          <Button size="xs" variant="ghost" onClick={() => bulk({ bonus: true, dropped: false }, "Marked bonus")}>Bonus</Button>
          <Button size="xs" variant="ghost" onClick={() => bulk({ dropped: true, bonus: false }, "Marked dropped")}>Drop</Button>
          <Button size="xs" variant="ghost" className="text-bad" onClick={() => { sel.forEach((id) => deleteQuestion(a.id, id)); setSelected(new Set()); toast(`Deleted ${sel.length} questions`); }}>Delete</Button>
          <Button size="xs" variant="ghost" className="ml-auto" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-surface-2 text-left text-xs text-fg-3">
              <tr>
                <th className="w-9 px-3 py-2"><input type="checkbox" aria-label="Select all visible" className="size-4 accent-[var(--accent)]" checked={visible.length > 0 && visible.every((x) => selected.has(x.id))} onChange={(e) => setSelected(e.target.checked ? new Set(visible.map((x) => x.id)) : new Set())} /></th>
                <th className="px-2 py-2 font-medium">Q</th>
                <th className="px-2 py-2 font-medium">Subject · chapter/topic</th>
                <th className="px-2 py-2 font-medium">Question preview</th>
                <th className="px-2 py-2 font-medium">Options</th>
                <th className="px-2 py-2 font-medium">Correct answer</th>
                <th className="px-2 py-2 font-medium">Type</th>
                <th className="px-2 py-2 font-medium">Confidence</th>
                <th className="px-3 py-2 text-right font-medium">Edit</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((x, i) => {
                const prev = visible[i - 1];
                const sectionChanged = !prev || prev.sectionId !== x.sectionId;
                const sec = a.sections.find((s) => s.id === x.sectionId);
                return (
                  <ReviewRowGroup key={x.id} showSection={sectionChanged} sectionName={sec?.name ?? ""}>
                    <ReviewRow q={x} aid={a.id} selected={selected.has(x.id)} onSelect={toggleSelect} onEdit={setEditing} />
                  </ReviewRowGroup>
                );
              })}
            </tbody>
          </table>
        </div>
        {!visible.length && <p className="px-5 py-10 text-center text-sm text-fg-3">{ordered.length ? "Nothing matches this filter. 🎉" : "No questions yet — add them manually."}</p>}
      </Card>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur lg:left-[248px] no-print">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-3 px-4 py-3 sm:px-6 lg:px-10">
          <div className="text-sm">
            {unresolved.length ? <><span className="font-semibold text-warn">{unreviewed.length ? `${unreviewed.length} to review` : `${noKey.length} without a key`}</span><span className="text-fg-3"> · draft autosaved</span></> : <span className="font-semibold text-good"><ListChecks className="mr-1 inline size-4" aria-hidden />All questions reviewed</span>}
          </div>
          <span className="flex-1" />
          {unreviewed.length > 0 && <Button onClick={approveAll} icon={Check}>Approve all ({unreviewed.length})</Button>}
          <Button variant="primary" iconRight={ArrowRight} disabled={!ordered.length} onClick={() => (unreviewed.length ? toast("Approve the remaining questions first — use “Approve all” once you've checked the flagged ones", "warn") : proceed())}>
            {a.finalizedAt ? "Done — back to results" : "Confirm & set marking"}
          </Button>
        </div>
      </div>

      <QuestionEditorDialog analysis={a} questionId={editing} topics={topics} onClose={() => setEditing(null)} onNavigate={setEditing}
        onSave={(id, patch) => updateQuestion(a.id, id, patch)} />
      <PasteKeyDialog open={keyOpen} onClose={() => setKeyOpen(false)} onApply={(text) => {
        const k = parseAnswerKey(text);
        if (!k.entries.length) return toast("No answers found in that text", "bad");
        const merged = mergeKey(ordered, k.entries);
        const byId = new Map(merged.questions.map((x) => [x.id, x]));
        const touched = new Set(k.entries.length >= ordered.length ? ordered.map((x) => x.id) : merged.questions.filter((x, i) => (merged.strategy === "order" ? i < k.entries.length : k.entries.some((e) => e.number === x.number))).map((x) => x.id));
        updateAnalysis(a.id, (an) => ({ ...an, questions: an.questions.map((x) => (touched.has(x.id) ? { ...byId.get(x.id)!, reviewed: false } : x)), importWarnings: [...an.importWarnings, ...k.warnings, ...merged.warnings] }));
        toast(`Applied ${touched.size} answers (matched by ${merged.strategy === "number" ? "question number" : "order"}). Please review them.`);
      }} />
      <Dialog open={confirmUnkeyed} onClose={() => setConfirmUnkeyed(false)} title={`${noKey.length} question${noKey.length === 1 ? " has" : "s have"} no answer key`} size="sm"
        footer={<><Button variant="ghost" onClick={() => { setConfirmUnkeyed(false); setFilter("nokey"); }}>Fill them in</Button><Button variant="primary" onClick={() => { setConfirmUnkeyed(false); proceed(true); }}>Continue anyway</Button></>}>
        <p className="text-sm text-fg-2">They'll be shown as “No key” and excluded from the score and accuracy until you add the answer. You can come back and add it any time — the score updates automatically.</p>
      </Dialog>
    </div>
  );
}

function ReviewRowGroup({ showSection, sectionName, children }: { showSection: boolean; sectionName: string; children: React.ReactNode }) {
  return (
    <>
      {showSection && <tr className="bg-surface-2/60"><td colSpan={9} className="px-3 py-1.5 text-xs font-semibold text-fg-2">{sectionName}</td></tr>}
      {children}
    </>
  );
}

const ReviewRow = memo(function ReviewRow({ q, aid, selected, onSelect, onEdit: onEditId }: { q: Question; aid: string; selected: boolean; onSelect: (id: string, v: boolean) => void; onEdit: (id: string) => void }) {
  const reasons = useMemo(() => unresolvedReasons(q), [q]);
  const onPatch = (p: Partial<Question>) => useStore.getState().updateQuestion(aid, q.id, p);
  const onEdit = () => onEditId(q.id);
  const low = Object.entries(q.confidence).filter(([, v]) => v !== undefined && v < 0.75) as [string, number][];
  const flagged = reasons.length > 0;
  return (
    <tr className={cn("border-t border-border align-top transition-colors", selected && "bg-accent-soft/40", !q.reviewed && flagged && "bg-warn-soft/40")}>
      <td className="px-3 py-2.5"><input type="checkbox" className="size-4 accent-[var(--accent)]" checked={selected} onChange={(e) => onSelect(q.id, e.target.checked)} aria-label={`Select Q${q.index}`} /></td>
      <td className="px-2 py-2.5 font-mono text-xs whitespace-nowrap">
        <div className="font-semibold text-fg">Q{q.index}</div>
        {q.number !== q.index && <div className={cn("text-fg-3", q.confidence.number !== undefined && q.confidence.number < 0.75 && "text-warn")}>#{q.number}</div>}
      </td>
      <td className="px-2 py-2.5">
        <div className="text-[13px] font-medium">{q.subject || <span className="text-warn">No subject</span>}</div>
        <input defaultValue={q.chapter} key={q.chapter} placeholder="Add chapter" aria-label={`Chapter for Q${q.index}`}
          onBlur={(e) => e.target.value !== q.chapter && onPatch({ chapter: e.target.value.trim(), confidence: { ...q.confidence, topic: 1 } })}
          className={cn("mt-0.5 w-40 rounded border border-transparent bg-transparent px-1 py-0.5 text-xs text-fg-2 hover:border-border focus:border-ring focus:bg-surface focus:outline-none", q.confidence.topic !== undefined && q.confidence.topic < 0.75 && !q.reviewed && "border-warn/60")} />
        {q.topic && <div className="px-1 text-[11px] text-fg-3">{q.topic}</div>}
      </td>
      <td className="max-w-[320px] px-2 py-2.5">
        <p className={cn("line-clamp-2 text-[13px] text-fg-2", !q.text && "italic text-fg-3")}>{q.text || "No text (structure only)"}</p>
        <div className="mt-1 flex flex-wrap gap-1">
          {q.hasFigure && <Badge tone="warn" icon={ImageIcon}>Figure</Badge>}
          {q.importNotes?.slice(0, 2).map((n) => <Badge key={n} tone="neutral">{n}</Badge>)}
        </div>
      </td>
      <td className="px-2 py-2.5 text-xs text-fg-3">{q.type === "numerical" ? "—" : `${q.options.length} options`}{q.options.some((o) => !o.text) && q.type !== "numerical" && q.text ? <div className="text-warn">some empty</div> : null}</td>
      <td className="px-2 py-2.5"><KeyInput q={q} onChange={onPatch} /></td>
      <td className="px-2 py-2.5">
        <select aria-label={`Type of Q${q.index}`} value={q.type} className={cn("rounded-md border border-border bg-surface px-1.5 py-1 text-xs", q.confidence.type !== undefined && q.confidence.type < 0.75 && !q.reviewed && "border-warn")}
          onChange={(e) => { const t = e.target.value as QuestionType; onPatch({ type: t, confidence: { ...q.confidence, type: 1 }, correctAnswer: t === "numerical" ? [] : t === "single" ? q.correctAnswer.slice(0, 1) : q.correctAnswer, options: t === "numerical" ? [] : q.options.length ? q.options : ["A", "B", "C", "D"].map((key) => ({ key, text: "" })) }); }}>
          <option value="single">Single</option><option value="multiple">Multiple</option><option value="numerical">Numerical</option>
        </select>
      </td>
      <td className="px-2 py-2.5">
        {q.reviewed ? <Badge tone="good" icon={Check}>Approved</Badge> : low.length ? (
          <div className="flex flex-wrap gap-1">{low.slice(0, 3).map(([f, v]) => <Badge key={f} tone="warn" title={`Extraction confidence for ${f}`}>{f} {Math.round(v * 100)}%</Badge>)}</div>
        ) : Object.keys(q.confidence).length ? <Badge tone="neutral">High</Badge> : <Badge tone="neutral">Manual</Badge>}
      </td>
      <td className="px-3 py-2.5 text-right whitespace-nowrap">
        {!q.reviewed && <button onClick={() => onPatch({ reviewed: true, confidence: {} })} className="mr-1 rounded-md p-1.5 text-fg-3 hover:bg-good-soft hover:text-good" aria-label={`Approve Q${q.index}`} title="Approve"><Check className="size-4" /></button>}
        <button onClick={onEdit} className="grid size-9 place-items-center rounded-full text-fg-3 hover:bg-surface-3 hover:text-fg" aria-label={`Edit Q${q.index}`} title="Edit"><Pencil className="size-4" /></button>
      </td>
    </tr>
  );
});

function ChapterBulk({ topics, onApply }: { topics: string[]; onApply: (ch: string) => void }) {
  const [v, setV] = useState("");
  const chapters = [...new Set(topics)];
  return (
    <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); if (v.trim()) { onApply(v.trim()); setV(""); } }}>
      <input list="bulk-ch" value={v} onChange={(e) => setV(e.target.value)} placeholder="Chapter…" aria-label="Set chapter for selected" className="field h-7 w-36 px-2 py-0 text-xs" />
      <datalist id="bulk-ch">{chapters.map((c) => <option key={c} value={c} />)}</datalist>
      <Button size="xs" type="submit" variant="ghost">Set</Button>
    </form>
  );
}

function PasteKeyDialog({ open, onClose, onApply }: { open: boolean; onClose: () => void; onApply: (t: string) => void }) {
  const [text, setText] = useState("");
  const preview = useMemo(() => (text.trim() ? parseAnswerKey(text).entries : []), [text]);
  return (
    <Dialog open={open} onClose={onClose} size="lg" title="Paste answer key" description="Matched by question number when numbers are unique, otherwise in paper order. Applied answers are marked for review."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!preview.length} icon={Sparkles} onClick={() => { onApply(text); setText(""); onClose(); }}>Apply {preview.length} answers</Button></>}>
      <Textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} className="font-mono text-xs" placeholder={"1. B  2. D  3. A,C  4. 12.5  5. bonus"} aria-label="Answer key text" autoFocus />
      {preview.length > 0 && (
        <div className="mt-3 flex max-h-32 flex-wrap gap-1 overflow-y-auto">
          {preview.map((e, i) => <Badge key={i} tone={e.bonus || e.dropped ? "accent" : "neutral"}>{e.number}: {e.bonus ? "bonus" : e.dropped ? "dropped" : e.letters.join(",") || e.value}</Badge>)}
        </div>
      )}
    </Dialog>
  );
}
