"use client";
/** Read-only question rendering with the student's answer and the key highlighted. */
import { Check, ImageIcon, X } from "lucide-react";
import { formatKey, formatResponse, type QuestionResult } from "@/domain/scoring";
import type { QResponse, Question } from "@/domain/types";
import { fmtSigned } from "@/domain/util";
import { StatusChip } from "./domain";
import { Badge, cn } from "./ui";

export function QuestionBody({ q, r, showKey = true }: { q: Question; r?: QResponse; showKey?: boolean }) {
  return (
    <div className="space-y-3">
      {q.text ? <p className="text-[14px] leading-relaxed whitespace-pre-wrap text-fg">{q.text}</p> : <p className="text-sm italic text-fg-3">No question text was captured for this question{q.source ? ` — see ${q.source.file}${q.source.page ? `, page ${q.source.page}` : ""}` : ""}.</p>}
      {q.hasFigure && <Badge tone="warn" icon={ImageIcon}>Refers to a figure — check the original paper</Badge>}
      {q.type !== "numerical" && q.options.length > 0 && (
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {q.options.map((o) => {
            const mine = !!r?.selected.includes(o.key);
            const key = showKey && q.correctAnswer.includes(o.key);
            return (
              <li key={o.key} className={cn("flex items-start gap-2 rounded-lg border px-3 py-2 text-[13px]",
                key ? "border-good/50 bg-good-soft" : mine ? "border-bad/50 bg-bad-soft" : "border-border")}>
                <span className={cn("grid size-5 shrink-0 place-items-center rounded-md text-[11px] font-semibold", key ? "bg-good text-white" : mine ? "bg-bad text-white" : "bg-surface-3 text-fg-2")}>{o.key}</span>
                <span className="flex-1 text-fg">{o.text || <span className="text-fg-3">—</span>}</span>
                {mine && <span className="shrink-0 text-[11px] font-medium text-fg-2">{key ? <><Check className="inline size-3" /> Your answer</> : <><X className="inline size-3" /> Your answer</>}</span>}
                {key && !mine && <span className="shrink-0 text-[11px] font-medium text-good">Correct</span>}
              </li>
            );
          })}
        </ul>
      )}
      {q.type === "numerical" && (
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="rounded-lg border border-border px-3 py-1.5">Your answer: <b className="tabular">{formatResponse(q, r)}</b></span>
          {showKey && <span className="rounded-lg border border-good/50 bg-good-soft px-3 py-1.5">Key: <b className="tabular">{formatKey(q)}</b></span>}
        </div>
      )}
    </div>
  );
}

export function ResultLine({ q, r, res }: { q: Question; r?: QResponse; res?: QuestionResult }) {
  if (!res) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-[13px]">
      <StatusChip status={res.status} />
      <span className="text-fg-2">You: <b className="text-fg">{formatResponse(q, r)}</b></span>
      <span className="text-fg-2">Key: <b className="text-fg">{formatKey(q)}</b></span>
      <span className={cn("font-semibold tabular", res.awarded > 0 ? "text-good" : res.awarded < 0 ? "text-bad" : "text-fg-3")}>{fmtSigned(res.awarded)} marks</span>
      {res.forfeited > 0 && <span className="text-xs text-fg-3">({res.forfeited} short of full marks)</span>}
    </div>
  );
}
