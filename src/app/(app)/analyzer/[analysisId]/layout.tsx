import { AnalyzerShell } from "@/components/analyzer-shell";

export default function AnalysisLayout({ children }: { children: React.ReactNode }) {
  return <AnalyzerShell>{children}</AnalyzerShell>;
}
