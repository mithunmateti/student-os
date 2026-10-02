"use client";
/** Shared editors: syllabus, syllabus import review, marking scheme, file drop. */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronRight, FileUp, GitMerge, LoaderCircle, Plus, Search, Sparkles, Split, Trash2, Upload, X } from "lucide-react";
import { MARKING_PRESETS } from "@/domain/catalog";
import { parseSyllabusText } from "@/domain/import/parser";
import { describeRule } from "@/domain/scoring";
import type { CoverageStatus, Difficulty, ExamSection, MarkingRule, Priority, SyllabusTopic } from "@/domain/types";
import { formatDate, uid } from "@/domain/util";
import { aiExtractSyllabus, detectAiSource, type AiSource } from "@/lib/ai/client";
import { ACCEPT, extractText, ExtractError, formatBytes } from "@/lib/extract";
import { Badge, Button, Callout, cn, Dialog, Field, Input, Select, Switch, Textarea, toast } from "./ui";
import { DifficultyPicker } from "./domain";

/* ------------------------------------------------------------------ */
/* Syllabus editor                                                     */
/* ------------------------------------------------------------------ */

export type EditableTopic = Pick<SyllabusTopic, "id" | "subject" | "chapter" | "topic" | "priority" | "difficulty" | "coverage">;

export interface SyllabusOps {
  update: (id: string, patch: Partial<EditableTopic>) => void;
  remove: (ids: string[]) => void;
  merge: (ids: string[], name: string) => void;
  split: (id: string, names: string[]) => void;
  add: (topics: Omit<EditableTopic, "id">[]) => void;
  setCoverage?: (id: string, c: CoverageStatus) => void;
}

const COVERAGE_LABEL: Record<CoverageStatus, string> = { not_started: "Not started", learning: "Learning", covered: "Covered", revised: "Revised" };

export function SyllabusEditor({ topics, ops, subjects, showCoverage = true }: { topics: EditableTopic[]; ops: SyllabusOps; subjects: string[]; showCoverage?: boolean }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [mergeOpen, setMergeOpen] = useState(false);
  const [splitId, setSplitId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const filtered = useMemo(() => {
    const n = q.toLowerCase().trim();
    return n ? topics.filter((t) => `${t.subject} ${t.chapter} ${t.topic}`.toLowerCase().includes(n)) : topics;
  }, [topics, q]);
  const grouped = useMemo(() => {
    const m = new Map<string, Map<string, EditableTopic[]>>();
    for (const t of filtered) {
      const s = m.get(t.subject) ?? m.set(t.subject, new Map()).get(t.subject)!;
      (s.get(t.chapter) ?? s.set(t.chapter, []).get(t.chapter)!).push(t);
    }
    return m;
  }, [filtered]);
  const sel = [...selected].filter((id) => topics.some((t) => t.id === id));
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleOpen = (k: string) => setOpen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const allOpen = q.trim().length > 0;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-fg-3" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search topics" className="pl-8" aria-label="Search topics" />
        </div>
        {topics.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setSelected(sel.length === filtered.length ? new Set() : new Set(filtered.map((t) => t.id)))}>
            {sel.length === filtered.length && sel.length > 0 ? "Select none" : `Select all${q.trim() ? " shown" : ""}`}
          </Button>
        )}
        <Button size="sm" icon={Plus} onClick={() => setAddOpen(true)}>Add topics</Button>
      </div>
      {sel.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-accent/30 bg-accent-soft/60 px-3 py-2 text-sm animate-in">
          <span className="font-medium">{sel.length} selected</span>
          <span className="text-fg-3">·</span>
          <label className="flex items-center gap-1.5 text-xs text-fg-2">Priority
            <Select className="h-7 w-28 py-0 text-xs" value="" onChange={(e) => { sel.forEach((id) => ops.update(id, { priority: e.target.value as Priority })); }}>
              <option value="" disabled>Set…</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
            </Select>
          </label>
          <Button size="xs" variant="ghost" icon={GitMerge} disabled={sel.length < 2} onClick={() => setMergeOpen(true)}>Merge</Button>
          <Button size="xs" variant="ghost" icon={Split} disabled={sel.length !== 1} onClick={() => setSplitId(sel[0])}>Split</Button>
          <Button size="xs" variant="ghost" icon={Trash2} className="text-bad" onClick={() => {
            if (sel.length > 10 && !window.confirm(`Delete ${sel.length} topics? Their scheduled study tasks are removed too.`)) return;
            ops.remove(sel); setSelected(new Set()); toast(`Deleted ${sel.length} topic${sel.length === 1 ? "" : "s"}`);
          }}>Delete</Button>
          <Button size="xs" variant="ghost" onClick={() => setSelected(new Set())} className="ml-auto">Clear</Button>
        </div>
      )}

      <div className="mt-3 space-y-3">
        {[...grouped.entries()].map(([subject, chapters]) => (
          <div key={subject} className="rounded-xl border border-border">
            <div className="flex items-center justify-between border-b border-border bg-surface-2 px-3 py-2 rounded-t-xl">
              <span className="text-sm font-semibold">{subject}</span>
              <span className="text-xs text-fg-3">{[...chapters.values()].flat().length} topics · {chapters.size} chapters</span>
            </div>
            <ul className="divide-y divide-border">
              {[...chapters.entries()].map(([chapter, list]) => {
                const key = `${subject}::${chapter}`;
                const isOpen = allOpen || open.has(key);
                const covered = list.filter((t) => t.coverage === "covered" || t.coverage === "revised").length;
                return (
                  <li key={key}>
                    <div className="flex items-center gap-2 px-3 py-2">
                      <input type="checkbox" aria-label={`Select all topics in ${chapter}`} className="size-4 accent-[var(--accent)]"
                        checked={list.every((t) => selected.has(t.id))}
                        onChange={(e) => setSelected((s) => { const n = new Set(s); list.forEach((t) => (e.target.checked ? n.add(t.id) : n.delete(t.id))); return n; })} />
                      <button onClick={() => toggleOpen(key)} className="flex flex-1 items-center gap-1.5 text-left text-sm font-medium" aria-expanded={isOpen}>
                        <ChevronRight className={cn("size-4 text-fg-3 transition", isOpen && "rotate-90")} aria-hidden />
                        {chapter}
                      </button>
                      <span className="text-xs text-fg-3 tabular">{showCoverage ? `${covered}/${list.length} covered` : `${list.length} topics`}</span>
                    </div>
                    {isOpen && (
                      <ul className="border-t border-border/60 bg-surface-2/50 pb-1">
                        {list.map((t) => (
                          <li key={t.id} className="flex flex-wrap items-center gap-2 py-1.5 pr-3 pl-9">
                            <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={selected.has(t.id)} onChange={() => toggle(t.id)} aria-label={`Select ${t.topic}`} />
                            <input defaultValue={t.topic} aria-label="Topic name"
                              onBlur={(e) => e.target.value.trim() && e.target.value !== t.topic && ops.update(t.id, { topic: e.target.value.trim() })}
                              className="min-w-40 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm hover:border-border focus:border-ring focus:bg-surface focus:outline-none" />
                            <Select aria-label="Priority" className="h-7 w-24 py-0 text-xs" value={t.priority} onChange={(e) => ops.update(t.id, { priority: e.target.value as Priority })}>
                              <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
                            </Select>
                            <DifficultyPicker size="xs" label={`Difficulty of ${t.topic}`} value={t.difficulty} onChange={(d) => ops.update(t.id, { difficulty: d })} />
                            {showCoverage && (
                              <Select aria-label="Coverage" className="h-7 w-28 py-0 text-xs" value={t.coverage}
                                onChange={(e) => (ops.setCoverage ? ops.setCoverage(t.id, e.target.value as CoverageStatus) : ops.update(t.id, { coverage: e.target.value as CoverageStatus }))}>
                                {Object.entries(COVERAGE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                              </Select>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {!topics.length && <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-fg-3">No topics yet. Import your syllabus, or add subjects and chapters with “Add topics”.</p>}
        {topics.length > 0 && !filtered.length && <p className="px-2 py-4 text-sm text-fg-3">No topics match “{q}”.</p>}
      </div>

      <MergeDialog open={mergeOpen} onClose={() => setMergeOpen(false)} topics={topics.filter((t) => selected.has(t.id))}
        onMerge={(name) => { ops.merge(sel, name); setSelected(new Set()); toast("Topics merged"); }} />
      <SplitDialog topic={topics.find((t) => t.id === splitId)} onClose={() => setSplitId(null)}
        onSplit={(names) => { ops.split(splitId!, names); setSelected(new Set()); toast(`Split into ${names.length} topics`); }} />
      <AddTopicsDialog open={addOpen} onClose={() => setAddOpen(false)} subjects={subjects} chapters={[...new Set(topics.map((t) => `${t.subject}::${t.chapter}`))]}
        onAdd={(list) => { ops.add(list); toast(`Added ${list.length} topic${list.length === 1 ? "" : "s"}`); }} />
    </div>
  );
}

function MergeDialog({ open, onClose, topics, onMerge }: { open: boolean; onClose: () => void; topics: EditableTopic[]; onMerge: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <Dialog open={open} onClose={onClose} title={`Merge ${topics.length} topics`} description="Tasks and revision checkpoints move to the merged topic."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!name.trim() && !topics[0]} onClick={() => { onMerge(name.trim() || topics.map((t) => t.topic).join(" & ")); onClose(); setName(""); }}>Merge</Button></>}>
      <ul className="mb-3 space-y-1 text-sm text-fg-2">{topics.map((t) => <li key={t.id}>• {t.chapter} › {t.topic}</li>)}</ul>
      <Field label="Merged topic name" htmlFor="merge-name"><Input id="merge-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={topics.map((t) => t.topic).join(" & ")} /></Field>
    </Dialog>
  );
}

function SplitDialog({ topic, onClose, onSplit }: { topic?: EditableTopic; onClose: () => void; onSplit: (names: string[]) => void }) {
  const [text, setText] = useState("");
  const names = text.split("\n").map((s) => s.trim()).filter(Boolean);
  return (
    <Dialog open={!!topic} onClose={onClose} title={`Split “${topic?.topic ?? ""}”`} description="One new topic per line. They keep the same chapter, priority and coverage."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={names.length < 2} onClick={() => { onSplit(names); onClose(); setText(""); }}>Split into {names.length || "…"}</Button></>}>
      <Textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Topic part 1\nTopic part 2"} aria-label="New topic names" />
    </Dialog>
  );
}

function AddTopicsDialog({ open, onClose, subjects, chapters, onAdd }: { open: boolean; onClose: () => void; subjects: string[]; chapters: string[]; onAdd: (t: Omit<EditableTopic, "id">[]) => void }) {
  const [subject, setSubject] = useState(subjects[0] ?? "");
  const [chapter, setChapter] = useState("");
  const [text, setText] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const names = text.split(/\n|;/).map((s) => s.trim()).filter(Boolean);
  const submit = () => {
    const ch = chapter.trim();
    if (!subject.trim() || !ch) return;
    onAdd((names.length ? names : [ch]).map((topic) => ({ subject: subject.trim(), chapter: ch, topic, priority, difficulty: "medium", coverage: "not_started" })));
    setText("");
    onClose();
  };
  return (
    <Dialog open={open} onClose={onClose} title="Add topics"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit} disabled={!subject.trim() || !chapter.trim()}>Add {names.length || 1} topic{names.length > 1 ? "s" : ""}</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Subject" htmlFor="add-subj">
          <Input id="add-subj" list="subj-list" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Physics" />
          <datalist id="subj-list">{subjects.map((s) => <option key={s} value={s} />)}</datalist>
        </Field>
        <Field label="Chapter" htmlFor="add-ch">
          <Input id="add-ch" list="ch-list" value={chapter} onChange={(e) => setChapter(e.target.value)} placeholder="e.g. Kinematics" />
          <datalist id="ch-list">{chapters.filter((c) => c.startsWith(subject + "::")).map((c) => <option key={c} value={c.split("::")[1]} />)}</datalist>
        </Field>
      </div>
      <Field label="Topics (one per line)" htmlFor="add-topics" className="mt-3" hint="Leave empty to add the chapter as a single topic.">
        <Textarea id="add-topics" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Projectile motion\nRelative velocity"} />
      </Field>
      <Field label="Priority" htmlFor="add-prio" className="mt-3">
        <Select id="add-prio" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></Select>
      </Field>
    </Dialog>
  );
}

/** Local (draft) implementation of syllabus ops for forms. */
export function useDraftSyllabus(initial: EditableTopic[] = []) {
  const [topics, setTopics] = useState<EditableTopic[]>(initial);
  const ops: SyllabusOps = {
    update: (id, patch) => setTopics((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t))),
    remove: (ids) => setTopics((ts) => ts.filter((t) => !ids.includes(t.id))),
    merge: (ids, name) => setTopics((ts) => ts.filter((t) => !ids.slice(1).includes(t.id)).map((t) => (t.id === ids[0] ? { ...t, topic: name } : t))),
    split: (id, names) => setTopics((ts) => ts.flatMap((t) => (t.id === id ? names.map((n, i) => ({ ...t, id: i ? uid("top") : t.id, topic: n })) : [t]))),
    add: (list) => setTopics((ts) => [...ts, ...list.map((t) => ({ ...t, id: uid("top") }))]),
  };
  return { topics, setTopics, ops };
}

/* ------------------------------------------------------------------ */
/* Syllabus import (PDF / image / text → review → import)              */
/* ------------------------------------------------------------------ */

export interface ImportedExamInfo {
  name: string | null;
  date: string | null;
  pattern: string | null;
  durationMinutes: number | null;
}

type Row = Omit<EditableTopic, "id"> & { keep: boolean; key: string };

export function SyllabusImport({ open, onClose, fallbackSubject, subjects = [], onImport, onExamInfo, existingCount = 0, replaceByDefault = false }: {
  open: boolean; onClose: () => void; fallbackSubject?: string; subjects?: string[];
  onImport: (topics: Omit<EditableTopic, "id">[], opts: { replace: boolean }) => void;
  /** Topics already in the syllabus; when > 0 the student can choose to replace them. */
  existingCount?: number;
  replaceByDefault?: boolean;
  /** When provided, detected exam details (date, duration…) can be applied to the exam. */
  onExamInfo?: (info: ImportedExamInfo) => void;
}) {
  const [stage, setStage] = useState<"input" | "review">("input");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [aiSource, setAiSource] = useState<AiSource>(null);
  const [useAi, setUseAi] = useState(true);
  const [method, setMethod] = useState<{ kind: "ai" | "rules"; note?: string } | null>(null);
  const [ignored, setIgnored] = useState<string[]>([]);
  const [info, setInfo] = useState<ImportedExamInfo | null>(null);
  const [applyInfo, setApplyInfo] = useState(true);
  const [showIgnored, setShowIgnored] = useState(false);
  const [replace, setReplace] = useState(replaceByDefault);

  useEffect(() => {
    if (open) {
      detectAiSource().then(setAiSource);
      setReplace(replaceByDefault);
    }
  }, [open, replaceByDefault]);

  const reset = () => { setStage("input"); setText(""); setRows([]); setError(null); setFileName(null); setMethod(null); setIgnored([]); setInfo(null); setShowIgnored(false); };
  const close = () => { reset(); onClose(); };
  const toRows = (list: { subject: string; chapter: string; topic: string }[]): Row[] =>
    list.map((p, i) => ({ ...p, priority: "medium", difficulty: "medium", coverage: "not_started", keep: true, key: String(i) }));

  const parseWithRules = (raw: string, note?: string) => {
    const parsed = parseSyllabusText(raw, fallbackSubject || "General");
    if (!parsed.length) {
      setError("No topics could be recognised. Try pasting just the syllabus part as a list (one chapter per line).");
      return;
    }
    setRows(toRows(parsed));
    setMethod({ kind: "rules", note });
    setIgnored([]);
    setInfo(null);
    setStage("review");
  };

  const parse = async (raw: string) => {
    setError(null);
    const clean = raw.replace(/\[\[page \d+\]\]\n?/g, "");
    if (aiSource && useAi) {
      setBusy("Finding the syllabus with Gemini…");
      try {
        const r = await aiExtractSyllabus(clean, subjects);
        if (!r.topics.length) {
          parseWithRules(raw, "Gemini found no syllabus in this text, so the built-in rules were used.");
          return;
        }
        setRows(toRows(r.topics));
        setIgnored(r.ignored);
        const hasInfo = !!(r.examInfo.date || r.examInfo.durationMinutes || r.examInfo.pattern || r.examInfo.name);
        setInfo(hasInfo ? r.examInfo : null);
        setMethod({ kind: "ai" });
        setStage("review");
      } catch (e) {
        parseWithRules(raw, `${e instanceof Error ? e.message : "AI extraction failed"} Used the built-in rules instead — check the rows carefully.`);
      } finally {
        setBusy(null);
      }
      return;
    }
    parseWithRules(raw);
  };

  const onFile = async (file: File) => {
    setError(null);
    setBusy("Reading file…");
    try {
      const r = await extractText(file, "syllabus", (m) => setBusy(m));
      setFileName(`${file.name} · ${formatBytes(file.size)}`);
      setText(r.text.replace(/\[\[page \d+\]\]\n?/g, ""));
      await parse(r.text);
    } catch (e) {
      setError(e instanceof ExtractError ? e.message : "Something went wrong reading that file. You can paste the text instead.");
    } finally {
      setBusy(null);
    }
  };
  const kept = rows.filter((r) => r.keep);
  const infoLine = info && [
    info.name,
    info.date && `exam date ${formatDate(info.date)}`,
    info.pattern && `${info.pattern} pattern`,
    info.durationMinutes && `${info.durationMinutes} min`,
  ].filter(Boolean).join(" · ");

  return (
    <Dialog open={open} onClose={close} size="xl" title="Import syllabus" description={stage === "input" ? "Upload a PDF/image or paste text. You'll review everything before it's saved." : "Check the topics, set how hard each one is for you, then add them to your plan."}
      footer={stage === "input" ? (
        <><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" loading={!!busy} disabled={!text.trim()} onClick={() => parse(text)}>Extract topics</Button></>
      ) : (
        <><Button variant="ghost" onClick={() => setStage("input")}>Back</Button><Button variant="primary" disabled={!kept.length} onClick={() => {
          onImport(kept.map(({ keep: _k, key: _key, ...t }) => t), { replace: existingCount > 0 && replace });
          if (info && applyInfo && onExamInfo) onExamInfo(info);
          close();
        }}>Add {kept.length} topic{kept.length === 1 ? "" : "s"} to my plan</Button></>
      )}>
      {stage === "input" ? (
        <div className="space-y-4">
          <FileDrop onFiles={(f) => f[0] && onFile(f[0])} busy={busy} label="Drop a syllabus PDF, image or .txt" />
          {fileName && <p className="text-xs text-fg-3">Loaded {fileName}</p>}
          {error && <Callout tone="bad">{error}</Callout>}
          {aiSource ? (
            <div className="rounded-lg border border-border px-3 py-2.5">
              <Switch checked={useAi} onChange={setUseAi} label={<span className="inline-flex items-center gap-1.5"><Sparkles className="size-3.5 text-accent-text" aria-hidden />Find the syllabus with Gemini</span>}
                description="Picks out just the syllabus from notices (skipping dates, timings, headers), fixes wrapped chapter names, and detects the exam date. Costs well under a cent per syllabus." />
            </div>
          ) : (
            <p className="text-xs text-fg-3"><Sparkles className="mr-1 inline size-3.5 text-accent-text" aria-hidden />Tip: add a free Google Gemini API key in <b>Settings → AI assistance</b> and Gemini will pick the syllabus out of notices automatically. Without it, built-in rules are used.</p>
          )}
          <Field label="…or paste syllabus text" htmlFor="syl-text" hint="Subject headings (e.g. PHYSICS), chapters as “Unit 1: Kinematics” or lines ending in “:”, topics as bullets or comma lists.">
            <Textarea id="syl-text" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={"PHYSICS\nUnit 1: Kinematics - motion in 1D, projectile motion\nUnit 2: Laws of Motion\n- Newton's laws\n- Friction"} className="font-mono text-xs" />
          </Field>
        </div>
      ) : (
        <div className="space-y-3">
          {method?.kind === "ai" ? (
            <Callout tone="good" icon={Sparkles} title={`Gemini found ${rows.length} syllabus ${rows.length === 1 ? "entry" : "entries"}`}>
              {ignored.length > 0 ? (
                <>Skipped {ignored.length} line{ignored.length === 1 ? "" : "s"} that aren't syllabus. <button className="font-medium text-accent-text hover:underline" onClick={() => setShowIgnored((v) => !v)}>{showIgnored ? "Hide" : "Show"}</button>
                  {showIgnored && <ul className="mt-1.5 space-y-0.5 text-xs text-fg-3">{ignored.map((l, i) => <li key={i} className="line-through decoration-fg-3/50">{l}</li>)}</ul>}
                </>
              ) : "Nothing needed skipping."} AI can make mistakes — check subjects and names below.
            </Callout>
          ) : (
            <Callout tone="warn" title="Extracted with built-in rules">
              {method?.note ?? "Rules can't always tell syllabus from notice text or which subject a chapter belongs to. Check every row."}
            </Callout>
          )}
          {info && onExamInfo && (
            <label className="flex items-start gap-2.5 rounded-lg border border-border px-3 py-2.5 text-sm">
              <input type="checkbox" className="mt-0.5 size-4 accent-[var(--accent)]" checked={applyInfo} onChange={(e) => setApplyInfo(e.target.checked)} />
              <span><span className="font-medium">Also use the exam details found in the document</span><br /><span className="text-fg-2">{infoLine}</span></span>
            </label>
          )}
          {existingCount > 0 && (
            <label className="flex items-start gap-2.5 rounded-lg border border-border px-3 py-2.5 text-sm">
              <input type="checkbox" className="mt-0.5 size-4 accent-[var(--accent)]" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
              <span><span className="font-medium">Replace the {existingCount} topics already in the syllabus</span><br />
                <span className="text-fg-2">{replace ? "Your plan will contain only these imported topics." : "The imported topics will be added alongside the existing ones."}</span></span>
            </label>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-fg-3">
            <span>Harder topics get more study time and are scheduled earlier.</span>
            <span className="inline-flex items-center gap-2">Set all to
              <DifficultyPicker size="xs" label="Set difficulty for all topics" value={kept.length && kept.every((r) => r.difficulty === kept[0].difficulty) ? kept[0].difficulty : ("" as Difficulty)}
                onChange={(d) => setRows((rs) => rs.map((x) => (x.keep ? { ...x, difficulty: d } : x)))} />
            </span>
          </div>
          <div className="max-h-[45vh] overflow-auto scroll-thin" tabIndex={0} role="region" aria-label="Extracted topics">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="sticky top-0 z-10 bg-surface text-left text-xs text-fg-3">
                <tr><th className="w-8 py-1.5"><span className="sr-only">Keep</span></th><th className="py-1.5 font-medium">Subject</th><th className="py-1.5 font-medium">Chapter</th><th className="py-1.5 font-medium">Topic</th><th className="py-1.5 font-medium">Difficulty</th></tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.key} className={cn("border-t border-border", !r.keep && "opacity-40")}>
                    <td className="py-1"><input type="checkbox" aria-label="Keep topic" className="size-4 accent-[var(--accent)]" checked={r.keep} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, keep: e.target.checked } : x)))} /></td>
                    {(["subject", "chapter", "topic"] as const).map((f) => (
                      <td key={f} className="py-1 pr-2">
                        <input value={r[f]} aria-label={f} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, [f]: e.target.value } : x)))}
                          className="w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 hover:border-border focus:border-ring focus:bg-surface focus:outline-none" />
                      </td>
                    ))}
                    <td className="py-1"><DifficultyPicker size="xs" label={`Difficulty of ${r.topic}`} value={r.difficulty} onChange={(d) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, difficulty: d } : x)))} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* File drop                                                           */
/* ------------------------------------------------------------------ */

export function FileDrop({ onFiles, busy, label, multiple, accept = ACCEPT, hint, compact }: { onFiles: (files: File[]) => void; busy?: string | null; label: ReactNode; multiple?: boolean; accept?: string; hint?: ReactNode; compact?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); if (!busy) onFiles([...e.dataTransfer.files]); }}
      className={cn("relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed text-center transition", compact ? "px-4 py-5" : "px-6 py-8", over ? "border-accent bg-accent-soft/50" : "border-border-strong bg-surface-2 hover:border-fg-3")}
    >
      {busy ? (
        <>
          <LoaderCircle className="size-6 animate-spin text-accent-text" aria-hidden />
          <p className="mt-2 text-sm text-fg-2" aria-live="polite">{busy}</p>
        </>
      ) : (
        <>
          {compact ? <FileUp className="size-5 text-fg-3" aria-hidden /> : <Upload className="size-6 text-fg-3" aria-hidden />}
          <p className="mt-2 text-sm font-medium text-fg">{label}</p>
          <p className="mt-0.5 text-xs text-fg-3">{hint ?? "PDF, PNG/JPG or .txt · up to 25 MB · processed on this device"}</p>
          <Button size="sm" className="mt-3" onClick={() => ref.current?.click()}>Choose file{multiple ? "s" : ""}</Button>
        </>
      )}
      <input ref={ref} type="file" className="sr-only" accept={accept} multiple={multiple} tabIndex={-1} aria-hidden
        onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ""; if (f.length) onFiles(f); }} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Marking scheme editor                                               */
/* ------------------------------------------------------------------ */

function NumberField({ label, value, onChange, prefix, min, step = 0.25, id }: { label: string; value: number; onChange: (v: number) => void; prefix?: string; min?: number; step?: number; id: string }) {
  const [raw, setRaw] = useState(String(value));
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setRaw(String(value));
  }
  const invalid = raw.trim() === "" || !Number.isFinite(Number(raw)) || (min !== undefined && Number(raw) < min);
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[11.5px] font-medium text-fg-3">{label}</label>
      <div className="relative">
        {prefix && <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-fg-3">{prefix}</span>}
        <input id={id} type="number" inputMode="decimal" step={step} min={min} value={raw} aria-invalid={invalid}
          onChange={(e) => { setRaw(e.target.value); const n = Number(e.target.value); if (e.target.value.trim() !== "" && Number.isFinite(n) && (min === undefined || n >= min)) onChange(n); }}
          className={cn("field tabular", prefix && "pl-6")} />
      </div>
    </div>
  );
}

export function RuleEditor({ rule, onChange, idPrefix, allowPartial = true }: { rule: MarkingRule; onChange: (r: MarkingRule) => void; idPrefix: string; allowPartial?: boolean }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <NumberField id={`${idPrefix}-c`} label="Correct" prefix="+" value={rule.correct} min={0} onChange={(v) => onChange({ ...rule, correct: v })} />
        <NumberField id={`${idPrefix}-w`} label="Wrong (penalty)" prefix="−" value={rule.wrong} min={0} onChange={(v) => onChange({ ...rule, wrong: v })} />
        <NumberField id={`${idPrefix}-u`} label="Unattempted" value={rule.unattempted} onChange={(v) => onChange({ ...rule, unattempted: v })} />
      </div>
      {allowPartial && (
        <div className="rounded-lg border border-border px-3 py-2.5">
          <Switch checked={!!rule.partial?.enabled} onChange={(v) => onChange({ ...rule, partial: { enabled: v, perCorrectOption: rule.partial?.perCorrectOption ?? 1 } })}
            label="Partial credit (multiple-correct)" description="Award marks per correct option when no wrong option is chosen." />
          {rule.partial?.enabled && (
            <div className="mt-2 w-40">
              <NumberField id={`${idPrefix}-p`} label="Per correct option" prefix="+" value={rule.partial.perCorrectOption} min={0} onChange={(v) => onChange({ ...rule, partial: { enabled: true, perCorrectOption: v } })} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function MarkingSchemeEditor({ sections, onChange, subjects, questionCounts }: { sections: ExamSection[]; onChange: (s: ExamSection[]) => void; subjects: string[]; questionCounts?: Record<string, number> }) {
  const update = (id: string, patch: Partial<ExamSection>) => onChange(sections.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const applyAll = (rule: MarkingRule) => onChange(sections.map((s) => ({ ...s, rule: { ...rule } })));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-fg-3">Apply a preset to all sections:</span>
        {MARKING_PRESETS.slice(0, 5).map((p) => (
          <button key={p.id} onClick={() => applyAll(p.rule)} title={p.description} className="h-8 rounded-full border border-border bg-surface px-3 text-xs font-medium text-fg-2 hover:border-accent hover:text-fg">{p.name}</button>
        ))}
      </div>
      {sections.map((s, i) => (
        <div key={s.id} className="rounded-xl border border-border bg-surface p-4">
          <div className="mb-3 flex flex-wrap items-end gap-2">
            <Field label="Section name" htmlFor={`sec-${s.id}`} className="min-w-40 flex-1">
              <Input id={`sec-${s.id}`} value={s.name} onChange={(e) => update(s.id, { name: e.target.value })} />
            </Field>
            <Field label="Subject" htmlFor={`sub-${s.id}`} className="w-44">
              <Select id={`sub-${s.id}`} value={s.subject ?? ""} onChange={(e) => update(s.id, { subject: e.target.value || undefined })}>
                <option value="">Mixed</option>
                {subjects.map((x) => <option key={x} value={x}>{x}</option>)}
              </Select>
            </Field>
            <Select aria-label="Preset" className="w-44" value="" onChange={(e) => { const p = MARKING_PRESETS.find((x) => x.id === e.target.value); if (p) update(s.id, { rule: { ...p.rule } }); }}>
              <option value="" disabled>Preset…</option>
              {MARKING_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
            {sections.length > 1 && (
              <Button size="md" variant="ghost" icon={X} aria-label={`Remove ${s.name}`} onClick={() => onChange(sections.filter((x) => x.id !== s.id).map((x, j) => ({ ...x, ordering: j })))} />
            )}
          </div>
          <RuleEditor rule={s.rule} onChange={(rule) => update(s.id, { rule })} idPrefix={`r-${s.id}`} />
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-fg-3">
            <Badge tone="neutral">{describeRule(s.rule)}</Badge>
            {questionCounts?.[s.id] !== undefined && <span>{questionCounts[s.id]} questions · max {questionCounts[s.id] * s.rule.correct} marks</span>}
            <label className="ml-auto flex items-center gap-2">
              Optional section: count first
              <input type="number" min={0} className="field h-7 w-16 py-0 text-xs" aria-label="Maximum attempts counted" value={s.maxAttemptsCounted ?? ""} placeholder="all"
                onChange={(e) => update(s.id, { maxAttemptsCounted: e.target.value ? Math.max(0, Number(e.target.value)) || undefined : undefined })} />
              attempts
            </label>
          </div>
          {i === 0 && sections.length === 1 && <p className="mt-2 text-xs text-fg-3">Add sections when parts of the paper use different rules (e.g. a numerical section with no negative marking).</p>}
        </div>
      ))}
      <Button size="sm" icon={Plus} onClick={() => onChange([...sections, { id: uid("sec"), name: `Section ${sections.length + 1}`, ordering: sections.length, rule: { ...(sections[sections.length - 1]?.rule ?? { correct: 4, wrong: 1, unattempted: 0 }) } }])}>
        Add section
      </Button>
    </div>
  );
}
