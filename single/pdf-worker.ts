/** Standalone build: run the pdf.js worker (legacy build, for older Safari) from an inlined blob. */
import workerCode from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?raw";
import { PDF_POLYFILLS } from "@/lib/polyfills";

let url: string | null = null;
export function configurePdfWorker(pdfjs: { GlobalWorkerOptions: { workerSrc: string } }) {
  url ??= URL.createObjectURL(new Blob([PDF_POLYFILLS, workerCode], { type: "text/javascript" }));
  pdfjs.GlobalWorkerOptions.workerSrc = url;
}
