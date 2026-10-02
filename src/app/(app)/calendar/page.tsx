"use client";
import { useEffect, useState } from "react";
import { CalendarDays, Hand } from "lucide-react";
import { DayDetails, MonthCalendar } from "@/components/agenda";
import { PageHeader } from "@/components/ui";
import { monthOf } from "@/domain/agenda";
import { useToday } from "@/lib/hooks";
import { getSearchParams } from "@/lib/url";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export default function CalendarPage() {
  const d = useToday();
  const [selected, setSelected] = useState(d);
  const [month, setMonth] = useState(monthOf(d));

  // Links like /calendar?date=2026-10-24 open that day (also when the link is on this page).
  useEffect(() => {
    const read = () => {
      const date = getSearchParams().get("date");
      if (date && ISO.test(date)) {
        setSelected(date);
        setMonth(monthOf(date));
      }
    };
    read();
    window.addEventListener("hashchange", read);
    window.addEventListener("popstate", read);
    return () => {
      window.removeEventListener("hashchange", read);
      window.removeEventListener("popstate", read);
    };
  }, []);

  return (
    <div className="animate-in">
      <PageHeader eyebrow={<span className="inline-flex items-center gap-1.5"><CalendarDays className="size-4" aria-hidden />Calendar</span>} title="Your month"
        subtitle="Exams, study tasks, mistakes to retry and days off, all in one place. Changes here show up in your to-do list and plan straight away." />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
        <div className="card p-3 sm:p-4">
          <MonthCalendar month={month} onMonth={setMonth} selected={selected} onSelect={(x) => { setSelected(x); if (monthOf(x) !== month) setMonth(monthOf(x)); }} droppable />
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-xs font-semibold text-fg-3">
            <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-[var(--badge)]" aria-hidden />Exam or mock</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-[#2f7bf5]" aria-hidden /><span className="size-2 rounded-full bg-[#f28a1e]" aria-hidden /><span className="size-2 rounded-full bg-[#7b5cf0]" aria-hidden />Subjects still to study</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-[repeating-linear-gradient(135deg,var(--border-strong)_0_2px,transparent_2px_4px)]" aria-hidden />Day off</span>
            <span className="hidden items-center gap-1.5 lg:inline-flex"><Hand className="size-3.5" aria-hidden />Drag a task onto a day to move it</span>
          </div>
        </div>
        <div className="lg:sticky lg:top-6">
          <DayDetails date={selected} />
        </div>
      </div>
    </div>
  );
}
