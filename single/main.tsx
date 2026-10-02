/**
 * Standalone entry: the same screens as the Next.js app, routed by URL hash,
 * bundled into one self-contained index.html.
 */
import { Component, StrictMode, type ComponentType, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "./app.css";
import { AppShell } from "@/components/shell";
import { AnalyzerShell } from "@/components/analyzer-shell";
import { Toaster } from "@/components/ui";
import Landing from "@/app/page";
import NotFoundPage from "@/app/not-found";
import AppError from "@/app/(app)/error";
import Dashboard from "@/app/(app)/dashboard/page";
import Todo from "@/app/(app)/todo/page";
import CalendarPage from "@/app/(app)/calendar/page";
import Exams from "@/app/(app)/exams/page";
import NewExam from "@/app/(app)/exams/new/page";
import ExamHub from "@/app/(app)/exam/[id]/page";
import PilotIndex from "@/app/(app)/pilot/page";
import Pilot from "@/app/(app)/pilot/[examId]/page";
import AnalyzerIndex from "@/app/(app)/analyzer/page";
import NewAnalysis from "@/app/(app)/analyzer/new/page";
import AnalysisIndex from "@/app/(app)/analyzer/[analysisId]/page";
import Review from "@/app/(app)/analyzer/[analysisId]/review/page";
import Marking from "@/app/(app)/analyzer/[analysisId]/marking/page";
import Answers from "@/app/(app)/analyzer/[analysisId]/answers/page";
import Results from "@/app/(app)/analyzer/[analysisId]/results/page";
import Errors from "@/app/(app)/analyzer/[analysisId]/errors/page";
import Report from "@/app/(app)/analyzer/[analysisId]/report/page";
import QuestionBank from "@/app/(app)/question-bank/page";
import Notebook from "@/app/(app)/notebook/page";
import Analytics from "@/app/(app)/analytics/page";
import Settings from "@/app/(app)/settings/page";
import { compile, match, ParamsContext, useLocation } from "./router";

type Layout = "none" | "app" | "analyzer";
const ROUTES: { def: ReturnType<typeof compile>; page: ComponentType; layout: Layout; title: string }[] = [
  ["/", Landing, "none", "Exam Pilot"],
  ["/dashboard", Dashboard, "app", "Dashboard"],
  ["/todo", Todo, "app", "To-do"],
  ["/calendar", CalendarPage, "app", "Calendar"],
  ["/exams", Exams, "app", "My Exams"],
  ["/exams/new", NewExam, "app", "Create exam"],
  ["/exam/:id", ExamHub, "app", "Exam"],
  ["/pilot", PilotIndex, "app", "Exam Pilot"],
  ["/pilot/:examId", Pilot, "app", "Exam Pilot"],
  ["/analyzer", AnalyzerIndex, "app", "Exam Analyzer"],
  ["/analyzer/new", NewAnalysis, "app", "Analyze an exam"],
  ["/analyzer/:analysisId", AnalysisIndex, "analyzer", "Analysis"],
  ["/analyzer/:analysisId/review", Review, "analyzer", "Review import"],
  ["/analyzer/:analysisId/marking", Marking, "analyzer", "Marking scheme"],
  ["/analyzer/:analysisId/answers", Answers, "analyzer", "Your answers"],
  ["/analyzer/:analysisId/results", Results, "analyzer", "Results"],
  ["/analyzer/:analysisId/errors", Errors, "analyzer", "Diagnose errors"],
  ["/analyzer/:analysisId/report", Report, "analyzer", "Report"],
  ["/question-bank", QuestionBank, "app", "Question Bank"],
  ["/notebook", Notebook, "app", "Error Notebook"],
  ["/analytics", Analytics, "app", "Analytics"],
  ["/settings", Settings, "app", "Settings"],
].map(([pattern, page, layout, title]) => ({ def: compile(pattern as string), page: page as ComponentType, layout: layout as Layout, title: title as string }));

class Boundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }
  render() {
    return this.state.error ? <AppError error={this.state.error} retry={() => this.setState({ error: null })} /> : this.props.children;
  }
}

function App() {
  const { path } = useLocation();
  let found: { route: (typeof ROUTES)[number]; params: Record<string, string> } | null = null;
  for (const route of ROUTES) {
    const params = match(route.def, path);
    if (params) {
      found = { route, params };
      break;
    }
  }
  if (!found) return <NotFoundPage />;
  const { route, params } = found;
  document.title = route.title === "Exam Pilot" ? "Exam Pilot" : `${route.title} · Exam Pilot`;
  const Page = route.page;
  const page = <Boundary resetKey={path}><Page key={path} /></Boundary>;
  return (
    <ParamsContext.Provider value={params}>
      {route.layout === "none" ? page : (
        <AppShell>{route.layout === "analyzer" ? <AnalyzerShell>{page}</AnalyzerShell> : page}</AppShell>
      )}
    </ParamsContext.Provider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <Toaster />
  </StrictMode>,
);
