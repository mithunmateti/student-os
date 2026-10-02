/** Points pdf.js at its worker. The standalone build swaps this module for an inlined worker. */
export function configurePdfWorker(pdfjs: { GlobalWorkerOptions: { workerSrc: string } }) {
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
}
