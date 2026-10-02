import Link from "next/link";

export default function NotFoundPage() {
  return (
    <div className="grid min-h-dvh place-items-center px-6">
      <div className="card max-w-md p-8 text-center">
        <p className="eyebrow">404</p>
        <h1 className="mt-2 text-lg font-semibold">This page doesn't exist</h1>
        <p className="mt-1 text-sm text-fg-3">The link may be old, or the item was deleted.</p>
        <Link href="/dashboard" className="mt-5 inline-flex h-9 items-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-fg">Go to dashboard</Link>
      </div>
    </div>
  );
}
