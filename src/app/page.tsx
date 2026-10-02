"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, CalendarDays, Lock, Repeat, ScanSearch } from "lucide-react";
import { Button, Dialog, Field, Input } from "@/components/ui";
import { useHydrated } from "@/lib/hooks";
import { useStore } from "@/store/store";
import { getSearchParams } from "@/lib/url";

export default function Landing() {
  const router = useRouter();
  const hydrated = useHydrated();
  const onboarded = useStore((s) => s.settings.onboarded);
  const hasData = useStore((s) => s.exams.length > 0);
  const loadDemo = useStore((s) => s.loadDemo);
  const startFresh = useStore((s) => s.startFresh);
  const [reset, setReset] = useState(false);
  const [freshOpen, setFreshOpen] = useState(false);
  const [confirmDemo, setConfirmDemo] = useState(false);
  const [studentName, setStudentName] = useState("");

  useEffect(() => {
    setReset(getSearchParams().get("reset") === "1");
  }, []);

  const returning = hydrated && onboarded && !reset;

  const demo = () => {
    loadDemo();
    router.push("/dashboard");
  };
  const fresh = () => {
    startFresh(studentName || "Student");
    router.push("/exams/new?first=1");
  };

  // Already set up when the page opened? Go straight into the app. Decided once, so that
  // finishing setup here (which also sets "onboarded") can still go to the next step.
  const [redirecting, setRedirecting] = useState<boolean | null>(null);
  useEffect(() => {
    if (!hydrated || redirecting !== null) return;
    const r = returning;
    setRedirecting(r);
    if (r) router.replace("/dashboard");
  }, [hydrated, returning, redirecting, router]);

  if (!hydrated || redirecting !== false) {
    return <div className="grid min-h-dvh place-items-center" aria-busy="true"><AppIcon /></div>;
  }

  return (
    <div className="min-h-dvh">
      <main className="mx-auto flex min-h-dvh max-w-[430px] flex-col px-4 pt-[calc(env(safe-area-inset-top)+48px)] pb-[calc(env(safe-area-inset-bottom)+24px)]">
        <div className="flex flex-col items-center text-center">
          <AppIcon />
          <h1 className="mt-5 text-[38px] leading-[44px] font-black tracking-[-0.4px]">Exam Pilot</h1>
          <p className="mt-2 max-w-[300px] text-[17px] text-fg-3">Plan your study, analyze every test, and fix the mistakes that cost you marks.</p>
        </div>

        <ul className="mt-9 overflow-hidden rounded-[22px] bg-surface" aria-label="What Exam Pilot does">
          {[
            { icon: CalendarDays, title: "A plan for every day", sub: "Built from your syllabus and exam date" },
            { icon: ScanSearch, title: "Analyze every test", sub: "See exactly where each mark went" },
            { icon: Repeat, title: "Fix every mistake", sub: "Retries until you've mastered them" },
          ].map((f, i) => (
            <li key={f.title}>
              {i > 0 && <div className="ml-[64px] h-px bg-border" aria-hidden />}
              <div className="flex min-h-[68px] items-center gap-3.5 px-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-[13px] bg-accent-soft text-accent"><f.icon className="size-5" aria-hidden /></span>
                <span><span className="block text-[17px] font-bold">{f.title}</span><span className="block text-sm text-fg-3">{f.sub}</span></span>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-auto space-y-2.5 pt-10">
          <button disabled={!hydrated} onClick={() => setFreshOpen(true)}
            className="flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-accent text-[17px] font-bold text-white transition active:scale-[0.98] disabled:opacity-40">
            Start with my own exam <ArrowRight className="size-5" aria-hidden />
          </button>
          <button disabled={!hydrated} onClick={() => (hasData ? setConfirmDemo(true) : demo())}
            className="flex h-[52px] w-full items-center justify-center rounded-2xl bg-surface text-[17px] font-bold text-accent-text transition active:scale-[0.98] disabled:opacity-40">
            Try it with sample data
          </button>
          <p className="flex items-center justify-center gap-1.5 pt-1 text-[13px] text-fg-3"><Lock className="size-3.5" aria-hidden />Everything stays on this device</p>
        </div>
      </main>

      <Dialog open={freshOpen} onClose={() => setFreshOpen(false)} title="What should we call you?" description="Next you'll add the exam you're preparing for."
        footer={<><Button variant="ghost" onClick={() => setFreshOpen(false)}>Cancel</Button><Button variant="primary" onClick={fresh} iconRight={ArrowRight}>Continue</Button></>}>
        <form onSubmit={(e) => { e.preventDefault(); fresh(); }}>
          <Field label="Your name" htmlFor="name" hint={hasData ? "Your current data in this browser will be replaced. Export a backup from Settings first if you need it." : "Optional. Used to greet you on the Today screen."}>
            <Input id="name" autoFocus value={studentName} onChange={(e) => setStudentName(e.target.value)} placeholder="Your name" maxLength={40} />
          </Field>
        </form>
      </Dialog>
      <Dialog open={confirmDemo} onClose={() => setConfirmDemo(false)} title="Replace your data with sample data?" size="sm"
        footer={<><Button variant="ghost" onClick={() => setConfirmDemo(false)}>Cancel</Button><Button variant="danger" onClick={demo}>Load sample data</Button></>}>
        <p className="text-sm text-fg-2">This browser already has exam data. Loading the sample data replaces it. Export a backup from Settings first if you want to keep it.</p>
      </Dialog>
    </div>
  );
}

function AppIcon() {
  return (
    <svg viewBox="0 0 32 32" className="size-[88px] drop-shadow-[0_8px_20px_rgb(10_102_224/0.3)]" aria-hidden>
      <rect width="32" height="32" rx="9" fill="var(--accent)" />
      <path d="M9 21.5 16 8l7 13.5-7-3.2z" fill="#fff" />
      <circle cx="16" cy="24.5" r="1.6" fill="#fff" opacity=".7" />
    </svg>
  );
}
