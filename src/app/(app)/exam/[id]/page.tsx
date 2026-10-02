"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { BookOpen, CalendarDays, Clock, Compass, FileUp, ListChecks, Pencil, Plus, ScanSearch, Scale, Target, Trash2 } from "lucide-react";
import { LineTrend, subjectColorOf } from "@/components/charts";
import { Countdown, ExamTypeBadge, ObservationCard, ReadinessPanel } from "@/components/domain";
import { MarkingSchemeEditor, SyllabusEditor, SyllabusImport, type SyllabusOps } from "@/components/editors";
import { ExamCard } from "@/components/exam-card";
import { NotFound } from "@/components/shell";
import { Badge, Button, Card, CardHeader, ConfirmDialog, Dialog, EmptyState, Field, Input, LinkButton, PageHeader, Stat, Tabs, Textarea, toast } from "@/components/ui";
import { scoreAnalysis, shortTitle } from "@/domain/analysis";
import { childExams } from "@/domain/selectors";
import type { Exam } from "@/domain/types";
import { fmtNum, formatDate, pct } from "@/domain/util";
import { useExam, useFamily, useObservations, useReadiness, useToday } from "@/lib/hooks";
import { useStore } from "@/store/store";

type Tab = "overview" | "syllabus" | "tests" | "marking";

export default function ExamHubPage() {
  const { id } = useParams<{ id: string }>();
  const exam = useExam(id);
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const deleteExam = useStore((s) => s.deleteExam);
  const topicsCount = useStore((s) => s.topics.filter((t) => t.examId === id).length);
  const analysesCount = useStore((s) => s.analyses.filter((a) => a.examId === id).length);
  const children = useStore(useShallow((s) => childExams(s, id)));
  const parent = useStore((s) => s.exams.find((e) => e.id === exam?.parentExamId));

  if (!exam) return <NotFound what="Exam" back="/exams" />;
  const isGoal = !exam.parentExamId;

  return (
    <div className="animate-in">
      <PageHeader
        eyebrow={<Link href="/exams" className="hover:underline">My Exams</Link>}
        title={exam.name}
        actions={<>
          {isGoal && <LinkButton href={`/pilot/${exam.id}`} icon={Compass}>Open plan</LinkButton>}
          <LinkButton href={`/analyzer/new?exam=${exam.id}`} variant="primary" icon={ScanSearch}>Analyze {isGoal ? "this exam" : "this test"}</LinkButton>
          <Button icon={Pencil} variant="ghost" onClick={() => setEditOpen(true)} aria-label="Edit exam details">Edit</Button>
          <Button icon={Trash2} variant="ghost" className="text-bad" onClick={() => setDeleteOpen(true)} aria-label="Delete exam" />
        </>}
      >
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-fg-3">
          <ExamTypeBadge exam={exam} />
          <span className="inline-flex items-center gap-1"><CalendarDays className="size-4" aria-hidden />{formatDate(exam.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span>
          <span>·</span><Countdown date={exam.date} className="font-medium" />
          <span>·</span><span className="inline-flex items-center gap-1"><Clock className="size-4" aria-hidden />{exam.durationMinutes} min</span>
          {exam.targetScore && <><span>·</span><span className="inline-flex items-center gap-1"><Target className="size-4" aria-hidden />Target {exam.targetScore}</span></>}
          {parent && <><span>·</span><span>Mock for <Link href={`/exam/${parent.id}`} className="font-medium text-accent-text hover:underline">{parent.name}</Link></span></>}
        </div>
      </PageHeader>

      <Tabs value={tab} onChange={setTab} className="mb-6" tabs={[
        { value: "overview", label: "Overview" },
        ...(isGoal ? [{ value: "syllabus" as Tab, label: "Syllabus", count: topicsCount }] : []),
        { value: "tests", label: isGoal ? "Tests & analyses" : "Analyses", count: analysesCount + children.length },
        { value: "marking", label: "Marking scheme" },
      ]} />

      {tab === "overview" && (isGoal ? <GoalOverview exam={exam} onOpenSyllabus={() => setTab("syllabus")} /> : <MockOverview exam={exam} />)}
      {tab === "syllabus" && isGoal && <SyllabusTab exam={exam} />}
      {tab === "tests" && <TestsTab exam={exam} />}
      {tab === "marking" && <MarkingTab exam={exam} />}

      <EditExamDialog exam={exam} open={editOpen} onClose={() => setEditOpen(false)} />
      <ConfirmDialog open={deleteOpen} onClose={() => setDeleteOpen(false)} danger confirmLabel="Delete permanently"
        title={`Delete ${exam.name}?`}
        description={<>This removes the exam{isGoal ? `, its ${topicsCount} syllabus topics, its plan${children.length ? `, and ${children.length} linked mock test${children.length === 1 ? "" : "s"}` : ""}` : ""} and {analysesCount} analys{analysesCount === 1 ? "is" : "es"} from this browser. This can't be undone — export a backup from Settings first if unsure.</>}
        onConfirm={() => { deleteExam(exam.id); toast(`${exam.name} deleted`); router.push("/exams"); }} />
    </div>
  );
}

function GoalOverview({ exam, onOpenSyllabus }: { exam: Exam; onOpenSyllabus: () => void }) {
  const readiness = useReadiness(exam);
  const family = useFamily(exam.id);
  const observations = useObservations(exam.id);
  const d = useToday();
  const { topics, tasks, revisions, notebook } = useStore(useShallow((s) => ({ topics: s.topics, tasks: s.tasks, revisions: s.revisions, notebook: s.notebook })));
  const my = useMemo(() => topics.filter((t) => t.examId === exam.id), [topics, exam.id]);
  const subjects = [...new Set(my.map((t) => t.subject))];
  const bySubject = subjects.map((s) => {
    const list = my.filter((t) => t.subject === s);
    return { s, total: list.length, covered: list.filter((t) => t.coverage === "covered" || t.coverage === "revised").length, learning: list.filter((t) => t.coverage === "learning").length };
  });
  const done = tasks.filter((t) => t.examId === exam.id && t.status === "done");
  const practiceTypes = new Set(["practice", "timed_set", "redo_mistakes", "mock_test"]);
  const practiceMin = done.filter((t) => practiceTypes.has(t.type)).reduce((m, t) => m + t.durationMinutes, 0);
  const revDue = revisions.filter((r) => r.examId === exam.id && r.dueAt <= d);
  const unresolved = notebook.filter((n) => family.some((a) => a.id === n.analysisId) && n.mastery !== "mastered");

  if (!my.length) {
    return (
      <Card><EmptyState icon={BookOpen} title="Add a syllabus to get a plan" action={<Button variant="primary" onClick={onOpenSyllabus}>Open syllabus</Button>}>
        Student OS plans around your topics. Import a syllabus or add chapters manually.
      </EmptyState></Card>
    );
  }
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="min-w-0 space-y-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Syllabus coverage" value={pct(readiness?.signals.find((s) => s.id === "coverage")?.value ?? 0)} sub={`${my.filter((t) => t.coverage === "covered" || t.coverage === "revised").length}/${my.length} topics`} />
          <Stat label="Practice volume" value={`${Math.round(practiceMin / 60)} h`} sub={`${done.filter((t) => practiceTypes.has(t.type)).length} practice sessions done`} />
          <Stat label="Revision completion" value={revDue.length ? pct(revDue.filter((r) => r.status === "done").length / revDue.length) : "—"} sub={`${revDue.filter((r) => r.status === "done").length}/${revDue.length} checkpoints due`} />
          <Stat label="Unresolved errors" value={unresolved.length} sub="in Error Notebook" tone={unresolved.length > 10 ? "warn" : undefined} />
        </div>
        <Card>
          <CardHeader icon={ListChecks} title="Syllabus coverage by subject" />
          <div className="space-y-4 px-5 pb-5">
            {bySubject.map((b) => (
              <div key={b.s}>
                <div className="flex justify-between text-sm"><span className="font-medium">{b.s}</span><span className="text-fg-3 tabular">{b.covered} covered · {b.learning} learning · {b.total - b.covered - b.learning} not started</span></div>
                <div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-surface-3" role="img" aria-label={`${b.s}: ${b.covered} covered, ${b.learning} learning of ${b.total}`}>
                  <div style={{ width: `${(b.covered / b.total) * 100}%`, background: subjectColorOf(b.s, subjects) }} />
                  <div style={{ width: `${(b.learning / b.total) * 100}%`, background: subjectColorOf(b.s, subjects), opacity: 0.4 }} className="border-l-2 border-surface" />
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader icon={ScanSearch} title="Mock performance" subtitle={family.length ? `${family.length} analyzed test${family.length === 1 ? "" : "s"}` : undefined}
            action={<LinkButton href={`/exams/new?parent=${exam.id}`} size="sm" variant="ghost" icon={Plus}>Add mock</LinkButton>} />
          <div className="px-5 pb-5">
            {family.length >= 2 ? (
              <LineTrend height={200} data={family.map((a) => ({ label: shortTitle(a.title), pct: scoreAnalysis(a).percentage }))} series={[{ key: "pct", name: "Score %", color: "var(--chart-1)" }]} yFormat={(v) => `${v}%`} />
            ) : family.length === 1 ? (
              <p className="text-sm text-fg-3">One test analyzed ({fmtNum(scoreAnalysis(family[0]).score)}/{fmtNum(scoreAnalysis(family[0]).maxScore)}). The trend appears after the next one.</p>
            ) : (
              <EmptyState icon={ScanSearch} title="No tests analyzed yet" className="py-6" action={<LinkButton href={`/analyzer/new?exam=${exam.id}`} size="sm" variant="primary">Analyze a test</LinkButton>}>Mock performance, weak areas and error patterns appear here.</EmptyState>
            )}
          </div>
        </Card>
        {observations.length > 0 && (
          <Card>
            <CardHeader title="Known weak areas & unresolved patterns" subtitle="Evidence-linked; each one is already feeding your plan" />
            <div className="space-y-2 px-5 pb-5">{observations.slice(0, 6).map((o) => <ObservationCard key={o.id} o={o} />)}</div>
          </Card>
        )}
      </div>
      <div className="space-y-6">
        {readiness && <Card className="p-5"><ReadinessPanel readiness={readiness} compact /></Card>}
        {exam.notes && <Card className="p-5"><div className="eyebrow mb-1">Notes</div><p className="text-sm whitespace-pre-wrap text-fg-2">{exam.notes}</p></Card>}
        <Card className="p-5">
          <div className="eyebrow mb-2">Marking</div>
          {exam.sections.map((s) => <div key={s.id} className="flex justify-between py-1 text-sm"><span>{s.name}</span><span className="text-fg-3 tabular">+{s.rule.correct} / −{s.rule.wrong} / {s.rule.unattempted}</span></div>)}
        </Card>
      </div>
    </div>
  );
}

function MockOverview({ exam }: { exam: Exam }) {
  const analyses = useStore(useShallow((s) => s.analyses.filter((a) => a.examId === exam.id)));
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {analyses.length ? analyses.map((a) => {
        const s = scoreAnalysis(a);
        return (
          <Card key={a.id} className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <Link href={`/analyzer/${a.id}`} className="font-semibold hover:underline">{a.title}</Link>
                <div className="text-xs text-fg-3">Taken {formatDate(a.takenOn)}</div>
              </div>
              {a.finalizedAt ? <Badge tone="good">Analyzed</Badge> : <Badge tone="warn">Draft · {a.stage}</Badge>}
            </div>
            {a.finalizedAt && (
              <div className="mt-4 grid grid-cols-3 gap-2">
                <Stat label="Score" value={`${fmtNum(s.score)}`} sub={`of ${fmtNum(s.maxScore)}`} />
                <Stat label="Accuracy" value={pct(s.accuracy)} sub="correct ÷ attempted" />
                <Stat label="Attempted" value={pct(s.attemptRate)} sub={`${s.attempted}/${s.gradable}`} />
              </div>
            )}
            <LinkButton href={`/analyzer/${a.id}${a.finalizedAt ? "/report" : ""}`} size="sm" className="mt-4">{a.finalizedAt ? "Open report" : "Continue analysis"}</LinkButton>
          </Card>
        );
      }) : (
        <Card className="md:col-span-2"><EmptyState icon={ScanSearch} title="Not analyzed yet" action={<LinkButton href={`/analyzer/new?exam=${exam.id}`} variant="primary" icon={ScanSearch}>Analyze this test</LinkButton>}>
          After you sit the test, upload the paper and key to see where marks went. Findings feed the goal exam's plan.
        </EmptyState></Card>
      )}
    </div>
  );
}

function SyllabusTab({ exam }: { exam: Exam }) {
  const router = useRouter();
  const topics = useStore(useShallow((s) => s.topics.filter((t) => t.examId === exam.id)));
  const [importOpen, setImportOpen] = useState(false);
  const st = useStore.getState;
  const ops: SyllabusOps = {
    update: (id, { difficulty, ...rest }) => {
      if (Object.keys(rest).length) st().updateTopic(id, rest);
      if (difficulty) st().setTopicDifficulty(id, difficulty);
    },
    remove: (ids) => st().deleteTopics(ids),
    merge: (ids, name) => st().mergeTopics(ids, name),
    split: (id, names) => st().splitTopic(id, names),
    add: (list) => st().addTopics(exam.id, list),
    setCoverage: (id, c) => st().setCoverage(id, c),
  };
  const subjects = [...new Set([...exam.subjects, ...topics.map((t) => t.subject)])];
  return (
    <Card>
      <CardHeader title="Syllabus" subtitle="Changes feed the next plan regeneration. Marking a topic covered schedules its spaced revision checkpoints."
        action={<div className="flex gap-2">
          <Button size="sm" icon={FileUp} onClick={() => setImportOpen(true)}>Import</Button>
          <Button size="sm" variant="soft" onClick={() => { st().regeneratePlan(exam.id); toast("Plan rebuilt with the updated syllabus"); }}>Rebuild plan</Button>
        </div>} />
      <div className="px-5 pb-5"><SyllabusEditor topics={topics} ops={ops} subjects={subjects} /></div>
      <SyllabusImport open={importOpen} onClose={() => setImportOpen(false)} fallbackSubject={subjects[0]} subjects={subjects} existingCount={topics.length}
        onImport={(list, { replace }) => {
          if (replace) st().replaceTopics(exam.id, list);
          else { ops.add(list); st().regeneratePlan(exam.id); }
          toast(`Added ${list.length} topics to your plan`, "good", { label: "Open plan", onClick: () => router.push(`/pilot/${exam.parentExamId ?? exam.id}?tab=todo`) });
        }} />
    </Card>
  );
}

function TestsTab({ exam }: { exam: Exam }) {
  const children = useStore(useShallow((s) => childExams(s, exam.id)));
  return (
    <div className="space-y-6">
      {!exam.parentExamId && (
        <section>
          <div className="mb-3 flex items-center justify-between"><h2 className="section-title">Mock & practice tests</h2><LinkButton href={`/exams/new?parent=${exam.id}`} size="sm" icon={Plus}>Add mock test</LinkButton></div>
          {children.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{children.map((c) => <ExamCard key={c.id} exam={c} />)}</div>
            : <p className="text-sm text-fg-3">No mock tests yet. Add them to schedule them in your plan and compare results over time.</p>}
        </section>
      )}
      <section>
        <h2 className="section-title mb-3">Analyses of {exam.parentExamId ? "this test" : "this exam itself"}</h2>
        <MockOverview exam={exam} />
      </section>
    </div>
  );
}

function MarkingTab({ exam }: { exam: Exam }) {
  const update = useStore((s) => s.updateExam);
  return (
    <Card>
      <CardHeader icon={Scale} title="Default marking scheme" subtitle="New analyses of this exam start from these rules. Existing analyses keep the scheme you confirmed for them." />
      <div className="px-5 pb-5"><MarkingSchemeEditor sections={exam.sections} subjects={exam.subjects} onChange={(sections) => update(exam.id, { sections })} /></div>
    </Card>
  );
}

function EditExamDialog({ exam, open, onClose }: { exam: Exam; open: boolean; onClose: () => void }) {
  const update = useStore((s) => s.updateExam);
  const regen = useStore((s) => s.regeneratePlan);
  const [f, setF] = useState({ name: exam.name, date: exam.date, durationMinutes: exam.durationMinutes, targetScore: exam.targetScore ?? "", targetRange: exam.targetRange ?? "", institution: exam.institution ?? "", notes: exam.notes ?? "" });
  const save = () => {
    if (!f.name.trim() || !f.date) return toast("Name and date are required", "bad");
    update(exam.id, { name: f.name.trim(), date: f.date, durationMinutes: Number(f.durationMinutes) || exam.durationMinutes, targetScore: f.targetScore === "" ? undefined : Number(f.targetScore), targetRange: f.targetRange || undefined, institution: f.institution || undefined, notes: f.notes || undefined });
    if (f.date !== exam.date) regen(exam.id);
    toast("Exam updated");
    onClose();
  };
  return (
    <Dialog open={open} onClose={onClose} title="Edit exam details" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" htmlFor="e-name" className="sm:col-span-2"><Input id="e-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Date" htmlFor="e-date" hint="Changing the date regenerates the plan."><Input id="e-date" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Duration (min)" htmlFor="e-dur"><Input id="e-dur" type="number" value={f.durationMinutes} onChange={(e) => setF({ ...f, durationMinutes: Number(e.target.value) })} /></Field>
        <Field label="Target score" htmlFor="e-ts"><Input id="e-ts" type="number" value={f.targetScore} onChange={(e) => setF({ ...f, targetScore: e.target.value === "" ? "" : Number(e.target.value) })} /></Field>
        <Field label="Target range" htmlFor="e-tr"><Input id="e-tr" value={f.targetRange} onChange={(e) => setF({ ...f, targetRange: e.target.value })} /></Field>
        <Field label="Institution" htmlFor="e-inst" className="sm:col-span-2"><Input id="e-inst" value={f.institution} onChange={(e) => setF({ ...f, institution: e.target.value })} /></Field>
        <Field label="Notes" htmlFor="e-notes" className="sm:col-span-2"><Textarea id="e-notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
    </Dialog>
  );
}

