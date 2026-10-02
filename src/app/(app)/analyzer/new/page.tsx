"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ClipboardPaste, Copy, Download, FileText, Keyboard, Plus, Sparkles, Trash2, Upload, X } from "lucide-react";
import { FileDrop } from "@/components/editors";
import { Badge, Button, Callout, Card, CardHeader, cn, Field, Input, PageHeader, Select, Switch, Tabs, Textarea, toast } from "@/components/ui";
import { MARKING_PRESETS } from "@/domain/catalog";
import { SAMPLE_KEY, SAMPLE_PAPER } from "@/domain/demo/sample-paper";
import { buildFromParsed, buildManual, duplicateStructure, mergeKey, type ManualSectionSpec } from "@/domain/import/build";
import { parseAnswerKey, parsePaperText } from "@/domain/import/parser";
import { fromAiResult } from "@/domain/import/ai";
import type { Analysis, FileRef, MarkingRule, QuestionType } from "@/domain/types";
import { today, uid } from "@/domain/util";
import { extractText, ExtractError, formatBytes } from "@/lib/extract";
import { SAMPLE_KEY_PDF, SAMPLE_PAPER_PDF } from "@/lib/sample-assets";
import { useStore } from "@/store/store";
import { getSearchParams } from "@/lib/url";
import { aiStructurePaper, detectAiSource, type AiSource } from "@/lib/ai/client";

type Source = "upload" | "paste" | "manual" | "reuse" | "sample";
interface Loaded { file: File; kind: FileRef["kind"] }

export default function NewAnalysisPage() {
  const router = useRouter();
  const exams = useStore((s) => s.exams);
  const analyses = useStore((s) => s.analyses);
  const topics = useStore((s) => s.topics);
  const settings = useStore((s) => s.settings);
  const createExam = useStore((s) => s.createExam);
  const createAnalysis = useStore((s) => s.createAnalysis);

  const [examId, setExamId] = useState<string>("");
  const [newExamName, setNewExamName] = useState("");
  const [newParent, setNewParent] = useState("");
  const [title, setTitle] = useState("");
  const [takenOn, setTakenOn] = useState(today());
  const [source, setSource] = useState<Source>("upload");
  const [paperFiles, setPaperFiles] = useState<Loaded[]>([]);
  const [keyFile, setKeyFile] = useState<Loaded | null>(null);
  const [extraFiles, setExtraFiles] = useState<Loaded[]>([]);
  const [paperText, setPaperText] = useState("");
  const [keyText, setKeyText] = useState("");
  const [timeUsed, setTimeUsed] = useState<number | "">("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reuseId, setReuseId] = useState("");
  const [keepContent, setKeepContent] = useState(false);
  const [restart, setRestart] = useState(false);
  const [manual, setManual] = useState<ManualSectionSpec[]>([]);
  const [aiSource, setAiSource] = useState<AiSource>(null);
  const [useAi, setUseAi] = useState(true);

  useEffect(() => {
    const check = () => detectAiSource().then(setAiSource);
    check();
    window.addEventListener("exam-pilot-ai-key", check);
    return () => window.removeEventListener("exam-pilot-ai-key", check);
  }, []);

  const goals = exams.filter((e) => !e.parentExamId && !e.archived);
  const exam = exams.find((e) => e.id === examId);
  const rootId = exam?.parentExamId ?? exam?.id;
  const examTopics = useMemo(() => topics.filter((t) => t.examId === rootId), [topics, rootId]);
  const finalizedPrev = analyses.filter((a) => a.questions.length > 0);

  useEffect(() => {
    const p = getSearchParams().get("exam");
    const pick = p && exams.some((e) => e.id === p) ? p : [...exams].filter((e) => e.date <= today()).sort((a, b) => b.date.localeCompare(a.date))[0]?.id ?? exams[0]?.id ?? "__new";
    setExamId(pick);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (exam) {
      setTitle(exam.name);
      if (exam.date <= today()) setTakenOn(exam.date);
      const secs = exam.sections.length ? exam.sections : [{ name: "Section 1", subject: exam.subjects[0], rule: settings.defaultRule }];
      const perSec = exam.questionCount ? Math.max(1, Math.round(exam.questionCount / secs.length)) : 25;
      setManual(secs.map((s) => ({ name: s.name, subject: s.subject ?? exam.subjects[0] ?? "General", count: perSec, type: "single", rule: { ...s.rule } })));
    } else {
      setManual([{ name: "Section 1", subject: "General", count: 30, type: "single", rule: { ...settings.defaultRule } }]);
    }
    const prevOfExam = analyses.filter((a) => a.examId === examId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (prevOfExam) setReuseId(prevOfExam.id);
  }, [examId]); // eslint-disable-line react-hooks/exhaustive-deps

  const subjects = exam?.subjects.length ? exam.subjects : ["Physics", "Chemistry", "Mathematics"];
  const baseRule: MarkingRule = exam?.sections[0]?.rule ?? settings.defaultRule;

  /** Make sure an exam exists to attach the analysis to. */
  const ensureExam = (): { id: string; name: string } | null => {
    if (examId && examId !== "__new" && exam) return { id: exam.id, name: exam.name };
    const name = newExamName.trim();
    if (!name) {
      setError("Name the test you're analyzing (or pick an existing exam).");
      return null;
    }
    const parent = goals.find((g) => g.id === newParent);
    const id = createExam({
      name, date: takenOn, durationMinutes: parent?.durationMinutes ?? 180, subjects: parent?.subjects ?? subjects,
      sections: (parent?.sections ?? [{ id: uid("sec"), name: "Section 1", ordering: 0, rule: settings.defaultRule }]).map((s) => ({ ...s, id: uid("sec") })),
      priority: "medium", status: "completed", examType: "Mock test", parentExamId: parent?.id,
    }, []);
    return { id, name };
  };

  const finish = (a: Analysis, msg: string) => {
    if (timeUsed) a.timeUsedMinutes = Number(timeUsed);
    a.sources = [...a.sources, ...extraFiles.map((f) => ({ name: f.file.name, size: f.file.size, type: f.file.type, kind: f.kind, addedAt: new Date().toISOString() }))];
    createAnalysis(a);
    toast(msg);
    router.push(`/analyzer/${a.id}/review`);
  };

  const meta = (ex: { id: string; name: string }, method: Analysis["importMethod"], sources: FileRef[] = []) => ({
    examId: ex.id, title: title.trim() || ex.name, takenOn, rule: baseRule, subjects, topics: examTopics, sources, importMethod: method,
  });

  const fromText = (paper: string, key: string, ex: { id: string; name: string }, method: Analysis["importMethod"], sources: FileRef[], extraWarnings: string[] = [], titleOverride?: string) => {
    const parsed = parsePaperText(paper);
    if (!parsed.questions.length) {
      setError("No questions could be detected. The text may be a scan or an unusual layout. You can build the paper manually instead — your files stay attached as references.");
      return false;
    }
    let a = buildFromParsed(parsed, { ...meta(ex, method, sources), ...(titleOverride ? { title: titleOverride } : {}) });
    // Keep the exam's configured marking for matching subjects.
    a.sections = a.sections.map((s) => ({ ...s, rule: { ...(exam?.sections.find((x) => x.subject && x.subject === s.subject)?.rule ?? baseRule) } }));
    const warnings = [...extraWarnings, ...a.importWarnings];
    if (key.trim()) {
      const k = parseAnswerKey(key);
      const merged = mergeKey(a.questions, k.entries);
      a = { ...a, questions: merged.questions };
      warnings.push(...k.warnings, ...merged.warnings, `Answer key: ${merged.matched} of ${a.questions.length} answers matched (by ${merged.strategy === "number" ? "question number" : "paper order"}).`);
    } else {
      warnings.push("No answer key was provided. Enter correct answers in the review table (or paste the key there).");
    }
    a.importWarnings = warnings;
    finish(a, `Extracted ${a.questions.length} questions. Review them before scoring.`);
    return true;
  };

  /** Optional: structure the extracted text with Gemini, then review as usual. Falls back to the built-in parser on failure. */
  const aiFromText = async (paper: string, key: string, ex: { id: string; name: string }, method: Analysis["importMethod"], sources: FileRef[], extraWarnings: string[] = []) => {
    setBusy("Gemini is reading the paper…");
    try {
      const { result } = await aiStructurePaper(paper.replace(/^\[\[page \d+\]\]$/gm, "").replace(/\n{3,}/g, "\n\n"), key.replace(/^\[\[page \d+\]\]$/gm, ""), subjects, (done, total) => {
        if (total > 1) setBusy(`Gemini is reading the paper… part ${Math.min(done + 1, total)} of ${total}`);
      });
      const { paper: parsed, keys } = fromAiResult(result);
      if (!parsed.questions.length) throw new Error("AI found no questions");
      const a = buildFromParsed(parsed, meta(ex, method, sources));
      a.sections = a.sections.map((sec) => ({ ...sec, rule: { ...(exam?.sections.find((x) => x.subject && x.subject === sec.subject)?.rule ?? baseRule) } }));
      const ordered = [...a.questions].sort((x, y) => x.index - y.index);
      a.questions = ordered.map((q, i) => {
        const k = keys[i];
        if (!k) return q;
        return {
          ...q,
          chapter: q.chapter || k.chapter || "",
          correctAnswer: q.type === "numerical" ? [] : k.letters,
          numericalAnswer: q.type === "numerical" && k.value !== undefined ? { value: k.value, tolerance: 0 } : undefined,
          bonus: k.bonus || undefined,
          dropped: k.dropped || undefined,
          confidence: { ...q.confidence, answer: k.letters.length || k.value !== undefined || k.bonus || k.dropped ? 0.8 : 0 },
        };
      });
      a.importWarnings = [...extraWarnings, ...parsed.warnings];
      finish(a, `Gemini structured ${a.questions.length} questions. Review them before scoring.`);
    } catch (e) {
      toast(`${e instanceof Error ? e.message : "AI extraction failed"} — used the built-in parser instead.`, "warn", undefined, 6000);
      fromText(paper, key, ex, method, sources, [...extraWarnings, "AI structuring failed; the built-in parser was used."]);
    }
  };

  const run = async () => {
    setError(null);
    const ex = ensureExam();
    if (!ex) return;
    try {
      if (source === "sample") {
        const t = !title.trim() || title === exam?.name ? "Practice Test 07 (sample)" : title;
        fromText(SAMPLE_PAPER, SAMPLE_KEY, ex, "text", [{ name: "Sample practice test (built-in)", size: SAMPLE_PAPER.length, type: "text/plain", kind: "paper", addedAt: new Date().toISOString() }], [], t);
        return;
      }
      if (source === "paste") {
        if (!paperText.trim()) return setError("Paste the question paper text first, or choose manual entry.");
        if (aiSource && useAi) await aiFromText(paperText, keyText, ex, "text", []);
        else fromText(paperText, keyText, ex, "text", []);
        return;
      }
      if (source === "manual") {
        const total = manual.reduce((m, s) => m + (s.count || 0), 0);
        if (!total) return setError("Add at least one question.");
        if (total > 400) return setError("That's more than 400 questions — split it into separate analyses.");
        let a = buildManual(manual, meta(ex, "manual"), restart);
        if (keyText.trim()) {
          const merged = mergeKey(a.questions, parseAnswerKey(keyText).entries);
          a = { ...a, questions: merged.questions, importWarnings: merged.warnings };
        }
        finish(a, `Created ${a.questions.length} questions. Fill in the answer key in review.`);
        return;
      }
      if (source === "reuse") {
        const prev = analyses.find((x) => x.id === reuseId);
        if (!prev) return setError("Pick a previous paper to reuse.");
        const a = duplicateStructure(prev, { examId: ex.id, title: title.trim() || ex.name, takenOn, importMethod: "duplicate" }, keepContent);
        finish(a, keepContent ? "Paper copied. Enter your new answers." : "Structure copied. Enter the new answer key in review.");
        return;
      }
      // upload
      if (!paperFiles.length && !keyFile) return setError("Add the question paper (and ideally the answer key), or pick another input method.");
      const sources: FileRef[] = [];
      const texts: string[] = [];
      const warnings: string[] = [];
      for (const [i, f] of paperFiles.entries()) {
        const r = await extractText(f.file, "paper", (m) => setBusy(`${paperFiles.length > 1 ? `File ${i + 1}/${paperFiles.length}: ` : ""}${m}`));
        sources.push(r.ref);
        texts.push(r.text);
        warnings.push(...r.warnings.map((w) => `${f.file.name}: ${w}`));
      }
      let key = "";
      if (keyFile) {
        setBusy("Reading answer key…");
        const r = await extractText(keyFile.file, "key", (m) => setBusy(`Answer key: ${m}`));
        sources.push(r.ref);
        key = r.text;
        warnings.push(...r.warnings.map((w) => `Answer key: ${w}`));
      }
      setBusy("Detecting questions, options and sections…");
      if (!paperFiles.length) {
        // Key only: build structure from the key.
        const k = parseAnswerKey(key);
        if (!k.entries.length) return setError("No answers could be read from the key. Try pasting it, or use manual entry.");
        const a = buildManual([{ name: "Section 1", subject: subjects[0] ?? "General", count: k.entries.length, type: "single", rule: baseRule }], meta(ex, "manual", sources));
        const merged = mergeKey(a.questions, k.entries);
        finish({ ...a, questions: merged.questions, importWarnings: [...warnings, "Only an answer key was provided, so questions have no text. You can still score and diagnose them.", ...merged.warnings] }, `Created ${a.questions.length} questions from the answer key.`);
        return;
      }
      const method = paperFiles.some((f) => /pdf/i.test(f.file.type) || f.file.name.endsWith(".pdf")) ? "pdf" : "image";
      if (aiSource && useAi) await aiFromText(texts.join("\n"), key, ex, method, sources, warnings);
      else fromText(texts.join("\n"), key, ex, method, sources, warnings);
    } catch (e) {
      setError(e instanceof ExtractError ? e.message : "Something went wrong while reading your files. Nothing was lost — try again, paste the text, or build the paper manually.");
    } finally {
      setBusy(null);
    }
  };

  const addPaper = (files: File[]) => setPaperFiles((p) => [...p, ...files.map((file) => ({ file, kind: "paper" as const }))]);

  return (
    <div className="animate-in">
      <PageHeader eyebrow="Exam Analyzer" title="Analyze an exam" subtitle="Import the paper and key, verify them, confirm marking, enter your answers — then see exactly where marks went." />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="1. Which exam is this?" />
            <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
              <Field label="Exam" htmlFor="exam" className="sm:col-span-2">
                <Select id="exam" value={examId} onChange={(e) => setExamId(e.target.value)}>
                  <option value="__new">+ A new test (not in My Exams yet)</option>
                  {exams.filter((e) => !e.archived).sort((a, b) => b.date.localeCompare(a.date)).map((e) => <option key={e.id} value={e.id}>{e.name}{e.parentExamId ? " (mock)" : ""} — {e.date}</option>)}
                </Select>
              </Field>
              {examId === "__new" && (
                <>
                  <Field label="Test name" htmlFor="nname"><Input id="nname" value={newExamName} onChange={(e) => { setNewExamName(e.target.value); setTitle(e.target.value); }} placeholder="e.g. Allen Minor Test 6" /></Field>
                  <Field label="Counts toward" htmlFor="npar" hint="Its findings will update that exam's plan.">
                    <Select id="npar" value={newParent} onChange={(e) => setNewParent(e.target.value)}><option value="">— Not linked —</option>{goals.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select>
                  </Field>
                </>
              )}
              <Field label="Analysis title" htmlFor="title"><Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Defaults to the exam name" /></Field>
              <Field label="Date taken" htmlFor="taken"><Input id="taken" type="date" max={today()} value={takenOn} onChange={(e) => setTakenOn(e.target.value)} /></Field>
            </div>
          </Card>

          <Card>
            <CardHeader title="2. Question paper & answer key" subtitle="Everything is processed on this device. Extraction is never trusted blindly — you'll review every question next." />
            <div className="px-5 pb-5">
              <Tabs value={source} onChange={(v) => { setSource(v); setError(null); }} className="mb-5" tabs={[
                { value: "upload", label: "Upload files", icon: Upload },
                { value: "paste", label: "Paste text", icon: ClipboardPaste },
                { value: "manual", label: "Enter manually", icon: Keyboard },
                { value: "reuse", label: "Reuse a previous paper", icon: Copy },
                { value: "sample", label: "Try a sample", icon: Sparkles },
              ]} />

              {source === "upload" && (
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <div className="label">Question paper</div>
                      <FileDrop onFiles={addPaper} busy={busy && busy.includes("File") ? busy : null} multiple label="PDF or page photos" hint="Several images = several pages, in order" compact />
                      <FileList files={paperFiles} onRemove={(i) => setPaperFiles((p) => p.filter((_, j) => j !== i))} />
                    </div>
                    <div>
                      <div className="label">Answer key</div>
                      <FileDrop onFiles={(f) => f[0] && setKeyFile({ file: f[0], kind: "key" })} label="PDF, photo or .txt" hint="Optional — you can type it in review" compact />
                      <FileList files={keyFile ? [keyFile] : []} onRemove={() => setKeyFile(null)} />
                    </div>
                  </div>
                  <details className="rounded-lg border border-border px-4 py-3">
                    <summary className="text-sm font-medium">Optional: response sheet, result page, time used</summary>
                    <div className="mt-3 grid gap-4 md:grid-cols-2">
                      <div>
                        <FileDrop onFiles={(f) => setExtraFiles((x) => [...x, ...f.map((file) => ({ file, kind: (file.name.toLowerCase().includes("result") ? "result_page" : "response_sheet") as FileRef["kind"] }))])} label="Marked response sheet / institute result page" hint="Kept as a reference with the analysis. You'll enter answers in the fast grid." compact />
                        <FileList files={extraFiles} onRemove={(i) => setExtraFiles((p) => p.filter((_, j) => j !== i))} />
                      </div>
                      <Field label="Total time used (minutes)" htmlFor="tu"><Input id="tu" type="number" min={0} value={timeUsed} onChange={(e) => setTimeUsed(e.target.value ? Number(e.target.value) : "")} /></Field>
                    </div>
                  </details>
                  <p className="flex flex-wrap items-center gap-2 text-xs text-fg-3">
                    <Download className="size-3.5" aria-hidden /> No paper handy? Download the sample
                    <a href={SAMPLE_PAPER_PDF} download="sample-question-paper.pdf" className="font-medium text-accent-text hover:underline">question paper</a> and
                    <a href={SAMPLE_KEY_PDF} download="sample-answer-key.pdf" className="font-medium text-accent-text hover:underline">answer key</a> PDFs.
                  </p>
                </div>
              )}

              {source === "paste" && (
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Question paper text" htmlFor="pt" hint="Copy from a PDF viewer. Numbered questions with (A)–(D) options work best.">
                    <Textarea id="pt" rows={12} value={paperText} onChange={(e) => setPaperText(e.target.value)} className="font-mono text-xs" placeholder={"PHYSICS\n1. A ball is thrown…\n(A) 10 m (B) 20 m (C) 30 m (D) 40 m"} />
                  </Field>
                  <Field label="Answer key text" htmlFor="kt" hint="Formats like “1. A”, “1-(C)”, “Q3: B,D”, “4 bonus”, or a two-column table.">
                    <Textarea id="kt" rows={12} value={keyText} onChange={(e) => setKeyText(e.target.value)} className="font-mono text-xs" placeholder={"1. B  2. C  3. A,D  4. 2.5"} />
                  </Field>
                </div>
              )}

              {source === "manual" && (
                <div className="space-y-4">
                  <p className="text-sm text-fg-2">No paper text needed — define the structure, then enter the key and your answers. Question text can be added later if you want it in the Question Bank.</p>
                  {manual.map((s, i) => (
                    <div key={i} className="grid items-end gap-2 rounded-xl border border-border p-3 sm:grid-cols-[1fr_1fr_90px_130px_150px_auto]">
                      <Field label="Section" htmlFor={`ms-n-${i}`}><Input id={`ms-n-${i}`} value={s.name} onChange={(e) => setManual(manual.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} /></Field>
                      <Field label="Subject" htmlFor={`ms-s-${i}`}><Input id={`ms-s-${i}`} list="subjects-dl" value={s.subject} onChange={(e) => setManual(manual.map((x, j) => (j === i ? { ...x, subject: e.target.value } : x)))} /></Field>
                      <Field label="Questions" htmlFor={`ms-c-${i}`}><Input id={`ms-c-${i}`} type="number" min={1} max={200} value={s.count} onChange={(e) => setManual(manual.map((x, j) => (j === i ? { ...x, count: Math.max(0, Number(e.target.value)) } : x)))} /></Field>
                      <Field label="Type" htmlFor={`ms-t-${i}`}>
                        <Select id={`ms-t-${i}`} value={s.type} onChange={(e) => setManual(manual.map((x, j) => (j === i ? { ...x, type: e.target.value as QuestionType } : x)))}>
                          <option value="single">Single correct</option><option value="multiple">Multiple correct</option><option value="numerical">Numerical</option>
                        </Select>
                      </Field>
                      <Field label="Marking" htmlFor={`ms-r-${i}`}>
                        <Select id={`ms-r-${i}`} value={MARKING_PRESETS.find((p) => JSON.stringify(p.rule) === JSON.stringify(s.rule))?.id ?? ""} onChange={(e) => { const p = MARKING_PRESETS.find((x) => x.id === e.target.value); if (p) setManual(manual.map((x, j) => (j === i ? { ...x, rule: { ...p.rule } } : x))); }}>
                          <option value="">+{s.rule.correct}/−{s.rule.wrong}/{s.rule.unattempted} (custom)</option>
                          {MARKING_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </Select>
                      </Field>
                      <Button variant="ghost" icon={Trash2} aria-label="Remove section" disabled={manual.length === 1} onClick={() => setManual(manual.filter((_, j) => j !== i))} />
                    </div>
                  ))}
                  <datalist id="subjects-dl">{subjects.map((s) => <option key={s} value={s} />)}</datalist>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Button size="sm" icon={Plus} onClick={() => setManual([...manual, { name: `Section ${manual.length + 1}`, subject: subjects[manual.length % subjects.length] ?? "General", count: 10, type: "single", rule: { ...baseRule } }])}>Add section</Button>
                    <div className="w-80"><Switch checked={restart} onChange={setRestart} label="Numbering restarts in each section" /></div>
                  </div>
                  <Field label="Answer key (optional — paste now or fill in during review)" htmlFor="mk">
                    <Textarea id="mk" rows={3} value={keyText} onChange={(e) => setKeyText(e.target.value)} className="font-mono text-xs" placeholder="1. B 2. C 3. A …" />
                  </Field>
                  <p className="text-xs text-fg-3">Total: {manual.reduce((m, s) => m + s.count, 0)} questions · max {manual.reduce((m, s) => m + s.count * s.rule.correct, 0)} marks</p>
                </div>
              )}

              {source === "reuse" && (
                finalizedPrev.length ? (
                  <div className="space-y-4">
                    <Field label="Previous paper" htmlFor="reuse">
                      <Select id="reuse" value={reuseId} onChange={(e) => setReuseId(e.target.value)}>
                        <option value="" disabled>Choose…</option>
                        {[...finalizedPrev].sort((a, b) => b.takenOn.localeCompare(a.takenOn)).map((a) => <option key={a.id} value={a.id}>{a.title} — {a.questions.length} Q · {a.takenOn}</option>)}
                      </Select>
                    </Field>
                    <div className="grid gap-3 md:grid-cols-2" role="radiogroup" aria-label="What to copy">
                      {[
                        { v: false, t: "New paper, same format", d: "Copies sections, question count, subjects and marking. You enter the new key. Best for the next test in a series." },
                        { v: true, t: "Same paper (retake)", d: "Copies questions, options, topics and the answer key. You only enter your new answers." },
                      ].map((o) => (
                        <button key={String(o.v)} role="radio" aria-checked={keepContent === o.v} onClick={() => setKeepContent(o.v)}
                          className={cn("rounded-xl border p-4 text-left transition", keepContent === o.v ? "border-accent bg-accent-soft/50" : "border-border hover:border-border-strong")}>
                          <div className="text-sm font-semibold">{o.t}</div><div className="mt-1 text-xs text-fg-2">{o.d}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : <p className="text-sm text-fg-3">No previous papers yet. After your first analysis you can reuse its structure and marking here.</p>
              )}

              {source === "sample" && (
                <div className="space-y-3">
                  <p className="text-sm text-fg-2">Runs a built-in 14-question PCM practice test through the same import pipeline you'd use for a real PDF, including a skipped question number, restarted numbering, a figure reference, a multiple-correct question and a numerical section.</p>
                  <pre className="max-h-48 overflow-auto rounded-lg border border-border bg-surface-2 p-3 text-[11px] leading-relaxed text-fg-2 scroll-thin">{SAMPLE_PAPER.slice(0, 700)}…</pre>
                </div>
              )}

              {error && (
                <Callout tone="bad" className="mt-4" title="Import didn't work" action={source !== "manual" && <Button size="sm" onClick={() => { setSource("manual"); setError(null); }}>Enter manually instead</Button>}>{error}</Callout>
              )}
            </div>
          </Card>
        </div>

        <aside aria-label="What happens next" className="lg:sticky lg:top-8 lg:self-start">
          <Card className="p-5">
            <h2 className="text-sm font-semibold">What happens next</h2>
            <ol className="mt-3 space-y-2.5 text-sm text-fg-2">
              {["Review extracted questions & key — fix anything flagged", "Confirm the marking scheme", "Enter your answers in a fast grid", "See results, then tag why you lost marks", "Your Exam Pilot plan updates automatically"].map((s, i) => (
                <li key={s} className="flex gap-2.5"><span className="grid size-5 shrink-0 place-items-center rounded-full bg-surface-3 text-[11px] font-semibold">{i + 1}</span>{s}</li>
              ))}
            </ol>
            {(source === "upload" || source === "paste") && (aiSource ? (
              <div className="mt-5 rounded-lg border border-border p-3">
                <Switch checked={useAi} onChange={setUseAi} label={<span className="inline-flex items-center gap-1.5"><Sparkles className="size-3.5 text-accent-text" aria-hidden />Structure with Gemini</span>}
                  description="Better on messy PDFs and photos: rebuilds questions, options, sections and key answers. Sends the extracted text (not your answers) to Google; free on Gemini's free tier. Still fully reviewed before scoring." />
              </div>
            ) : (
              <p className="mt-5 text-xs text-fg-3"><Sparkles className="mr-1 inline size-3.5 text-accent-text" aria-hidden />Tip: add a free Google Gemini API key in <b>Settings → AI assistance</b> to let Gemini structure messy papers. Without it, the built-in parser is used.</p>
            ))}
            <Button variant="primary" className="mt-5 w-full" iconRight={ArrowRight} loading={!!busy} onClick={run}>
              {source === "manual" ? "Create questions" : source === "reuse" ? "Copy paper" : "Extract questions"}
            </Button>
            {busy && <p className="mt-2 text-center text-xs text-fg-3" aria-live="polite">{busy}</p>}
            <p className="mt-3 text-center text-xs text-fg-3">Drafts autosave. You can leave and resume any time.</p>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function FileList({ files, onRemove }: { files: Loaded[]; onRemove: (i: number) => void }) {
  if (!files.length) return null;
  return (
    <ul className="mt-2 space-y-1.5">
      {files.map((f, i) => (
        <li key={f.file.name + i} className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm">
          <FileText className="size-4 text-fg-3" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{f.file.name}</span>
          <Badge tone="neutral">{formatBytes(f.file.size)}</Badge>
          <button onClick={() => onRemove(i)} className="rounded p-0.5 text-fg-3 hover:text-bad" aria-label={`Remove ${f.file.name}`}><X className="size-4" /></button>
        </li>
      ))}
    </ul>
  );
}
