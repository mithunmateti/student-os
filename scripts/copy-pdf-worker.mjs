// Copies the pdf.js worker (legacy build, for older Safari) into /public so the browser can load
// it without bundler tricks, with the same small fallback the app applies (src/lib/polyfills.ts).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs");
const polyfill = readFileSync(join(root, "src/lib/polyfills.ts"), "utf8").match(/PDF_POLYFILLS = `([\s\S]*?)`;/)[1].replace(/\\n/g, "\n");
const dest = join(root, "public/pdf.worker.min.mjs");
if (existsSync(src)) {
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, polyfill + readFileSync(src, "utf8"));
  console.log("pdf.js worker copied to public/");
} else {
  console.warn("pdf.js worker not found; PDF import will fall back to manual entry.");
}
