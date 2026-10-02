"use client";
/** Full question editor (dialog) and compact answer-key input used in review. */
import { memo, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ImageIcon, Plus, Trash2, X } from "lucide-react";
import { RuleEditor } from "./editors";
import { Badge, Button, cn, Dialog, Field, Input, Select, Switch, Textarea } from "./ui";
import type { Analysis, Difficulty, Question, QuestionType, SyllabusTopic } from "@/domain/types";
import { OPTION_KEYS } from "@/domain/util";
import { resolveRule } from "@/domain/scoring";

/** Inline key editor: option toggles or a numeric input. Editing marks the answer as user-verified. */
export const KeyInput = memo(function KeyInput({ q, onChange, disabled }: { q: Question; onChange: (patch: Partial<Question>) => void; disabled?: boolean }) {
  const [num, setNum] = useState(q.numericalAnswer ? String(q.numericalAnswer.value) : "");
  useEffect(() => setNum(q.numericalAnswer ? String(q.numericalAnswer.value) : ""), [q.numericalAnswer]);
  if (q.bonus || q.dropped) return <Badge tone={q.bonus ? "accent" : "neutral"}>{q.bonus ? "Bonus" : "Dropped"}</Badge>;
  if (q.type === "numerical") {
    return (
      <input value={num} disabled={disabled} inputMode="decimal" aria-label={`Answer key for Q${q.index}`}
        onChange={(e) => setNum(e.target.value)}
        onBlur={() => {
          const v = Number(num);
          if (num.trim() === "") onChange({ numericalAnswer: undefined, confidence: { ...q.confidence, answer: 0 } });
          else if (Number.isFinite(v) && v !== q.numericalAnswer?.value) onChange({ numericalAnswer: { value: v, tolerance: q.numericalAnswer?.tolerance ?? 0 }, confidence: { ...q.confidence, answer: 1 } });
        }}
        className={cn("field h-7 w-20 px-2 py-0 text-xs tabular", !q.numericalAnswer && "border-warn")} placeholder="value" />
    );
  }
  const keys = q.options.length ? q.options.map((o) => o.key) : OPTION_KEYS.slice(0, 4);
  return (
    <div className="flex gap-0.5" role="group" aria-label={`Answer key for Q${q.index}`}>
      {keys.map((k) => {
        const on = q.correctAnswer.includes(k);
        return (
          <button key={k} disabled={disabled} aria-pressed={on} aria-label={`Key ${k}`}
            onClick={() => {
              const next = q.type === "multiple" ? (on ? q.correctAnswer.filter((x) => x !== k) : [...q.correctAnswer, k].sort()) : on ? [] : [k];
              onChange({ correctAnswer: next, confidence: { ...q.confidence, answer: 1 } });
            }}
            className={cn("grid size-6 place-items-center rounded-md border text-[11px] font-semibold transition",
              on ? "border-good bg-good text-white" : "border-border-strong text-fg-3 hover:border-fg-3 hover:text-fg", !q.correctAnswer.length && "border-warn")}>
            {k}
          </button>
        );
      })}
    </div>
  );
});

export function QuestionEditorDialog({
  analysis, questionId, onClose, onNavigate, topics, onSave,
}: {
  analysis: Analysis; questionId: string | null; onClose: () => void; onNavigate: (id: string) => void; topics: SyllabusTopic[]; onSave: (id: string, patch: Partial<Question>) => void;
}) {
  const ordered = [...analysis.questions].sort((a, b) => a.index - b.index);
  const i = ordered.findIndex((q) => q.id === questionId);
  const q = ordered[i];
  const [draft, setDraft] = useState<Question | null>(q ?? null);
  useEffect(() => setDraft(q ?? null), [questionId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!q || !draft) return <Dialog open={false} onClose={onClose} title="" />;

  const set = (patch: Partial<Question>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const save = (approve: boolean) => {
    const { id: _id, index: _i, ...rest } = draft;
    onSave(q.id, { ...rest, reviewed: approve ? true : draft.reviewed, confidence: approve ? {} : draft.confidence });
  };
  const go = (dir: -1 | 1) => {
    save(false);
    const next = ordered[i + dir];
    if (next) onNavigate(next.id);
  };
  const chapters = [...new Set(topics.filter((t) => t.subject === draft.subject).map((t) => t.chapter))];
  const topicNames = topics.filter((t) => t.subject === draft.subject && t.chapter === draft.chapter).map((t) => t.topic);
  const rule = resolveRule(draft, analysis.sections);

  return (
    <Dialog open onClose={() => { save(false); onClose(); }} size="xl" title={`Question ${q.index}${q.number !== q.index ? ` (printed as ${q.number})` : ""}`}
      description={q.source ? `From ${q.source.file}${q.source.page ? `, page ${q.source.page}` : ""}` : "Added manually"}
      footer={<>
        <Button variant="ghost" icon={ChevronLeft} disabled={i === 0} onClick={() => go(-1)}>Previous</Button>
        <Button variant="ghost" iconRight={ChevronRight} disabled={i === ordered.length - 1} onClick={() => go(1)}>Next</Button>
        <span className="flex-1" />
        <Button onClick={() => { save(false); onClose(); }}>Save</Button>
        <Button variant="primary" onClick={() => { save(true); const next = ordered[i + 1]; if (next) onNavigate(next.id); else onClose(); }}>Approve & next</Button>
      </>}>
      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          {q.importNotes?.length ? <div className="flex flex-wrap gap-1.5">{q.importNotes.map((n) => <Badge key={n} tone="warn">{n}</Badge>)}</div> : null}
          <Field label="Question text" htmlFor="qe-text" hint={draft.hasFigure ? "This question references a figure or equation that text extraction can't capture — check the original." : undefined}>
            <Textarea id="qe-text" rows={4} value={draft.text} onChange={(e) => set({ text: e.target.value })} placeholder="Optional — add it to make the Question Bank and retries more useful" />
          </Field>
          <label className="flex items-center gap-2 text-sm text-fg-2"><input type="checkbox" className="size-4 accent-[var(--accent)]" checked={!!draft.hasFigure} onChange={(e) => set({ hasFigure: e.target.checked })} /><ImageIcon className="size-4" aria-hidden />Has a figure / equation image</label>
          {draft.type !== "numerical" && (
            <div>
              <div className="label">Options (tick the correct answer{draft.type === "multiple" ? "s" : ""})</div>
              <div className="space-y-2">
                {draft.options.map((o, j) => {
                  const on = draft.correctAnswer.includes(o.key);
                  return (
                    <div key={o.key} className="flex items-center gap-2">
                      <button aria-pressed={on} aria-label={`Mark ${o.key} correct`}
                        onClick={() => set({ correctAnswer: draft.type === "multiple" ? (on ? draft.correctAnswer.filter((k) => k !== o.key) : [...draft.correctAnswer, o.key].sort()) : on ? [] : [o.key] })}
                        className={cn("grid size-8 shrink-0 place-items-center rounded-lg border text-sm font-semibold", on ? "border-good bg-good text-white" : "border-border-strong text-fg-2 hover:border-fg-3")}>{o.key}</button>
                      <Input value={o.text} aria-label={`Option ${o.key} text`} onChange={(e) => set({ options: draft.options.map((x, k) => (k === j ? { ...x, text: e.target.value } : x)) })} placeholder={`Option ${o.key}`} />
                      <Button variant="ghost" size="sm" icon={Trash2} aria-label={`Remove option ${o.key}`} disabled={draft.options.length <= 2}
                        onClick={() => { const opts = draft.options.filter((_, k) => k !== j).map((x, k) => ({ ...x, key: OPTION_KEYS[k] })); set({ options: opts, correctAnswer: [] }); }} />
                    </div>
                  );
                })}
                {draft.options.length < 6 && <Button size="sm" variant="ghost" icon={Plus} onClick={() => set({ options: [...draft.options, { key: OPTION_KEYS[draft.options.length], text: "" }] })}>Add option</Button>}
              </div>
            </div>
          )}
          {draft.type === "numerical" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Correct value" htmlFor="qe-num"><Input id="qe-num" type="number" step="any" value={draft.numericalAnswer?.value ?? ""} onChange={(e) => set({ numericalAnswer: e.target.value === "" ? undefined : { value: Number(e.target.value), tolerance: draft.numericalAnswer?.tolerance ?? 0 } })} /></Field>
              <Field label="Accepted tolerance (±)" htmlFor="qe-tol"><Input id="qe-tol" type="number" step="any" min={0} value={draft.numericalAnswer?.tolerance ?? 0} onChange={(e) => draft.numericalAnswer && set({ numericalAnswer: { ...draft.numericalAnswer, tolerance: Math.max(0, Number(e.target.value)) } })} /></Field>
            </div>
          )}
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Printed no." htmlFor="qe-no"><Input id="qe-no" type="number" value={draft.number} onChange={(e) => set({ number: Number(e.target.value) })} /></Field>
            <Field label="Type" htmlFor="qe-type">
              <Select id="qe-type" value={draft.type} onChange={(e) => {
                const t = e.target.value as QuestionType;
                set({ type: t, options: t === "numerical" ? [] : draft.options.length ? draft.options : OPTION_KEYS.slice(0, 4).map((key) => ({ key, text: "" })), correctAnswer: t === "single" ? draft.correctAnswer.slice(0, 1) : t === "numerical" ? [] : draft.correctAnswer });
              }}>
                <option value="single">Single correct</option><option value="multiple">Multiple correct</option><option value="numerical">Numerical</option>
              </Select>
            </Field>
          </div>
          <Field label="Section" htmlFor="qe-sec">
            <Select id="qe-sec" value={draft.sectionId} onChange={(e) => set({ sectionId: e.target.value })}>{analysis.sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
          </Field>
          <Field label="Subject" htmlFor="qe-subj"><Input id="qe-subj" list="qe-subjects" value={draft.subject} onChange={(e) => set({ subject: e.target.value })} /></Field>
          <datalist id="qe-subjects">{[...new Set(topics.map((t) => t.subject))].map((s) => <option key={s} value={s} />)}</datalist>
          <Field label="Chapter" htmlFor="qe-ch"><Input id="qe-ch" list="qe-chapters" value={draft.chapter} onChange={(e) => set({ chapter: e.target.value })} /></Field>
          <datalist id="qe-chapters">{chapters.map((s) => <option key={s} value={s} />)}</datalist>
          <Field label="Topic" htmlFor="qe-topic"><Input id="qe-topic" list="qe-topics" value={draft.topic} onChange={(e) => set({ topic: e.target.value })} /></Field>
          <datalist id="qe-topics">{topicNames.map((s) => <option key={s} value={s} />)}</datalist>
          <Field label="Difficulty" htmlFor="qe-diff">
            <Select id="qe-diff" value={draft.difficulty ?? ""} onChange={(e) => set({ difficulty: (e.target.value || undefined) as Difficulty | undefined })}>
              <option value="">Not set</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
            </Select>
          </Field>
          <div className="space-y-2 rounded-lg border border-border p-3">
            <Switch checked={!!draft.bonus} onChange={(v) => set({ bonus: v, dropped: v ? false : draft.dropped })} label="Bonus" description="Full marks for everyone" />
            <Switch checked={!!draft.dropped} onChange={(v) => set({ dropped: v, bonus: v ? false : draft.bonus })} label="Dropped" description="Removed from scoring" />
          </div>
          <details className="rounded-lg border border-border p-3" open={!!draft.ruleOverride}>
            <summary className="text-sm font-medium">Question-specific marking</summary>
            <p className="mt-1 mb-2 text-xs text-fg-3">Currently +{rule.correct} / −{rule.wrong} / {rule.unattempted}{draft.ruleOverride ? " (override)" : " from its section"}.</p>
            {draft.ruleOverride ? (
              <>
                <RuleEditor idPrefix="qe-rule" rule={rule} onChange={(r) => set({ ruleOverride: r })} allowPartial={draft.type === "multiple"} />
                <Button size="xs" variant="ghost" icon={X} className="mt-2" onClick={() => set({ ruleOverride: undefined })}>Remove override</Button>
              </>
            ) : <Button size="xs" onClick={() => set({ ruleOverride: { ...rule } })}>Override marking</Button>}
          </details>
        </div>
      </div>
    </Dialog>
  );
}
