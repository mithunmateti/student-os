"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CalendarDays, FileUp, Plus, Target, X } from "lucide-react";
import { MarkingSchemeEditor, SyllabusEditor, SyllabusImport, useDraftSyllabus } from "@/components/editors";
import { Badge, Button, Callout, Card, CardHeader, Field, Input, PageHeader, Select, subjectClass, Textarea, toast } from "@/components/ui";
import { SYLLABUS_TEMPLATES } from "@/domain/syllabi";
import type { ExamSection, Priority } from "@/domain/types";
import { addDays, daysBetween, today, uid } from "@/domain/util";
import { useStore } from "@/store/store";
import { getSearchParams } from "@/lib/url";

const EXAM_TYPES = ["Competitive entrance", "School / board exam", "Olympiad", "Standardized test", "Mock test", "Unit test", "Other"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function NewExamPage() {
  const router = useRouter();
  const exams = useStore((s) => s.exams);
  const settings = useStore((s) => s.settings);
  const createExam = useStore((s) => s.createExam);
  const updateSettings = useStore((s) => s.updateSettings);
  const goals = exams.filter((e) => !e.parentExamId && !e.archived);

  const [first, setFirst] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState(addDays(today(), 60));
  const [duration, setDuration] = useState(180);
  const [totalMarks, setTotalMarks] = useState<number | "">("");
  const [questionCount, setQuestionCount] = useState<number | "">("");
  const [examType, setExamType] = useState(EXAM_TYPES[0]);
  const [priority, setPriority] = useState<Priority>("high");
  const [institution, setInstitution] = useState("");
  const [targetScore, setTargetScore] = useState<number | "">("");
  const [targetRange, setTargetRange] = useState("");
  const [notes, setNotes] = useState("");
  const [parentId, setParentId] = useState("");
  // Start empty: the student adds their own syllabus (import, or type it). Templates are opt-in.
  const [template, setTemplate] = useState<keyof typeof SYLLABUS_TEMPLATES>("custom");
  const [subjects, setSubjects] = useState<string[]>([]);
  const [newSubject, setNewSubject] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [minutes, setMinutes] = useState<number[]>(settings.planner.minutesByWeekday);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const syllabus = useDraftSyllabus([]);
  const [sections, setSections] = useState<ExamSection[]>(() => [{ id: uid("sec"), name: "Section 1", ordering: 0, rule: { ...settings.defaultRule } }]);

  useEffect(() => {
    const p = getSearchParams();
    setFirst(p.get("first") === "1");
    // "Add an exam on this day" from the calendar.
    const day = p.get("date");
    if (day && /^\d{4}-\d{2}-\d{2}$/.test(day) && day >= today()) setDate(day);
    const parent = p.get("parent");
    if (parent) {
      setParentId(parent);
      setExamType("Mock test");
      setPriority("medium");
    }
  }, []);

  const isMock = !!parentId;
  const parent = goals.find((g) => g.id === parentId);

  useEffect(() => {
    if (parent) {
      setSubjects(parent.subjects);
      setSections(parent.sections.map((s) => ({ ...s, id: uid("sec"), rule: { ...s.rule } })));
      setDuration(parent.durationMinutes);
      if (!name) setName(`${parent.name.split("—")[0].trim()} Mock ${exams.filter((e) => e.parentExamId === parent.id).length + 1}`);
    }
  }, [parentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickTemplate = (t: keyof typeof SYLLABUS_TEMPLATES) => {
    setTemplate(t);
    const tpl = SYLLABUS_TEMPLATES[t];
    setSubjects(tpl.subjects);
    syllabus.setTopics(tpl.topics().map((x) => ({ ...x, id: uid("top"), coverage: "not_started" as const })));
    setSections(tpl.subjects.length ? tpl.subjects.map((s, i) => ({ id: uid("sec"), name: s, subject: s, ordering: i, rule: { ...settings.defaultRule } })) : [{ id: uid("sec"), name: "Section 1", ordering: 0, rule: { ...settings.defaultRule } }]);
  };
  const addSubject = () => {
    const s = newSubject.trim();
    if (!s || subjects.includes(s)) return;
    setSubjects([...subjects, s]);
    setSections((secs) => {
      const base = secs.length === 1 && !secs[0].subject ? [] : secs;
      return [...base, { id: uid("sec"), name: s, subject: s, ordering: base.length, rule: { ...(secs[0]?.rule ?? settings.defaultRule) } }];
    });
    setNewSubject("");
  };
  const removeSubject = (s: string) => {
    setSubjects(subjects.filter((x) => x !== s));
    syllabus.setTopics(syllabus.topics.filter((t) => t.subject !== s));
    setSections((secs) => (secs.length > 1 ? secs.filter((x) => x.subject !== s) : secs));
  };

  const daysLeft = daysBetween(today(), date);
  const weeklyMinutes = minutes.reduce((a, b) => a + b, 0);
  const allSubjects = useMemo(() => [...new Set([...subjects, ...syllabus.topics.map((t) => t.subject)])], [subjects, syllabus.topics]);

  const submit = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Give the exam a name.";
    if (!date) e.date = "Pick the exam date.";
    if (!duration || duration <= 0) e.duration = "Duration must be more than 0 minutes.";
    if (!isMock && !allSubjects.length) e.subjects = "Add at least one subject.";
    setErrors(e);
    if (Object.keys(e).length) {
      toast("Please fix the highlighted fields", "bad");
      return;
    }
    if (!isMock) updateSettings({ planner: { ...settings.planner, minutesByWeekday: minutes } });
    const id = createExam(
      {
        name: name.trim(), date, durationMinutes: duration, totalMarks: totalMarks || undefined, questionCount: questionCount || undefined,
        subjects: allSubjects, sections, priority, status: daysLeft < 0 ? "completed" : "upcoming", examType, institution: institution || undefined,
        targetScore: targetScore || undefined, targetRange: targetRange || undefined, notes: notes || undefined, parentExamId: parentId || undefined,
      },
      isMock ? [] : syllabus.topics.map(({ id: _id, ...t }) => ({ ...t })),
    );
    toast(isMock ? `${name} added to ${parent?.name}. Its date is now in your plan.` : `${name} created — your plan is ready.`);
    if (isMock && parent) useStore.getState().regeneratePlan(parent.id);
    router.push(isMock ? `/exam/${id}` : `/pilot/${id}?created=1&tab=todo`);
  };

  return (
    <div className="animate-in">
      <PageHeader eyebrow="My Exams" title={isMock ? "Add a mock / practice test" : "Create an exam"}
        subtitle={isMock ? "Mock tests share the goal exam's syllabus and feed its plan when analyzed." : "Set the date, syllabus and marking. Exam Pilot builds your daily plan from this."} />
      {first && !isMock && (
        <Callout tone="accent" icon={Target} className="mb-6" title="Start with the exam you're preparing for">
          Give it a name and date, then import your syllabus (a PDF or photo works) or add your subjects and chapters. Everything is editable later.
        </Callout>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="1. Exam details" />
            <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
              <Field label="Exam name *" htmlFor="name" error={errors.name} className="sm:col-span-2">
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. JEE Main 2027 — Session 1" aria-invalid={!!errors.name} autoFocus />
              </Field>
              <Field label="Exam date *" htmlFor="date" error={errors.date} hint={date ? (daysLeft >= 0 ? `${daysLeft} days from today` : "In the past — will be saved as completed") : undefined}>
                <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-invalid={!!errors.date} />
              </Field>
              <Field label="Duration (minutes) *" htmlFor="dur" error={errors.duration}>
                <Input id="dur" type="number" min={1} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
              </Field>
              <Field label="Total marks" htmlFor="tm" hint="Optional — calculated from the paper when analyzed.">
                <Input id="tm" type="number" min={0} value={totalMarks} onChange={(e) => setTotalMarks(e.target.value ? Number(e.target.value) : "")} />
              </Field>
              <Field label="Number of questions" htmlFor="qc">
                <Input id="qc" type="number" min={0} value={questionCount} onChange={(e) => setQuestionCount(e.target.value ? Number(e.target.value) : "")} />
              </Field>
              <Field label="Exam type" htmlFor="type">
                <Select id="type" value={examType} onChange={(e) => setExamType(e.target.value)}>{EXAM_TYPES.map((t) => <option key={t}>{t}</option>)}</Select>
              </Field>
              <Field label="Priority" htmlFor="prio">
                <Select id="prio" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></Select>
              </Field>
              <Field label="Mock / practice test for" htmlFor="parent" hint="Leave empty for a goal exam with its own plan." className="sm:col-span-2">
                <Select id="parent" value={parentId} onChange={(e) => setParentId(e.target.value)}>
                  <option value="">— This is a goal exam —</option>
                  {goals.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </Select>
              </Field>
              <details className="sm:col-span-2">
                <summary className="text-sm font-medium text-accent-text">Optional: institution, target and notes</summary>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <Field label="Institution / coaching" htmlFor="inst"><Input id="inst" value={institution} onChange={(e) => setInstitution(e.target.value)} /></Field>
                  <Field label="Target score" htmlFor="ts"><Input id="ts" type="number" value={targetScore} onChange={(e) => setTargetScore(e.target.value ? Number(e.target.value) : "")} /></Field>
                  <Field label="Target percentile / range" htmlFor="tr"><Input id="tr" value={targetRange} onChange={(e) => setTargetRange(e.target.value)} placeholder="e.g. 99+ percentile" /></Field>
                  <Field label="Notes" htmlFor="notes" className="sm:col-span-2"><Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></Field>
                </div>
              </details>
            </div>
          </Card>

          {!isMock && (
            <Card>
              <CardHeader title="2. Subjects & syllabus" subtitle="Topics drive the plan. Set priority by exam weightage; mark anything you've already covered."
                action={<Button size="sm" icon={FileUp} onClick={() => setImportOpen(true)}>Import syllabus</Button>} />
              <div className="space-y-4 px-5 pb-5">
                {!syllabus.topics.length && (
                  <button onClick={() => setImportOpen(true)} className="flex w-full items-center gap-3.5 rounded-[18px] bg-accent-soft px-4 py-3.5 text-left">
                    <span className="grid size-10 shrink-0 place-items-center rounded-[13px] bg-accent text-white"><FileUp className="size-5" aria-hidden /></span>
                    <span className="flex-1"><span className="block text-[16px] font-bold text-fg">Import your syllabus</span><span className="block text-[13px] text-fg-2">Upload the PDF or a photo. You check every topic before it&apos;s added.</span></span>
                  </button>
                )}
                <details className="group">
                  <summary className="text-[13px] font-bold text-accent-text">Or start from a ready-made list (JEE, NEET, SAT)</summary>
                  <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Syllabus template">
                    {(Object.keys(SYLLABUS_TEMPLATES) as (keyof typeof SYLLABUS_TEMPLATES)[]).map((k) => (
                      <button key={k} role="radio" aria-checked={template === k} onClick={() => pickTemplate(k)}
                        className={`h-9 rounded-full px-3.5 text-sm font-semibold transition ${template === k ? "bg-accent text-white" : "bg-surface-2 text-fg-2 hover:text-fg"}`}>
                        {SYLLABUS_TEMPLATES[k].name}
                      </button>
                    ))}
                  </div>
                </details>
                <div>
                  <div className="label">Subjects</div>
                  <div className="flex flex-wrap items-center gap-2">
                    {allSubjects.map((s) => (
                      <span key={s} className={`inline-flex h-8 items-center gap-1 rounded-full border-[1.5px] border-[var(--dot)] bg-[var(--tint)] pr-1 pl-3 text-[13px] font-bold text-[var(--ink)] ${subjectClass(s)}`}>
                        {s}
                        <button onClick={() => removeSubject(s)} className="rounded-full p-0.5 text-fg-3 hover:bg-surface-3 hover:text-fg" aria-label={`Remove ${s}`}><X className="size-3" /></button>
                      </span>
                    ))}
                    <form onSubmit={(e) => { e.preventDefault(); addSubject(); }} className="flex items-center gap-1">
                      <Input value={newSubject} onChange={(e) => setNewSubject(e.target.value)} placeholder="Add a subject, e.g. Physics" className="h-9 min-h-9 w-56 py-1" aria-label="New subject" />
                      <Button size="sm" type="submit" icon={Plus} aria-label="Add subject" />
                    </form>
                  </div>
                  {errors.subjects && <p className="hint !text-bad">{errors.subjects}</p>}
                </div>
                <SyllabusEditor topics={syllabus.topics} ops={syllabus.ops} subjects={allSubjects} />
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title={`${isMock ? "2" : "3"}. Marking scheme by section`} subtitle="Used as the default when you analyze this exam. You'll confirm it again before scoring." />
            <div className="px-5 pb-5">
              <MarkingSchemeEditor sections={sections} onChange={setSections} subjects={allSubjects} />
            </div>
          </Card>

          {!isMock && (
            <Card>
              <CardHeader title="4. Study time" subtitle="Minutes available per day. School/coaching days can be lighter; block specific dates in Settings." />
              <div className="grid grid-cols-4 gap-3 px-5 pb-5 sm:grid-cols-7">
                {WEEKDAYS.map((d, i) => (
                  <Field key={d} label={d} htmlFor={`m-${i}`}>
                    <Input id={`m-${i}`} type="number" min={0} step={15} value={minutes[i]} onChange={(e) => setMinutes(minutes.map((m, j) => (j === i ? Math.max(0, Number(e.target.value)) : m)))} />
                  </Field>
                ))}
              </div>
            </Card>
          )}
        </div>

        <aside aria-label="Summary" className="lg:sticky lg:top-8 lg:self-start">
          <Card className="p-5">
            <h2 className="text-sm font-semibold">Summary</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-2"><dt className="text-fg-3">Exam</dt><dd className="truncate text-right font-medium">{name || "—"}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-fg-3">Date</dt><dd className="text-right"><CalendarDays className="mr-1 inline size-3.5 text-fg-3" />{date || "—"}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-fg-3">Days left</dt><dd className="tabular">{date ? Math.max(0, daysLeft) : "—"}</dd></div>
              {!isMock && <div className="flex justify-between gap-2"><dt className="text-fg-3">Topics</dt><dd className="tabular">{syllabus.topics.length}</dd></div>}
              <div className="flex justify-between gap-2"><dt className="text-fg-3">Sections</dt><dd className="tabular">{sections.length}</dd></div>
              {!isMock && <div className="flex justify-between gap-2"><dt className="text-fg-3">Study time</dt><dd className="tabular">{Math.round(weeklyMinutes / 60)} h / week</dd></div>}
              {isMock && parent && <div className="flex justify-between gap-2"><dt className="text-fg-3">Feeds plan of</dt><dd className="text-right"><Badge tone="accent">{parent.name}</Badge></dd></div>}
            </dl>
            {!isMock && syllabus.topics.length > 0 && daysLeft > 0 && (
              <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-xs text-fg-2">
                ≈ {Math.round((weeklyMinutes / 7) * daysLeft / 60)} study hours before the exam for {syllabus.topics.length} topics
                ({Math.round(((weeklyMinutes / 7) * daysLeft) / syllabus.topics.length)} min per topic incl. revision).
              </p>
            )}
            <Button variant="primary" className="mt-4 w-full" iconRight={ArrowRight} onClick={submit}>
              {isMock ? "Add test" : "Create exam & generate plan"}
            </Button>
            <Button variant="ghost" className="mt-2 w-full" onClick={() => router.back()}>Cancel</Button>
          </Card>
        </aside>
      </div>

      <SyllabusImport open={importOpen} onClose={() => setImportOpen(false)} fallbackSubject={allSubjects[0]} subjects={allSubjects}
        existingCount={syllabus.topics.length} replaceByDefault
        onExamInfo={(info) => {
          const applied: string[] = [];
          if (info.name && !name.trim()) { setName(info.name); applied.push("name"); }
          if (info.date && info.date >= today()) { setDate(info.date); applied.push("date"); }
          else if (info.date) toast(`The document's test date (${info.date}) has already passed, so the exam date wasn't changed. Set the date you're preparing for.`, "warn", undefined, 7000);
          if (info.durationMinutes) { setDuration(info.durationMinutes); applied.push("duration"); }
          if (info.pattern) { setNotes((n) => (n.includes(info.pattern!) ? n : `${n ? `${n}\n` : ""}Pattern: ${info.pattern}`)); applied.push("pattern"); }
          if (applied.length) toast(`Filled in the exam ${applied.join(", ")} from the document — check them above`, "info");
        }}
        onImport={(list, { replace }) => {
          const imported = [...new Set(list.map((t) => t.subject))];
          if (replace) {
            syllabus.setTopics(list.map((t) => ({ ...t, id: uid("top") })));
            setTemplate("custom");
            setSubjects(imported);
            setSections(imported.map((sub, i) => ({ id: uid("sec"), name: sub, subject: sub, ordering: i, rule: { ...(sections.find((x) => x.subject === sub)?.rule ?? settings.defaultRule) } })));
          } else {
            syllabus.ops.add(list);
            const subj = imported.filter((s) => !subjects.includes(s));
            if (subj.length) setSubjects([...subjects, ...subj]);
          }
          toast(`${list.length} topics ready. Click “Create exam & generate plan” to turn them into your to-do list.`);
        }} />
    </div>
  );
}
