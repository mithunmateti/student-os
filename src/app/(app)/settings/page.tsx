"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { Database, Download, EyeOff, Eye, Palette, Plus, Repeat, RotateCcw, Scale, Sparkles, Tags, Trash2, Upload, User } from "lucide-react";
import { RuleEditor } from "@/components/editors";
import { Badge, Button, Callout, Card, CardHeader, ConfirmDialog, Field, Input, Segmented, Select, Switch, toast } from "@/components/ui";
import { DEFAULT_ERROR_CATEGORIES, ERROR_GROUP_LABEL } from "@/domain/catalog";
import type { ErrorCategory, ErrorGroup, Settings } from "@/domain/types";
import { daysBetween, today, uid } from "@/domain/util";
import { downloadBackup } from "@/lib/backup";
import { download, notebookCsv, parseBackup } from "@/lib/export";
import { isStoragePersistent, requestPersistentStorage } from "@/store/storage";
import { getUserApiKey, setUserApiKey, testApiKey, serverHasAi } from "@/lib/ai/client";
import { getData, useStore } from "@/store/store";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function SettingsPage() {
  const settings = useStore((s) => s.settings);
  const update = useStore((s) => s.updateSettings);
  const isDemo = useStore((s) => s.isDemo);
  const counts = useStore(useShallow((s) => ({ exams: s.exams.length, analyses: s.analyses.length, notebook: s.notebook.length, tasks: s.tasks.length })));
  const router = useRouter();
  const [name, setName] = useState(settings.studentName);
  const [offsets, setOffsets] = useState(settings.revision.offsets.join(", "));
  const [confirm, setConfirm] = useState<null | "demo" | "reset" | "import">(null);
  const [pending, setPending] = useState<ReturnType<typeof parseBackup> | null>(null);
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);
  const [storage, setStorage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    serverHasAi().then(setAiEnabled);
    navigator.storage?.estimate?.().then((e) => setStorage(e.usage !== undefined ? `${(e.usage / 1024 / 1024).toFixed(1)} MB used` : null)).catch(() => undefined);
  }, []);

  const setCats = (cats: ErrorCategory[]) => update({ errorCategories: cats });
  const saveOffsets = () => {
    const vals = [...new Set(offsets.split(/[,\s]+/).map((x) => Number(x)).filter((n) => Number.isInteger(n) && n >= 0 && n <= 60))].sort((a, b) => a - b);
    if (!vals.length) return toast("Enter at least one day offset, e.g. 0, 1, 4, 7", "bad");
    update({ revision: { ...settings.revision, offsets: vals } });
    setOffsets(vals.join(", "));
    toast("Revision schedule saved — new checkpoints use it");
  };

  return (
    <div className="animate-in mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="px-1 text-[32px] leading-[38px] font-black tracking-[-0.4px] sm:text-[38px] sm:leading-[44px]">Settings</h1>
        <p className="mt-1 text-sm text-fg-3">Everything here is stored in this browser.</p>
      </div>

      <Card>
        <CardHeader icon={User} title="Profile & appearance" />
        <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
          <Field label="Your name" htmlFor="s-name" hint="Used for the dashboard greeting.">
            <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name !== settings.studentName && (update({ studentName: name.trim() }), toast("Name saved"))} maxLength={40} />
          </Field>
          <div>
            <div className="label flex items-center gap-1.5"><Palette className="size-3.5" />Theme</div>
            <Segmented label="Theme" value={settings.theme} onChange={(v) => update({ theme: v })} options={[{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }, { value: "system", label: "System" }]} />
          </div>
        </div>
      </Card>

      <Card id="categories">
        <CardHeader icon={Tags} title="Error categories" subtitle="Used when you diagnose lost marks. Rename them, change the short chip label, regroup, hide, or add your own."
          action={<Button size="sm" icon={RotateCcw} variant="ghost" onClick={() => { setCats([...DEFAULT_ERROR_CATEGORIES.map((c) => ({ ...c })), ...settings.errorCategories.filter((c) => !c.builtIn)]); toast("Built-in categories restored"); }}>Restore defaults</Button>} />
        <div className="overflow-x-auto px-5 pb-5" tabIndex={0} role="region" aria-label="Error categories table">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="text-left text-xs text-fg-3"><th className="pb-2 font-medium">Label</th><th className="pb-2 font-medium">Chip</th><th className="pb-2 font-medium">Group</th><th className="pb-2 font-medium">Visible</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {settings.errorCategories.map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="py-1.5 pr-2"><Input className="h-8 py-1" defaultValue={c.label} aria-label="Category label" onBlur={(e) => e.target.value.trim() && e.target.value !== c.label && setCats(settings.errorCategories.map((x) => (x.id === c.id ? { ...x, label: e.target.value.trim() } : x)))} /></td>
                  <td className="py-1.5 pr-2"><Input className="h-8 w-32 py-1" defaultValue={c.short} maxLength={14} aria-label="Chip label" onBlur={(e) => e.target.value.trim() && e.target.value !== c.short && setCats(settings.errorCategories.map((x) => (x.id === c.id ? { ...x, short: e.target.value.trim() } : x)))} /></td>
                  <td className="py-1.5 pr-2">
                    <Select className="h-8 w-40 py-0" aria-label="Group" value={c.group} onChange={(e) => setCats(settings.errorCategories.map((x) => (x.id === c.id ? { ...x, group: e.target.value as ErrorGroup } : x)))}>
                      {Object.entries(ERROR_GROUP_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </Select>
                  </td>
                  <td className="py-1.5 pr-2">
                    <button className="grid size-9 place-items-center rounded-full text-fg-3 hover:bg-surface-3 hover:text-fg" aria-label={c.hidden ? `Show ${c.label}` : `Hide ${c.label}`} aria-pressed={!c.hidden}
                      onClick={() => setCats(settings.errorCategories.map((x) => (x.id === c.id ? { ...x, hidden: !x.hidden } : x)))}>{c.hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>
                  </td>
                  <td className="py-1.5 text-right">{c.builtIn ? <Badge tone="neutral">Built-in</Badge> : <Button size="xs" variant="ghost" icon={Trash2} aria-label={`Delete ${c.label}`} onClick={() => setCats(settings.errorCategories.filter((x) => x.id !== c.id))} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Button size="sm" icon={Plus} className="mt-3" onClick={() => setCats([...settings.errorCategories, { id: uid("cat"), label: "New category", short: "New", group: "other" }])}>Add category</Button>
          <p className="mt-2 text-xs text-fg-3">Built-in categories can be hidden but not deleted, so past diagnoses always keep their meaning. The group decides which kind of practice the planner recommends.</p>
        </div>
      </Card>

      <Card id="revision">
        <CardHeader icon={Repeat} title="Spaced revision schedule" subtitle="Checkpoints created after you first study a topic." />
        <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
          <Field label="Review after (days)" htmlFor="s-off" hint="0 = same day. Default: 0, 1, 4, 7">
            <div className="flex gap-2"><Input id="s-off" value={offsets} onChange={(e) => setOffsets(e.target.value)} /><Button onClick={saveOffsets}>Save</Button></div>
          </Field>
          <Field label="Final review before the exam (days)" htmlFor="s-pre" hint="0 turns it off.">
            <Input id="s-pre" type="number" min={0} max={7} value={settings.revision.preExamDays} onChange={(e) => update({ revision: { ...settings.revision, preExamDays: Math.max(0, Math.min(7, Number(e.target.value))) } })} />
          </Field>
        </div>
      </Card>

      <PlannerCard settings={settings} update={update} />

      <Card>
        <CardHeader icon={Scale} title="Default marking" subtitle="Used for new exams and manual papers. Every analysis still asks you to confirm." />
        <div className="max-w-md px-5 pb-5"><RuleEditor idPrefix="def" rule={settings.defaultRule} onChange={(r) => update({ defaultRule: r })} /></div>
      </Card>

      <Card>
        <CardHeader icon={Sparkles} title="AI assistance" subtitle="Optional. Everything works without it; AI only drafts things you then review." />
        <div className="space-y-4 px-5 pb-5 text-sm text-fg-2">
          <ApiKeyField serverEnabled={!!aiEnabled} />
          <ul className="space-y-1.5 text-[13px]">
            <li><b className="text-fg">Syllabus import</b> — Gemini (Google&apos;s fast, low-cost Flash-Lite model) picks the syllabus out of notices and detects the exam date. Free on Google&apos;s free tier; well under a cent per document otherwise.</li>
            <li><b className="text-fg">Question-paper structuring</b> — Gemini rebuilds questions, options, sections and key answers from messy PDFs and photos. Long papers are read in parts. Free on the free tier; a few cents for a 90-question paper otherwise.</li>
            <li><b className="text-fg">Topic and error-reason suggestions</b> — always on, run on this device with transparent rules.</li>
          </ul>
        </div>
      </Card>

      <Card>
        <CardHeader icon={Database} title="Your data" subtitle={`${counts.exams} exams · ${counts.analyses} analyses · ${counts.notebook} notebook entries · ${counts.tasks} tasks${storage ? ` · ${storage}` : ""}`} />
        <div className="space-y-4 px-5 pb-5">
          <Callout icon={Database}>Student OS is local-first: nothing leaves this browser unless you export it. Your data is saved on this device as you go and stays there when you close the app or turn the device off. Only clearing this browser&apos;s data (or uninstalling the browser) deletes it, so keep a backup.</Callout>
          <DataSafety lastBackupAt={settings.lastBackupAt} />
          <div className="flex flex-wrap gap-2">
            <Button icon={Download} variant="primary" onClick={() => { downloadBackup(); toast("Backup downloaded. Keep it somewhere safe, like iCloud Drive or Google Drive."); }}>Export full backup</Button>
            <Button icon={Upload} onClick={() => fileRef.current?.click()}>Restore from backup</Button>
            <Button icon={Download} onClick={() => { const d = getData(); download("error-notebook.csv", notebookCsv(d.notebook, d.analyses, d.settings.errorCategories), "text/csv"); }}>Export Error Notebook (CSV)</Button>
            <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" aria-hidden tabIndex={-1} onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              if (f.size > 50 * 1024 * 1024) return toast("That file is too large to be a backup.", "bad");
              try {
                setPending(parseBackup(await f.text()));
                setConfirm("import");
              } catch (err) {
                toast(err instanceof Error ? err.message : "Couldn't read that file", "bad");
              }
            }} />
          </div>
          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            <Button icon={Sparkles} onClick={() => setConfirm("demo")}>{isDemo ? "Reset demo data" : "Load demo data"}</Button>
            <Button icon={Trash2} variant="danger" onClick={() => setConfirm("reset")}>Delete all data</Button>
          </div>
        </div>
      </Card>

      <ConfirmDialog open={confirm === "demo"} onClose={() => setConfirm(null)} danger={!isDemo} confirmLabel="Load demo" title="Replace your data with demo data?"
        description="This replaces everything in this browser with the JEE demo (four analyzed tests and a plan). Export a backup first if you want to keep your data."
        onConfirm={() => { useStore.getState().loadDemo(); toast("Demo data loaded"); router.push("/dashboard"); }} />
      <ConfirmDialog open={confirm === "reset"} onClose={() => setConfirm(null)} danger confirmLabel="Delete everything" title="Delete all Student OS data?"
        description="All exams, analyses, plans and notebook entries in this browser will be permanently deleted, and your saved Gemini API key is removed. This can't be undone."
        onConfirm={() => { useStore.getState().startFresh(settings.studentName); setUserApiKey(null); toast("All data deleted"); router.push("/dashboard"); }} />
      <ConfirmDialog open={confirm === "import"} onClose={() => { setConfirm(null); setPending(null); }} danger confirmLabel="Restore" title="Restore this backup?"
        description={pending ? `It contains ${pending.exams.length} exams and ${pending.analyses.length} analyses, and will replace everything currently in this browser.` : ""}
        onConfirm={() => { if (pending) { useStore.getState().replaceAll({ ...pending, settings: { ...pending.settings, onboarded: true } }); toast("Backup restored"); router.push("/dashboard"); } }} />
    </div>
  );
}

function PlannerCard({ settings, update }: { settings: Settings; update: (p: Partial<Settings>) => void }) {
  const p = settings.planner;
  const set = (patch: Partial<Settings["planner"]>) => update({ planner: { ...p, ...patch } });
  return (
    <Card id="planner">
      <CardHeader title="Study time & planning" subtitle="Changes apply the next time a plan regenerates (daily, after analyses, or when you press Rebuild plan)." />
      <div className="space-y-4 px-5 pb-5">
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
          {WEEKDAYS.map((w, i) => (
            <Field key={w} label={w} htmlFor={`sp-${i}`}>
              <Input id={`sp-${i}`} type="number" min={0} step={15} value={p.minutesByWeekday[i]} onChange={(e) => set({ minutesByWeekday: p.minutesByWeekday.map((m, j) => (j === i ? Math.max(0, Number(e.target.value)) : m)) })} />
            </Field>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Full mock every (days)" htmlFor="sp-mock"><Input id="sp-mock" type="number" min={0} value={p.mockEveryDays} onChange={(e) => set({ mockEveryDays: Math.max(0, Number(e.target.value)) })} /></Field>
          <Field label={`Protected revision share (${Math.round(p.revisionShare * 100)}%)`} htmlFor="sp-rs"><input id="sp-rs" type="range" min={0.1} max={0.6} step={0.05} value={p.revisionShare} onChange={(e) => set({ revisionShare: Number(e.target.value) })} className="w-full accent-[var(--accent)]" /></Field>
          <Field label="Plan ahead (days)" htmlFor="sp-hz"><Input id="sp-hz" type="number" min={3} max={45} value={p.horizonDays} onChange={(e) => set({ horizonDays: Math.min(45, Math.max(3, Number(e.target.value))) })} /></Field>
        </div>
        <Switch checked={p.mockEveryDays > 0} onChange={(v) => set({ mockEveryDays: v ? 7 : 0 })} label="Schedule automatic full mocks" description="Real mock tests you add to My Exams are always scheduled on their dates." />
      </div>
    </Card>
  );
}

function ApiKeyField({ serverEnabled }: { serverEnabled: boolean }) {
  const [saved, setSaved] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<"idle" | "testing" | "ok" | "bad">("idle");
  const [message, setMessage] = useState("");
  useEffect(() => setSaved(getUserApiKey()), []);
  const save = async () => {
    const key = value.trim();
    if (!key) return;
    if (!/^(AIza|AQ\.)/.test(key)) {
      setStatus("bad");
      setMessage("That doesn't look like a Gemini API key (they start with “AIza” or “AQ.”).");
      return;
    }
    setStatus("testing");
    const r = await testApiKey(key);
    if (r.ok) {
      setUserApiKey(key);
      setSaved(key);
      setValue("");
      setStatus("ok");
      setMessage("Key works and is saved in this browser.");
      toast("Gemini API key saved");
    } else {
      setStatus("bad");
      setMessage(r.error);
    }
  };
  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium text-fg">Your Google Gemini API key</div>
        {saved ? <Badge tone="good">Saved · …{saved.slice(-4)}</Badge> : serverEnabled ? <Badge tone="neutral">Using the server&apos;s key</Badge> : <Badge tone="neutral">Not set</Badge>}
      </div>
      <p className="mt-1 text-xs text-fg-3">
        Stored only in this browser (not in backups) and sent only to Google. Anyone with access to this browser profile could read it — use a key with a spending limit.
        Get a free one at aistudio.google.com/apikey. “Delete all data” removes it too.
      </p>
      <form className="mt-3 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <Input type="password" autoComplete="off" spellCheck={false} value={value} onChange={(e) => { setValue(e.target.value); setStatus("idle"); }} placeholder={saved ? "Replace key…" : "AIza… or AQ.…"} className="max-w-sm flex-1" aria-label="Gemini API key" />
        <Button type="submit" variant="primary" loading={status === "testing"} disabled={!value.trim()}>Test & save</Button>
        {saved && <Button variant="ghost" icon={Trash2} onClick={() => { setUserApiKey(null); setSaved(null); setStatus("idle"); toast("API key removed from this browser"); }}>Remove</Button>}
      </form>
      {status !== "idle" && status !== "testing" && <p className={`mt-2 text-xs ${status === "ok" ? "text-good" : "text-bad"}`} role="status">{message}</p>}
    </div>
  );
}

/** Is the data protected from the browser's automatic clean-up, and when was the last backup? */
function DataSafety({ lastBackupAt }: { lastBackupAt?: string }) {
  const [persistent, setPersistent] = useState<boolean | null>(null);
  useEffect(() => { void isStoragePersistent().then(setPersistent); }, []);
  const ask = async () => {
    const ok = await requestPersistentStorage();
    setPersistent(ok);
    toast(ok ? "Done: the browser won't clear Student OS data on its own." : "The browser didn't allow it. Keep regular backups instead.", ok ? "good" : "warn");
  };
  const backupDays = lastBackupAt ? daysBetween(lastBackupAt.slice(0, 10), today()) : null;
  return (
    <ul className="space-y-2 text-sm">
      <li className="flex flex-wrap items-center gap-2">
        {persistent ? <Badge tone="good">Protected</Badge> : <Badge tone="warn">Not protected</Badge>}
        <span className="flex-1 text-fg-2">
          {persistent === null ? "This browser doesn't say whether it may clear saved data on its own."
            : persistent ? "The browser won't clear your data on its own, even when the disk gets full."
            : "The browser may clear saved data on its own if the disk gets very full."}
        </span>
        {!persistent && persistent !== null && <Button size="xs" variant="soft" onClick={ask}>Ask to protect it</Button>}
      </li>
      <li className="flex flex-wrap items-center gap-2">
        {backupDays !== null && backupDays <= 14 ? <Badge tone="good">Backed up</Badge> : <Badge tone="warn">No recent backup</Badge>}
        <span className="flex-1 text-fg-2">{backupDays === null ? "You haven't downloaded a backup yet." : `Last backup ${backupDays === 0 ? "today" : backupDays === 1 ? "yesterday" : `${backupDays} days ago`}.`}</span>
      </li>
    </ul>
  );
}
