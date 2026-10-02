/** Points pdf.js at its worker file. The standalone build swaps this module for an in-page setup. */
export async function configurePdfWorker(pdfjs: { GlobalWorkerOptions: { workerSrc: string } }) {
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
}
