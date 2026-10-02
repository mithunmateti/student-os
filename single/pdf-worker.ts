/**
 * Standalone build. A page opened from disk (file://) can't start pdf.js's worker from a blob:
 * Safari refuses it outright and Chrome blocks it too. So pdf.js runs on the page itself,
 * handed its worker module up front (its supported "main-thread worker" hook) instead of
 * trying a worker first and failing. This also means no script ever loads from a blob URL,
 * which keeps the page's Content Security Policy tighter.
 */
export async function configurePdfWorker(_pdfjs?: unknown) {
  const g = globalThis as { pdfjsWorker?: unknown };
  g.pdfjsWorker ??= await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
}
