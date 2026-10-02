"use client";
import { useParams, useRouter } from "next/navigation";
import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ClipboardPaste, Dices, Keyboard, LayoutGrid, List, Lock, SkipForward, Timer, Unlock } from "lucide-react";
import { Badge, Button, Callout, Card, cn, Dialog, Kbd, ProgressBar, Segmented, Switch, Textarea, toast } from "@/components/ui";
import { parseAnswerKey } from "@/domain/import/parser";
import type { QResponse, Question } from "@/domain/types";
import { OPTION_KEYS } from "@/domain/util";
import { useAnalysis, useHotkeys } from "@/lib/hooks";
import { useStore } from "@/store/store";

type Mode = "grid" | "list";

export default function AnswersPage() {
  const { analysisId } = useParams<{ analysisId: string }>();
  const a = useAnalysis(analysisId)!;
  const router = useRouter();
  const { setResponse, setResponses, finalizeAnalysis, unlockAnalysis, setStage } = useStore.getState();
  const [mode, setMode] = useState<Mode>("grid");
  const [active, setActive] = useState(0);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  const ordered = useMemo(() => (a ? [...a.questions].filter((q) => !q.dropped).sort((x, y) => x.index - y.index) : []), [a]);
  const locked = !!a?.locked;
  const entered = ordered.filter((q) => a.responses[q.id]?.entered).length;
  const firstEmpty = ordered.findIndex((q) => !a.responses[q.id]?.entered);

  const cols = () => {
    const el = gridRef.current;
    if (!el) return 1;
    return getComputedStyle(el).gridTemplateColumns.split(" ").length || 1;
  };
  const focusCell = useCallback((i: number) => {
    const n = Math.max(0, Math.min(ordered.length - 1, i));
    setActive(n);
    const el = document.getElementById(`cell-${ordered[n]?.id}`);
    el?.scrollIntoView({ block: "nearest" });
  }, [ordered]);

  const answer = useCallback((q: Question, patch: Partial<QResponse>, advance = false) => {
    if (useStore.getState().analyses.find((x) => x.id === analysisId)?.locked) {
      toast("Answers are locked. Unlock them first.", "warn");
      return;
    }
    setResponse(analysisId, q.id, { entered: true, ...patch });
    if (advance && autoAdvance) setActive((i) => Math.min(ordered.length - 1, i + 1));
  }, [analysisId, autoAdvance, ordered.length, setResponse]);

  useEffect(() => {
    if (firstEmpty > 0 && active === 0) setActive(firstEmpty);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    document.getElementById(`cell-${ordered[active]?.id}`)?.scrollIntoView({ block: "nearest" });
  }, [active, ordered]);

  useHotkeys((e) => {
    if (mode !== "grid" || helpOpen || pasteOpen || confirmOpen) return;
    const q = ordered[active];
    if (!q) return;
    const r = a.responses[q.id];
    const k = e.key;
    const optionIdx = /^[a-f]$/i.test(k) ? k.toUpperCase().charCodeAt(0) - 65 : /^[1-6]$/.test(k) ? Number(k) - 1 : -1;
    if (k === "ArrowRight") { e.preventDefault(); focusCell(active + 1); }
    else if (k === "ArrowLeft") { e.preventDefault(); focusCell(active - 1); }
    else if (k === "ArrowDown") { e.preventDefault(); focusCell(active + cols()); }
    else if (k === "ArrowUp") { e.preventDefault(); focusCell(active - cols()); }
    else if (k === "Enter" || k === " ") { e.preventDefault(); focusCell(active + 1); }
    else if (k === "n" || k === "N") { e.preventDefault(); const i = ordered.findIndex((x, j) => j > active && !a.responses[x.id]?.entered); focusCell(i >= 0 ? i : ordered.findIndex((x) => !a.responses[x.id]?.entered)); }
    else if (k === "?" ) { setHelpOpen(true); }
    else if (["0", "x", "X", "-", "Backspace", "Delete"].includes(k)) { e.preventDefault(); answer(q, { selected: [], numerical: "" }, true); }
    else if (k === "g" || k === "G") { answer(q, { guessed: !r?.guessed, entered: r?.entered ?? false }); }
    else if (k === "t" || k === "T") { answer(q, { outOfTime: !r?.outOfTime, entered: r?.entered ?? false }); }
    else if (q.type === "numerical" && /^[0-9.\-]$/.test(k)) { document.getElementById(`num-${q.id}`)?.focus(); }
    else if (optionIdx >= 0 && q.type !== "numerical" && optionIdx < q.options.length) {
      e.preventDefault();
      const key = OPTION_KEYS[optionIdx];
      if (q.type === "multiple") {
        const cur = r?.selected ?? [];
        answer(q, { selected: cur.includes(key) ? cur.filter((x) => x !== key) : [...cur, key].sort() });
      } else answer(q, { selected: [key] }, true);
    }
  }, [mode, active, ordered, a, helpOpen, pasteOpen, confirmOpen, answer, focusCell]);

  if (!a) return null;

  const calculate = (fillBlank: boolean) => {
    if (fillBlank) {
      const patches: Record<string, Partial<QResponse>> = {};
      for (const q of ordered) if (!a.responses[q.id]?.entered) patches[q.id] = { entered: true, selected: [], numerical: "" };
      if (Object.keys(patches).length) setResponses(a.id, patches);
    }
    updateAnswersConfirmed();
    const change = finalizeAnalysis(a.id);
    setStage(a.id, "results");
    toast(change ? `Results ready. Student OS updated your plan: ${change.summary}` : "Results ready.", "good", undefined, 6000);
    router.push(`/analyzer/${a.id}/results`);
  };
  const updateAnswersConfirmed = () => useStore.getState().updateAnalysis(a.id, (x) => ({ ...x, answersConfirmedAt: new Date().toISOString() }));
  const onCalculate = () => (entered < ordered.length ? setConfirmOpen(true) : calculate(false));

  return (
    <div className="pb-24">
      {locked ? (
        <Callout tone="warn" icon={Lock} className="mb-4" title="Answers are locked because results have been calculated"
          action={<Button size="sm" icon={Unlock} onClick={() => { unlockAnalysis(a.id); toast("Unlocked. Changes are logged and the score updates live.", "info"); }}>Unlock to edit</Button>}>
          This prevents accidental changes. If you entered something wrong, unlock — every change is recorded in the audit trail.
        </Callout>
      ) : (
        <Callout icon={Keyboard} className="mb-4" title="Fast entry: click, or use the keyboard"
          action={<Button size="sm" variant="ghost" onClick={() => setHelpOpen(true)}>All shortcuts</Button>}>
          <span className="inline-flex flex-wrap items-center gap-1.5"><Kbd>A</Kbd>–<Kbd>D</Kbd> or <Kbd>1</Kbd>–<Kbd>4</Kbd> answer · <Kbd>0</Kbd>/<Kbd>X</Kbd> unattempted · <Kbd>G</Kbd> guessed · <Kbd>T</Kbd> ran out of time · arrows move · <Kbd>N</Kbd> next empty</span>
        </Callout>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex min-w-60 flex-1 items-center gap-3">
          <ProgressBar value={ordered.length ? entered / ordered.length : 0} label="Answers entered" className="max-w-xs" />
          <span className="text-sm text-fg-2 tabular"><b className="text-fg">{entered}</b>/{ordered.length} entered</span>
        </div>
        <Segmented label="Layout" value={mode} onChange={setMode} options={[{ value: "grid", label: <><LayoutGrid className="size-3.5" />Grid</> }, { value: "list", label: <><List className="size-3.5" />Detailed</> }]} />
        <div className="w-44"><Switch checked={autoAdvance} onChange={setAutoAdvance} label="Auto-advance" /></div>
        <Button size="sm" icon={SkipForward} disabled={firstEmpty < 0} onClick={() => focusCell(firstEmpty)}>Next empty</Button>
        <Button size="sm" icon={ClipboardPaste} disabled={locked} onClick={() => setPasteOpen(true)}>Paste answers</Button>
      </div>

      {mode === "grid" ? (
        <div ref={gridRef} className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(196px, 1fr))" }} role="grid" aria-label="Answer grid">
          {ordered.map((q, i) => (
            <Cell key={q.id} q={q} r={a.responses[q.id]} active={i === active} locked={locked} index={i} onActivate={setActive} onAnswer={answer} />
          ))}
        </div>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-surface-2 text-left text-xs text-fg-3"><tr>
              <th className="px-4 py-2 font-medium">Q</th><th className="px-2 py-2 font-medium">Question</th><th className="px-2 py-2 font-medium">Your answer</th>
              <th className="px-2 py-2 font-medium" title="I guessed this">Guessed</th><th className="px-2 py-2 font-medium" title="I ran out of time">Out of time</th><th className="px-4 py-2 font-medium">Time spent (min)</th>
            </tr></thead>
            <tbody>
              {ordered.map((q) => <ListRow key={q.id} q={q} r={a.responses[q.id]} locked={locked} onAnswer={answer} />)}
            </tbody>
          </table>
        </Card>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur lg:left-[248px] no-print">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-3 px-4 py-3 sm:px-6 lg:px-10">
          <span className="text-sm text-fg-2">{entered < ordered.length ? `${ordered.length - entered} not entered yet` : "Every question has an entry"} · autosaved</span>
          <span className="flex-1" />
          {!locked && entered < ordered.length && (
            <Button onClick={() => { const patches: Record<string, Partial<QResponse>> = {}; for (const q of ordered) if (!a.responses[q.id]?.entered) patches[q.id] = { entered: true, selected: [], numerical: "" }; setResponses(a.id, patches); toast(`Marked ${Object.keys(patches).length} as unattempted`); }}>
              Mark remaining unattempted
            </Button>
          )}
          <Button variant="primary" iconRight={ArrowRight} onClick={a.finalizedAt ? () => { useStore.getState().updateAnalysis(a.id, (x) => ({ ...x, locked: true })); router.push(`/analyzer/${a.id}/results`); } : onCalculate}>
            {a.finalizedAt ? "Back to results" : "Calculate results"}
          </Button>
        </div>
      </div>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} size="sm" title={`${ordered.length - entered} questions have no entry`}
        footer={<><Button variant="ghost" onClick={() => { setConfirmOpen(false); focusCell(firstEmpty); }}>Go to first one</Button><Button variant="primary" onClick={() => { setConfirmOpen(false); calculate(true); }}>Treat as unattempted & calculate</Button></>}>
        <p className="text-sm text-fg-2">We won't guess. Either go back and enter them, or confirm you left them blank in the exam.</p>
      </Dialog>
      <Dialog open={helpOpen} onClose={() => setHelpOpen(false)} title="Keyboard shortcuts" size="sm">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          {[["A–D or 1–4", "Select option (toggles on multiple-correct)"], ["0, X, −, ⌫", "Mark unattempted"], ["G", "Toggle “I guessed this”"], ["T", "Toggle “I ran out of time”"], ["← → ↑ ↓", "Move between questions"], ["Enter / Space", "Next question"], ["N", "Jump to next empty"], ["digits", "Type into a numerical answer (Enter to confirm)"]].map(([k, v]) => (
            <Fragment key={k}><dt className="font-mono text-xs text-fg"><Kbd>{k}</Kbd></dt><dd className="text-fg-2">{v}</dd></Fragment>
          ))}
        </dl>
        <p className="mt-3 text-xs text-fg-3">Clicking an already-selected option never clears it — use “—” to mark unattempted. This avoids accidental changes.</p>
      </Dialog>
      <PasteAnswersDialog open={pasteOpen} onClose={() => setPasteOpen(false)} questions={ordered} onApply={(patches) => { setResponses(a.id, patches); toast(`Filled ${Object.keys(patches).length} answers — check a few before calculating`); }} />
    </div>
  );
}

const Cell = memo(function Cell({ q, r, active, locked, index, onActivate, onAnswer }: {
  q: Question; r?: QResponse; active: boolean; locked: boolean; index: number; onActivate: (i: number) => void; onAnswer: (q: Question, p: Partial<QResponse>, adv?: boolean) => void;
}) {
  const entered = !!r?.entered;
  const blank = entered && (q.type === "numerical" ? !(r?.numerical ?? "").trim() : !r?.selected.length);
  const [num, setNum] = useState(r?.numerical ?? "");
  useEffect(() => setNum(r?.numerical ?? ""), [r?.numerical]);
  return (
    <div id={`cell-${q.id}`} role="gridcell" aria-selected={active} onClick={() => onActivate(index)}
      className={cn("rounded-xl border bg-surface px-2.5 py-2 transition",
        active ? "border-accent ring-2 ring-accent/25" : entered ? "border-border" : "border-dashed border-border-strong",
        blank && "bg-surface-2", locked && "opacity-80")}>
      <div className="mb-1.5 flex items-center gap-1.5 text-xs">
        <span className="font-mono font-semibold text-fg">Q{q.index}</span>
        <span className="truncate text-fg-3">{q.subject?.slice(0, 4)}{q.type === "multiple" ? " · multi" : q.type === "numerical" ? " · num" : ""}</span>
        <span className="ml-auto flex gap-1">
          <button disabled={locked} onClick={(e) => { e.stopPropagation(); onAnswer(q, { guessed: !r?.guessed, entered: r?.entered ?? false }); }} aria-pressed={!!r?.guessed} title="I guessed this (G)" aria-label={`Q${q.index}: I guessed this`}
            className={cn("grid size-5 place-items-center rounded", r?.guessed ? "bg-warn-soft text-warn" : "text-fg-3/60 hover:text-fg-3")}><Dices className="size-3.5" /></button>
          <button disabled={locked} onClick={(e) => { e.stopPropagation(); onAnswer(q, { outOfTime: !r?.outOfTime, entered: r?.entered ?? false }); }} aria-pressed={!!r?.outOfTime} title="I ran out of time (T)" aria-label={`Q${q.index}: I ran out of time`}
            className={cn("grid size-5 place-items-center rounded", r?.outOfTime ? "bg-warn-soft text-warn" : "text-fg-3/60 hover:text-fg-3")}><Timer className="size-3.5" /></button>
        </span>
      </div>
      <div className="flex items-center gap-1">
        {q.type === "numerical" ? (
          <input id={`num-${q.id}`} disabled={locked} value={num} inputMode="decimal" placeholder="Answer" aria-label={`Q${q.index} numerical answer`}
            onFocus={() => onActivate(index)}
            onChange={(e) => setNum(e.target.value)}
            onBlur={() => num !== (r?.numerical ?? "") && onAnswer(q, { numerical: num.trim(), selected: [] })}
            onKeyDown={(e) => { if (e.key === "Enter") { (e.target as HTMLInputElement).blur(); onAnswer(q, { numerical: num.trim(), selected: [] }, true); } if (e.key === "Escape") (e.target as HTMLInputElement).blur(); }}
            className="field h-8 flex-1 px-2 py-0 text-sm tabular" />
        ) : (
          q.options.map((o) => {
            const on = !!r?.selected.includes(o.key);
            return (
              <button key={o.key} disabled={locked} aria-pressed={on} aria-label={`Q${q.index} option ${o.key}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onActivate(index);
                  if (q.type === "multiple") onAnswer(q, { selected: on ? (r?.selected ?? []).filter((x) => x !== o.key) : [...(r?.selected ?? []), o.key].sort() });
                  else if (!on) onAnswer(q, { selected: [o.key] }, true);
                }}
                className={cn("h-8 min-w-8 flex-1 rounded-lg border text-[13px] font-semibold transition",
                  on ? "border-accent bg-accent text-accent-fg" : "border-border-strong text-fg-2 hover:border-fg-3 hover:text-fg")}>
                {o.key}
              </button>
            );
          })
        )}
        <button disabled={locked} aria-pressed={blank} aria-label={`Q${q.index} unattempted`} title="Unattempted (0)"
          onClick={(e) => { e.stopPropagation(); onActivate(index); onAnswer(q, { selected: [], numerical: "" }, true); }}
          className={cn("h-8 w-8 shrink-0 rounded-lg border text-sm font-semibold transition", blank ? "border-muted-status bg-muted-status text-white" : "border-border text-fg-3 hover:border-fg-3")}>—</button>
      </div>
    </div>
  );
});

const ListRow = memo(function ListRow({ q, r, locked, onAnswer }: { q: Question; r?: QResponse; locked: boolean; onAnswer: (q: Question, p: Partial<QResponse>, adv?: boolean) => void }) {
  const [num, setNum] = useState(r?.numerical ?? "");
  const [mins, setMins] = useState(r?.timeSpentSec ? String(Math.round((r.timeSpentSec / 60) * 10) / 10) : "");
  const blank = r?.entered && (q.type === "numerical" ? !(r.numerical ?? "").trim() : !r.selected.length);
  return (
    <tr className="border-t border-border align-top">
      <td className="px-4 py-2.5 font-mono text-xs font-semibold">Q{q.index}</td>
      <td className="max-w-md px-2 py-2.5"><p className="line-clamp-2 text-[13px] text-fg-2">{q.text || <span className="italic text-fg-3">{q.subject}{q.chapter ? ` · ${q.chapter}` : ""}</span>}</p></td>
      <td className="px-2 py-2.5">
        <div className="flex items-center gap-1">
          {q.type === "numerical" ? (
            <input disabled={locked} value={num} onChange={(e) => setNum(e.target.value)} onBlur={() => num !== (r?.numerical ?? "") && onAnswer(q, { numerical: num.trim(), selected: [] })} className="field h-8 w-28 px-2 py-0 tabular" aria-label={`Q${q.index} numerical answer`} />
          ) : q.options.map((o) => {
            const on = !!r?.selected.includes(o.key);
            return <button key={o.key} disabled={locked} aria-pressed={on} onClick={() => q.type === "multiple" ? onAnswer(q, { selected: on ? r!.selected.filter((x) => x !== o.key) : [...(r?.selected ?? []), o.key].sort() }) : !on && onAnswer(q, { selected: [o.key] })}
              className={cn("size-8 rounded-lg border text-[13px] font-semibold", on ? "border-accent bg-accent text-accent-fg" : "border-border-strong text-fg-2 hover:border-fg-3")} aria-label={`Q${q.index} option ${o.key}`}>{o.key}</button>;
          })}
          <button disabled={locked} aria-pressed={!!blank} onClick={() => onAnswer(q, { selected: [], numerical: "" })} aria-label={`Q${q.index} unattempted`} className={cn("size-8 rounded-lg border font-semibold", blank ? "border-muted-status bg-muted-status text-white" : "border-border text-fg-3")}>—</button>
          {!r?.entered && <Badge tone="warn">Not entered</Badge>}
        </div>
      </td>
      <td className="px-2 py-2.5"><input type="checkbox" disabled={locked} className="size-4 accent-[var(--accent)]" checked={!!r?.guessed} onChange={(e) => onAnswer(q, { guessed: e.target.checked, entered: r?.entered ?? false })} aria-label={`Q${q.index} guessed`} /></td>
      <td className="px-2 py-2.5"><input type="checkbox" disabled={locked} className="size-4 accent-[var(--accent)]" checked={!!r?.outOfTime} onChange={(e) => onAnswer(q, { outOfTime: e.target.checked, entered: r?.entered ?? false })} aria-label={`Q${q.index} ran out of time`} /></td>
      <td className="px-4 py-2.5"><input value={mins} inputMode="decimal" onChange={(e) => setMins(e.target.value)} onBlur={() => { const v = Number(mins); onAnswer(q, { timeSpentSec: mins.trim() && Number.isFinite(v) ? Math.round(v * 60) : undefined, entered: r?.entered ?? false }); }} className="field h-8 w-20 px-2 py-0 tabular" aria-label={`Q${q.index} time spent in minutes`} placeholder="—" /></td>
    </tr>
  );
});

function PasteAnswersDialog({ open, onClose, questions, onApply }: { open: boolean; onClose: () => void; questions: Question[]; onApply: (p: Record<string, Partial<QResponse>>) => void }) {
  const [text, setText] = useState("");
  const patches = useMemo(() => {
    const out: Record<string, Partial<QResponse>> = {};
    const t = text.trim();
    if (!t) return out;
    if (/^[A-Fa-f0\-xX. ]+$/.test(t) && !/\d{2}/.test(t)) {
      // Compact string: one character per question.
      const chars = t.replace(/\s+/g, "").split("");
      chars.forEach((c, i) => {
        const q = questions[i];
        if (!q || q.type === "numerical") return;
        out[q.id] = /[a-f]/i.test(c) ? { entered: true, selected: [c.toUpperCase()] } : { entered: true, selected: [] };
      });
      return out;
    }
    const entries = parseAnswerKey(t).entries;
    const byNumber = new Map(entries.map((e) => [e.number, e]));
    for (const q of questions) {
      const e = byNumber.get(q.index);
      if (!e) continue;
      if (q.type === "numerical") out[q.id] = { entered: true, numerical: e.value !== undefined ? String(e.value) : "", selected: [] };
      else out[q.id] = { entered: true, selected: e.letters.filter((l) => q.options.some((o) => o.key === l)) };
    }
    return out;
  }, [text, questions]);
  const n = Object.keys(patches).length;
  return (
    <Dialog open={open} onClose={onClose} size="lg" title="Paste your answers" description="Either one character per question (e.g. “BCDA-ABD…” where “-” or “0” is unattempted), or numbered like “1 B 2 C 3 A,D 4 12.5”."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!n} onClick={() => { onApply(patches); setText(""); onClose(); }}>Fill {n} answers</Button></>}>
      <Textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} className="font-mono text-xs" aria-label="Answers text" autoFocus placeholder="BCDAB-ACDD…" />
      <p className="mt-2 text-xs text-fg-3">{n ? `${n} of ${questions.length} questions will be filled. Existing entries for those questions are replaced.` : "Nothing recognised yet."}</p>
    </Dialog>
  );
}
