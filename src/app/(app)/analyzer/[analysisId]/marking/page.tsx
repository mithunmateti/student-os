"use client";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowRight, Scale, Trash2 } from "lucide-react";
import { MarkingSchemeEditor, RuleEditor } from "@/components/editors";
import { Badge, Button, Callout, Card, CardHeader, Input, Stat, toast } from "@/components/ui";
import { describeRule, resolveRule, scorePaper } from "@/domain/scoring";
import { fmtNum } from "@/domain/util";
import { useAnalysis } from "@/lib/hooks";
import { useStore } from "@/store/store";

export default function MarkingPage() {
  const { analysisId } = useParams<{ analysisId: string }>();
  const a = useAnalysis(analysisId)!;
  const router = useRouter();
  const exam = useStore((s) => s.exams.find((e) => e.id === a?.examId));
  const { updateAnalysis, updateQuestion, setStage, updateExam, setSections } = useStore.getState();
  const [overrideQ, setOverrideQ] = useState("");
  const counts = useMemo(() => Object.fromEntries((a?.sections ?? []).map((s) => [s.id, a.questions.filter((q) => q.sectionId === s.id).length])), [a]);
  const summary = useMemo(() => (a ? scorePaper(a.sections, a.questions, {}) : null), [a]);
  if (!a || !summary) return null;
  const overrides = a.questions.filter((q) => q.ruleOverride).sort((x, y) => x.index - y.index);
  const orphan = a.questions.filter((q) => !a.sections.some((s) => s.id === q.sectionId));
  const subjects = [...new Set([...(exam?.subjects ?? []), ...a.questions.map((q) => q.subject).filter(Boolean)])];

  const confirm = () => {
    if (orphan.length) {
      updateAnalysis(a.id, (x) => ({ ...x, questions: x.questions.map((q) => (x.sections.some((s) => s.id === q.sectionId) ? q : { ...q, sectionId: x.sections[0].id })) }));
    }
    updateAnalysis(a.id, (x) => ({ ...x, markingConfirmedAt: new Date().toISOString() }));
    setStage(a.id, "answers");
    router.push(a.finalizedAt ? `/analyzer/${a.id}/results` : `/analyzer/${a.id}/answers`);
  };

  return (
    <div className="space-y-6">
      <Callout icon={Scale} title="Confirm how this paper is marked">
        Nothing is assumed: set marks for correct, wrong and unattempted answers per section — decimals like −0.25 are fine. Multiple-correct sections can award partial credit.
        {a.finalizedAt && <span className="mt-1 block font-medium text-fg">Already scored — changes here recalculate the score and are logged in the audit trail.</span>}
      </Callout>
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="Sections" subtitle="Each question belongs to a section; its rule applies unless the question has its own override." />
            <div className="px-5 pb-5">
              <MarkingSchemeEditor sections={a.sections} subjects={subjects} questionCounts={counts}
                onChange={(sections) => setSections(a.id, sections)} />
              {orphan.length > 0 && <p className="mt-3 text-xs text-warn">{orphan.length} questions belong to a removed section and will move to “{a.sections[0]?.name}” when you confirm.</p>}
            </div>
          </Card>
          <Card>
            <CardHeader title="Question-specific marking" subtitle="For questions with special rules (e.g. a bonus-style +2, or no penalty on one question)." />
            <div className="space-y-3 px-5 pb-5">
              {overrides.map((q) => (
                <div key={q.id} className="rounded-xl border border-border p-3">
                  <div className="mb-2 flex items-center justify-between"><span className="text-sm font-semibold">Q{q.index}</span>
                    <Button size="xs" variant="ghost" icon={Trash2} className="text-bad" onClick={() => updateQuestion(a.id, q.id, { ruleOverride: undefined })}>Remove</Button></div>
                  <RuleEditor idPrefix={`ov-${q.id}`} rule={resolveRule(q, a.sections)} onChange={(r) => updateQuestion(a.id, q.id, { ruleOverride: r })} allowPartial={q.type === "multiple"} />
                </div>
              ))}
              <form className="flex items-center gap-2" onSubmit={(e) => {
                e.preventDefault();
                const q = a.questions.find((x) => String(x.index) === overrideQ.replace(/^q/i, "").trim());
                if (!q) return toast("No question with that number", "bad");
                updateQuestion(a.id, q.id, { ruleOverride: { ...resolveRule(q, a.sections) } });
                setOverrideQ("");
              }}>
                <Input value={overrideQ} onChange={(e) => setOverrideQ(e.target.value)} placeholder="Question number, e.g. 42" className="w-56" aria-label="Question number to override" />
                <Button type="submit" size="md">Add override</Button>
              </form>
              <p className="text-xs text-fg-3">Bonus and dropped questions are set per question in the Review step.</p>
            </div>
          </Card>
        </div>
        <aside aria-label="Marking summary" className="space-y-4 lg:sticky lg:top-8 lg:self-start">
          <Card className="p-5">
            <h2 className="text-sm font-semibold">Preview</h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Stat label="Maximum score" value={fmtNum(summary.maxScore)} />
              <Stat label="Scorable questions" value={summary.gradable + summary.bonus} />
            </div>
            <ul className="mt-3 space-y-1.5 text-sm">
              {a.sections.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2"><span className="truncate">{s.name} <span className="text-fg-3">({counts[s.id] ?? 0})</span></span><Badge tone="neutral">{describeRule(s.rule)}</Badge></li>
              ))}
            </ul>
            {(summary.unkeyed > 0 || summary.dropped > 0 || summary.bonus > 0) && (
              <p className="mt-3 text-xs text-fg-3">{summary.bonus ? `${summary.bonus} bonus · ` : ""}{summary.dropped ? `${summary.dropped} dropped · ` : ""}{summary.unkeyed ? `${summary.unkeyed} without key (excluded)` : ""}</p>
            )}
            <Button variant="primary" className="mt-4 w-full" iconRight={ArrowRight} onClick={confirm}>{a.finalizedAt ? "Save & back to results" : "Confirm marking"}</Button>
            {exam && (
              <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => { updateExam(exam.id, { sections: a.sections.map((s) => ({ ...s })) }); toast(`Saved as the default marking for ${exam.name}`); }}>
                Save as default for {exam.name.length > 22 ? "this exam" : exam.name}
              </Button>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}
