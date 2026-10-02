"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { detectPatterns, scoreAnalysis } from "@/domain/analysis";
import { computeReadiness } from "@/domain/planner";
import { familyAnalyses, targetExams, upcomingExams } from "@/domain/selectors";
import type { Analysis, Exam } from "@/domain/types";
import { today } from "@/domain/util";
import { useStore } from "@/store/store";

export function useHydrated() {
  return useStore((s) => s._hydrated);
}

/** Today's date, refreshed when the tab regains focus after midnight. */
export function useToday() {
  const [d, setD] = useState(today);
  useEffect(() => {
    const f = () => setD(today());
    window.addEventListener("focus", f);
    return () => window.removeEventListener("focus", f);
  }, []);
  return d;
}

export function useAnalysis(id: string | undefined): Analysis | undefined {
  return useStore((s) => s.analyses.find((a) => a.id === id));
}

export function useExam(id: string | undefined): Exam | undefined {
  return useStore((s) => s.exams.find((e) => e.id === id));
}

/** Memoised score summary for an analysis (recomputed only when its data changes). */
export function useScore(a: Analysis | undefined) {
  const sections = a?.sections;
  const questions = a?.questions;
  const responses = a?.responses;
  return useMemo(() => (a ? scoreAnalysis(a) : null), [sections, questions, responses]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function useFamily(targetId: string | undefined) {
  const { exams, analyses } = useStore(useShallow((s) => ({ exams: s.exams, analyses: s.analyses })));
  return useMemo(() => (targetId ? familyAnalyses({ exams, analyses }, targetId) : []), [exams, analyses, targetId]);
}

export function usePrimaryTarget(): Exam | undefined {
  const exams = useStore((s) => s.exams);
  const d = useToday();
  return useMemo(() => {
    const targets = targetExams({ exams });
    const upcoming = upcomingExams({ exams: targets }, d);
    return upcoming[0] ?? targets[0];
  }, [exams, d]);
}

export function useObservations(targetId: string | undefined) {
  const family = useFamily(targetId);
  const cats = useStore((s) => s.settings.errorCategories);
  return useMemo(() => detectPatterns(family, cats), [family, cats]);
}

export function useReadiness(exam: Exam | undefined) {
  const family = useFamily(exam?.id);
  const observations = useObservations(exam?.id);
  const { topics, tasks, revisions, notebook } = useStore(useShallow((s) => ({ topics: s.topics, tasks: s.tasks, revisions: s.revisions, notebook: s.notebook })));
  const d = useToday();
  return useMemo(
    () => (exam ? computeReadiness({ exam, topics, analyses: family, tasks, revisions, notebook, observations, today: d }) : null),
    [exam, topics, family, tasks, revisions, notebook, observations, d],
  );
}

/** Global keyboard shortcuts; ignored while typing in inputs. */
export function useHotkeys(handler: (e: KeyboardEvent) => void, deps: unknown[] = []) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      ref.current(e);
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}
