"use client";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { LoadingPage } from "@/components/shell";
import { useAnalysis } from "@/lib/hooks";

/** Resume an analysis at the furthest step reached. */
export default function AnalysisIndex() {
  const { analysisId } = useParams<{ analysisId: string }>();
  const a = useAnalysis(analysisId);
  const router = useRouter();
  useEffect(() => {
    if (a) router.replace(`/analyzer/${a.id}/${a.finalizedAt && a.stage === "results" ? "results" : a.stage}`);
  }, [a, router]);
  return <LoadingPage />;
}
