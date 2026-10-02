"use client";
/** Retry a question without seeing the key first; then reveal and record the outcome. */
import { useEffect, useState } from "react";
import { CircleCheck, CircleX, ImageIcon } from "lucide-react";
import type { OptionKey, Question } from "@/domain/types";
import { parseNumerical } from "@/domain/scoring";
import { QuestionBody } from "./question-view";
import { Badge, Button, cn, Dialog, Input } from "./ui";

export function isRetryCorrect(q: Question, selected: OptionKey[], numerical?: string): boolean {
  if (q.type === "numerical") {
    const v = parseNumerical(numerical);
    return v !== null && !!q.numericalAnswer && Math.abs(v - q.numericalAnswer.value) <= Math.max(q.numericalAnswer.tolerance, 1e-9);
  }
  const key = new Set(q.correctAnswer);
  return q.type === "single" ? selected.length === 1 && key.has(selected[0]) : selected.length === key.size && selected.every((k) => key.has(k));
}

export function RetryDialog({
  question, open, onClose, onSubmit, title, footerExtra, progress,
}: {
  question?: Question; open: boolean; onClose: () => void; onSubmit: (selected: OptionKey[], numerical: string | undefined, correct: boolean) => void;
  title?: string; footerExtra?: React.ReactNode; progress?: string;
}) {
  const [selected, setSelected] = useState<OptionKey[]>([]);
  const [num, setNum] = useState("");
  const [result, setResult] = useState<boolean | null>(null);
  useEffect(() => {
    setSelected([]);
    setNum("");
    setResult(null);
  }, [question?.id, open]);
  if (!question) return null;
  const q = question;
  const canCheck = q.type === "numerical" ? num.trim() !== "" : selected.length > 0;
  const check = () => {
    const ok = isRetryCorrect(q, selected, q.type === "numerical" ? num : undefined);
    setResult(ok);
    onSubmit(selected, q.type === "numerical" ? num : undefined, ok);
  };
  return (
    <Dialog open={open} onClose={onClose} size="lg" title={title ?? `Retry Q${q.index}`} description={[progress, `${q.subject}${q.chapter ? ` · ${q.chapter}` : ""}`].filter(Boolean).join(" · ")}
      footer={<>{footerExtra}<span className="flex-1" />{result === null ? <Button variant="primary" disabled={!canCheck} onClick={check}>Check answer</Button> : <Button variant="primary" onClick={onClose}>Done</Button>}</>}>
      {result === null ? (
        <div className="space-y-4">
          {q.text ? <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{q.text}</p> : <p className="text-sm italic text-fg-3">No question text was captured — open the original paper{q.source ? ` (${q.source.file}${q.source.page ? `, p.${q.source.page}` : ""})` : ""} and solve it again.</p>}
          {q.hasFigure && <Badge tone="warn" icon={ImageIcon}>Needs the figure from the original paper</Badge>}
          {q.type === "numerical" ? (
            <Input autoFocus inputMode="decimal" value={num} onChange={(e) => setNum(e.target.value)} placeholder="Your answer" className="max-w-48" aria-label="Your answer"
              onKeyDown={(e) => e.key === "Enter" && canCheck && check()} />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {q.options.map((o) => {
                const on = selected.includes(o.key);
                return (
                  <button key={o.key} aria-pressed={on} onClick={() => setSelected(q.type === "multiple" ? (on ? selected.filter((x) => x !== o.key) : [...selected, o.key].sort()) : [o.key])}
                    className={cn("flex items-start gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition", on ? "border-accent bg-accent-soft" : "border-border hover:border-border-strong")}>
                    <span className={cn("grid size-6 shrink-0 place-items-center rounded-md text-xs font-semibold", on ? "bg-accent text-accent-fg" : "bg-surface-3")}>{o.key}</span>
                    <span>{o.text || <span className="text-fg-3">Option {o.key}</span>}</span>
                  </button>
                );
              })}
            </div>
          )}
          {q.type === "multiple" && <p className="text-xs text-fg-3">More than one option may be correct.</p>}
        </div>
      ) : (
        <div className="space-y-4">
          <div className={cn("flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium", result ? "bg-good-soft text-good" : "bg-bad-soft text-bad")}>
            {result ? <CircleCheck className="size-4" /> : <CircleX className="size-4" />}
            {result ? "Correct this time." : "Not yet — compare with the key below and try again later."}
          </div>
          <QuestionBody q={q} r={{ questionId: q.id, selected, numerical: num, entered: true }} />
        </div>
      )}
    </Dialog>
  );
}
