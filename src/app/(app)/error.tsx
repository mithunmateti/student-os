"use client";
import Link from "next/link";
import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui";

export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("Student OS screen error:", error.message);
  }, [error]);
  return (
    <div className="card mx-auto mt-10 max-w-lg p-8 text-center" role="alert">
      <TriangleAlert className="mx-auto size-6 text-warn" aria-hidden />
      <h1 className="mt-3 text-lg font-semibold">This screen hit a problem</h1>
      <p className="mt-1 text-sm text-fg-3">Your data is safe — it's saved in this browser and wasn't changed. Try again, or go back to the dashboard.</p>
      <div className="mt-5 flex justify-center gap-2">
        <Button variant="primary" onClick={retry}>Try again</Button>
        <Link href="/dashboard"><Button>Dashboard</Button></Link>
      </div>
    </div>
  );
}
