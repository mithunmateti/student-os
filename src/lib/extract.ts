"use client";
/**
 * Import/OCR adapter. Runs entirely in the browser: PDF text layers via pdf.js,
 * images via Tesseract OCR. Files are validated for type and size, never uploaded,
 * never logged, and only their name/size are kept as a source reference.
 */
import type { FileRef } from "@/domain/types";
import { configurePdfWorker } from "./pdf-worker";
import { applyPdfPolyfills } from "./polyfills";

export const MAX_FILE_MB = 25;
/** A question paper is never this long; a bigger file is probably the wrong one (and slow to read). */
const MAX_PDF_PAGES = 300;
const PDF = ["application/pdf"];
const IMAGE = ["image/png", "image/jpeg", "image/webp", "image/bmp", "image/gif"];
const TEXT = ["text/plain", "text/markdown", "text/csv", ""];

export type ExtractMethod = "pdf" | "image" | "text";

export interface ExtractResult {
  text: string;
  pages: number;
  method: ExtractMethod;
  warnings: string[];
  ref: FileRef;
}

export class ExtractError extends Error {}

export function validateFile(file: File): ExtractMethod {
  if (file.size > MAX_FILE_MB * 1024 * 1024) throw new ExtractError(`“${file.name}” is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_FILE_MB} MB.`);
  if (file.size === 0) throw new ExtractError(`“${file.name}” is empty.`);
  const name = file.name.toLowerCase();
  if (PDF.includes(file.type) || name.endsWith(".pdf")) return "pdf";
  if (IMAGE.includes(file.type) || /\.(png|jpe?g|webp|bmp|gif)$/.test(name)) return "image";
  if (TEXT.includes(file.type) && /\.(txt|md|csv)$/.test(name)) return "text";
  throw new ExtractError(`“${file.name}” isn't a supported file. Use a PDF, an image (PNG/JPG/WebP), or a .txt file.`);
}

export const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.bmp,.gif,.txt,.md,application/pdf,image/*,text/plain";

export async function extractText(file: File, kind: FileRef["kind"], onProgress?: (msg: string, pct?: number) => void): Promise<ExtractResult> {
  const method = validateFile(file);
  const ref: FileRef = { name: file.name, size: file.size, type: file.type || "application/octet-stream", kind, addedAt: new Date().toISOString() };
  if (method === "text") {
    const text = await file.text();
    return { text, pages: 1, method, warnings: [], ref };
  }
  if (method === "pdf") return extractPdf(file, ref, onProgress);
  return extractImage(file, ref, onProgress);
}

async function extractPdf(file: File, ref: FileRef, onProgress?: (msg: string, pct?: number) => void): Promise<ExtractResult> {
  onProgress?.("Opening PDF…", 0.05);
  // The legacy build carries fallbacks for features older Safari lacks; see polyfills.ts.
  applyPdfPolyfills();
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  await configurePdfWorker(pdfjs);
  let doc;
  // Only the text is read: no XFA forms, no fonts or WebAssembly decoders to load, nothing fetched.
  // (The page's security policy also stops a PDF from ever evaluating code.)
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), enableXfa: false, disableFontFace: true, useWasm: false, disableAutoFetch: true, isOffscreenCanvasSupported: false });
  try {
    doc = await task.promise;
  } catch (e) {
    const msg = e instanceof Error && /password/i.test(e.message) ? "This PDF is password-protected." : "This PDF couldn't be read — it may be damaged.";
    throw new ExtractError(msg);
  }
  const warnings: string[] = [];
  const pages: string[] = [];
  let emptyPages = 0;
  if (doc.numPages > MAX_PDF_PAGES) {
    await task.destroy();
    throw new ExtractError(`This PDF has ${doc.numPages} pages. The limit is ${MAX_PDF_PAGES}; split it into smaller files.`);
  }
  for (let p = 1; p <= doc.numPages; p++) {
    onProgress?.(`Reading page ${p} of ${doc.numPages}…`, p / doc.numPages);
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    // Rebuild lines from positioned text items.
    const items = content.items
      .map((it) => ("str" in it ? { s: it.str, x: it.transform[4], y: it.transform[5], eol: it.hasEOL } : null))
      .filter((x): x is { s: string; x: number; y: number; eol: boolean } => !!x);
    const lines: { y: number; parts: { x: number; s: string }[] }[] = [];
    for (const it of items) {
      if (!it.s.trim() && !it.eol) continue;
      let line = lines.find((l) => Math.abs(l.y - it.y) < 3);
      if (!line) {
        line = { y: it.y, parts: [] };
        lines.push(line);
      }
      line.parts.push({ x: it.x, s: it.s });
    }
    lines.sort((a, b) => b.y - a.y);
    const text = lines.map((l) => l.parts.sort((a, b) => a.x - b.x).map((p) => p.s).join(" ").replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
    if (text.replace(/\s/g, "").length < 20) emptyPages++;
    pages.push(`[[page ${p}]]\n${text}`);
  }
  ref.pages = doc.numPages;
  if (emptyPages === doc.numPages) {
    throw new ExtractError("This PDF has no text layer (it's probably a scan). Export the pages as images and upload those for OCR, or paste the text.");
  }
  if (emptyPages > 0) warnings.push(`${emptyPages} page${emptyPages === 1 ? "" : "s"} had no readable text (scanned images or figures). Check those questions manually.`);
  return { text: pages.join("\n"), pages: doc.numPages, method: "pdf", warnings, ref };
}

async function extractImage(file: File, ref: FileRef, onProgress?: (msg: string, pct?: number) => void): Promise<ExtractResult> {
  onProgress?.("Loading OCR engine (first time can take ~10s)…", 0.05);
  let Tesseract;
  try {
    Tesseract = await import("tesseract.js");
  } catch {
    throw new ExtractError("The OCR engine couldn't load. Check your connection, or paste the text instead.");
  }
  try {
    const worker = await Tesseract.createWorker("eng", 1, {
      logger: (m: { status: string; progress: number }) => {
        if (m.status === "recognizing text") onProgress?.(`Reading image… ${Math.round(m.progress * 100)}%`, 0.2 + m.progress * 0.8);
      },
    });
    const { data } = await worker.recognize(file);
    await worker.terminate();
    const warnings: string[] = [];
    if (data.confidence < 70) warnings.push(`OCR confidence is ${Math.round(data.confidence)}%. Expect mistakes — review carefully.`);
    ref.pages = 1;
    return { text: `[[page 1]]\n${data.text}`, pages: 1, method: "image", warnings, ref };
  } catch {
    throw new ExtractError("OCR failed on this image. Try a sharper, well-lit photo, or paste the text instead.");
  }
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
