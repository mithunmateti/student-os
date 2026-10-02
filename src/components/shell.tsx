"use client";
/** App shell: sidebar navigation, mobile header, hydration gate and daily plan refresh. */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  BookOpen, CalendarDays, ChartColumn, ChevronRight, CircleCheckBig, Compass, Ellipsis, Library, ListChecks, Monitor, Moon, NotebookPen, ScanSearch, Settings, Sun, X,
} from "lucide-react";
import { today } from "@/domain/util";
import { useHydrated } from "@/lib/hooks";
import { useStore } from "@/store/store";
import { requestPersistentStorage } from "@/store/storage";
import { SaveIndicator } from "./domain";
import { Button, cn, Skeleton } from "./ui";

const NAV = [
  { href: "/dashboard", label: "Today", icon: CircleCheckBig },
  { href: "/todo", label: "To-do", icon: ListChecks },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/exams", label: "My Exams", icon: BookOpen, match: ["/exams", "/exam/"] },
  { href: "/pilot", label: "Study plan", icon: Compass },
  { href: "/analyzer", label: "Exam Analyzer", icon: ScanSearch },
  { href: "/question-bank", label: "Question Bank", icon: Library },
  { href: "/notebook", label: "Error Notebook", icon: NotebookPen },
  { href: "/analytics", label: "Analytics", icon: ChartColumn },
  { href: "/settings", label: "Settings", icon: Settings },
];

/** The phone tab bar: the four things students do most, plus More. */
const TABS = [
  { href: "/dashboard", label: "Today", icon: CircleCheckBig },
  { href: "/todo", label: "To-do", icon: ListChecks },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/analyzer", label: "Analyze", icon: ScanSearch },
];
const MORE = ["/pilot", "/notebook", "/exams", "/exam/", "/question-bank", "/analytics", "/settings"];

const isActive = (path: string, href: string, match?: string[]) =>
  (match ?? [href]).some((m) => path === m || path.startsWith(m.endsWith("/") ? m : m + "/")) || path === href;

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/dashboard" className={cn("flex items-center gap-2.5", className)} aria-label="Student OS home">
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="10" fill="var(--accent)" />
        <path d="M9 21.5 16 8l7 13.5-7-3.2z" fill="#fff" />
        <circle cx="16" cy="24.5" r="1.6" fill="#fff" opacity=".7" />
      </svg>
      <span className="text-[17px] font-bold tracking-tight">Student OS</span>
    </Link>
  );
}

function useNotebookDue() {
  return useStore((s) => s.notebook.filter((n) => n.mastery !== "mastered" && n.nextRetryAt && n.nextRetryAt <= today()).length);
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  const notebookDue = useNotebookDue();
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {NAV.map((item) => {
        const active = isActive(path, item.href, item.match);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-[14px] px-3 text-[15px] font-semibold transition",
              active ? "bg-surface text-accent-text" : "text-fg-2 hover:bg-surface/60 hover:text-fg",
            )}
          >
            <item.icon className={cn("size-5", active ? "text-accent" : "text-fg-3")} aria-hidden />
            <span className="flex-1">{item.label}</span>
            {item.href === "/notebook" && notebookDue > 0 && (
              <span className="rounded-full bg-[var(--badge)] px-1.5 text-[11px] font-bold text-white tabular" title={`${notebookDue} mistakes due for retry`}><span aria-hidden>{notebookDue}</span><span className="sr-only">, {notebookDue} due</span></span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export function ThemeToggle() {
  const theme = useStore((s) => s.settings.theme);
  const update = useStore((s) => s.updateSettings);
  const opts = [
    { v: "light" as const, icon: Sun, label: "Light" },
    { v: "system" as const, icon: Monitor, label: "System" },
    { v: "dark" as const, icon: Moon, label: "Dark" },
  ];
  return (
    <div role="radiogroup" aria-label="Theme" className="inline-flex gap-0.5 rounded-full bg-surface p-[3px]">
      {opts.map((o) => (
        <button key={o.v} role="radio" aria-checked={theme === o.v} aria-label={`${o.label} theme`} title={`${o.label} theme`}
          onClick={() => update({ theme: o.v })}
          className={cn("grid size-8 place-items-center rounded-full transition", theme === o.v ? "bg-accent text-white" : "text-fg-3 hover:text-fg")}>
          <o.icon className="size-4" aria-hidden />
        </button>
      ))}
    </div>
  );
}

/** Round moon/sun button for page headers (flips between light and dark). */
export function ThemeButton() {
  const theme = useStore((s) => s.settings.theme);
  const update = useStore((s) => s.updateSettings);
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.dataset.theme === "dark"), [theme]);
  const I = dark ? Sun : Moon;
  return (
    <button onClick={() => update({ theme: dark ? "light" : "dark" })} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="grid size-10 shrink-0 place-items-center rounded-full bg-surface text-fg transition hover:text-accent-text">
      <I className="size-[18px]" aria-hidden />
    </button>
  );
}

function SidebarFooter() {
  const isDemo = useStore((s) => s.isDemo);
  const router = useRouter();
  return (
    <div className="mt-auto space-y-3 pt-4">
      {isDemo && (
        <div className="rounded-[18px] bg-surface px-3.5 py-3 text-[13px] text-fg-3">
          <p className="font-semibold text-fg">You&apos;re exploring demo data.</p>
          <button onClick={() => router.push("/?reset=1")} className="mt-1 font-semibold text-accent-text hover:underline">Start with my own exams →</button>
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <ThemeToggle />
        <SaveIndicator />
      </div>
      <p className="px-1 text-[11.5px] leading-snug text-fg-3">Your data stays in this browser. Export backups from Settings.</p>
    </div>
  );
}

function TabBar({ onMore, moreOpen }: { onMore: () => void; moreOpen: boolean }) {
  const path = usePathname();
  const due = useNotebookDue();
  const moreActive = moreOpen || MORE.some((m) => path === m || path.startsWith(m.endsWith("/") ? m : m + "/"));
  const tab = "relative flex min-h-11 flex-col items-center justify-start gap-[3px] pt-[7px] text-[11px] font-bold";
  return (
    <nav aria-label="Tabs" className="fixed inset-x-0 bottom-0 z-40 grid h-[var(--tabbar-h)] grid-cols-5 border-t-[0.5px] border-[var(--tab-line)] bg-[var(--tab-bg)] backdrop-blur-xl lg:hidden no-print">
      {TABS.map((t) => {
        const active = !moreOpen && isActive(path, t.href);
        return (
          <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined} className={cn(tab, active ? "text-accent-text" : "text-fg-3")}>
            <t.icon className="size-[25px]" strokeWidth={active ? 2.3 : 1.9} aria-hidden />
            {t.label}
          </Link>
        );
      })}
      <button onClick={onMore} aria-expanded={moreOpen} className={cn(tab, moreActive ? "text-accent-text" : "text-fg-3")}>
        <Ellipsis className="size-[25px]" aria-hidden />
        More
        {due > 0 && <span className="absolute top-1 left-1/2 ml-2 min-w-[18px] rounded-full bg-[var(--badge)] px-1 text-center text-[11px] leading-[18px] text-white tabular"><span aria-hidden>{due}</span><span className="sr-only">, {due} mistakes due</span></span>}
      </button>
    </nav>
  );
}

function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const path = usePathname();
  const due = useNotebookDue();
  const isDemo = useStore((s) => s.isDemo);
  const router = useRouter();
  if (!open) return null;
  const items = [
    { href: "/pilot", label: "Study plan", sub: "Your adaptive daily plan and topic priorities", icon: Compass },
    { href: "/notebook", label: "Mistakes", sub: due ? `${due} due for a retry` : "Your Error Notebook", icon: NotebookPen },
    { href: "/exams", label: "My Exams", sub: "Exams, syllabus and mock tests", icon: BookOpen },
    { href: "/question-bank", label: "Question Bank", sub: "Every question you've analyzed", icon: Library },
    { href: "/analytics", label: "Analytics", sub: "Trends across your tests", icon: ChartColumn },
    { href: "/settings", label: "Settings", sub: "Study time, AI key, backups", icon: Settings },
  ];
  return (
    <div className="fixed inset-0 z-30 flex flex-col justify-end bg-black/35 lg:hidden" role="dialog" aria-modal="true" aria-label="More" onClick={onClose}>
      <div className="rounded-t-[28px] bg-bg px-4 pt-2 pb-[calc(var(--tabbar-h)+16px)] animate-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-[5px] w-10 rounded-full bg-border-strong" aria-hidden />
        <div className="mb-3 flex items-center justify-between px-1">
          <h2 className="text-[22px] font-black">More</h2>
          <button onClick={onClose} className="grid size-9 place-items-center rounded-full bg-surface text-fg-3" aria-label="Close"><X className="size-4" /></button>
        </div>
        <ul className="overflow-hidden rounded-[20px] bg-surface">
          {items.map((it, i) => (
            <li key={it.href}>
              {i > 0 && <div className="ml-[60px] h-px bg-border" />}
              <Link href={it.href} onClick={onClose} aria-current={path.startsWith(it.href) ? "page" : undefined} className="flex min-h-[60px] items-center gap-3 px-4">
                <span className="grid size-9 place-items-center rounded-xl bg-surface-2 text-accent"><it.icon className="size-[18px]" aria-hidden /></span>
                <span className="flex-1"><span className="block text-[16px] font-bold">{it.label}</span><span className="block text-[13px] text-fg-3">{it.sub}</span></span>
                <ChevronRight className="size-4 text-faint" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center justify-between rounded-[20px] bg-surface px-4 py-3">
          <span className="text-[15px] font-bold">Appearance</span>
          <div className="[&>div]:bg-surface-2"><ThemeToggle /></div>
        </div>
        {isDemo && (
          <button onClick={() => { onClose(); router.push("/?reset=1"); }} className="mt-3 flex min-h-12 w-full items-center justify-center rounded-[18px] bg-surface text-[15px] font-bold text-accent-text">
            You&apos;re exploring demo data · Start with my own exams
          </button>
        )}
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const hydrated = useHydrated();
  const ensure = useStore((s) => s.ensureFreshPlans);
  const onboarded = useStore((s) => s.settings.onboarded);
  const [moreOpen, setMoreOpen] = useState(false);
  const router = useRouter();
  const path = usePathname();

  useEffect(() => {
    if (hydrated) ensure();
  }, [hydrated, ensure]);
  // Ask the browser not to clear this app's data on its own (granted silently in most browsers).
  useEffect(() => {
    if (hydrated && onboarded) void requestPersistentStorage();
  }, [hydrated, onboarded]);
  useEffect(() => {
    if (hydrated && !onboarded) router.replace("/");
  }, [hydrated, onboarded, router]);
  useEffect(() => setMoreOpen(false), [path]);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[264px_1fr]">
      <a href="#main" onClick={(e) => { e.preventDefault(); document.getElementById("main")?.focus(); }} className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">Skip to content</a>
      {/* Desktop sidebar */}
      <aside aria-label="Sidebar" className="sticky top-0 hidden h-dvh flex-col px-4 py-5 lg:flex no-print">
        <Logo className="px-2 pb-5" />
        <Link href="/analyzer/new" className="mb-4 flex h-11 items-center justify-center gap-2 rounded-full bg-accent text-[15px] font-bold text-white hover:brightness-110">
          <ScanSearch className="size-[18px]" aria-hidden /> Analyze an exam
        </Link>
        <NavList />
        <SidebarFooter />
      </aside>

      <main id="main" tabIndex={-1} className="min-w-0 px-4 pt-[calc(env(safe-area-inset-top)+20px)] pb-[calc(var(--tabbar-h)+28px)] outline-none sm:px-6 lg:px-10 lg:pt-8 lg:pb-10">
        <div className="mx-auto max-w-[1180px]">{hydrated && onboarded ? children : <LoadingPage />}</div>
      </main>

      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
      <TabBar onMore={() => setMoreOpen((v) => !v)} moreOpen={moreOpen} />
    </div>
  );
}

export function LoadingPage() {
  return (
    <div aria-busy="true" aria-label="Loading your data">
      <Skeleton className="mb-2 h-4 w-32" />
      <Skeleton className="mb-8 h-8 w-72" />
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
      <Skeleton className="mt-4 h-64" />
    </div>
  );
}

export function NotFound({ what, back = "/dashboard" }: { what: string; back?: string }) {
  return (
    <div className="card mx-auto mt-10 max-w-md p-8 text-center">
      <h1 className="text-xl font-bold">{what} not found</h1>
      <p className="mt-1 text-sm text-fg-3">It may have been deleted, or the link is from another device. Your data is stored locally in this browser.</p>
      <Link href={back} className="mt-4 inline-block"><Button variant="primary">Go back</Button></Link>
    </div>
  );
}
