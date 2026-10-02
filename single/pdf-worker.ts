/** Standalone build: run the pdf.js worker from an inlined blob instead of a separate file. */
import workerCode from "pdfjs-dist/build/pdf.worker.min.mjs?raw";

let url: string | null = null;
export function configurePdfWorker(pdfjs: { GlobalWorkerOptions: { workerSrc: string } }) {
  url ??= URL.createObjectURL(new Blob([workerCode], { type: "text/javascript" }));
  pdfjs.GlobalWorkerOptions.workerSrc = url;
}
