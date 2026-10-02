/**
 * Adds a strict Content Security Policy to the single-file build (standalone/index.html).
 *
 * Only the app's own inline scripts may run (pinned by SHA-256 hash), so injected
 * <script> tags or event-handler attributes are refused by the browser. The page may
 * only talk to: Google Gemini (AI, when the student adds a key), the version-pinned
 * Tesseract OCR files on jsDelivr (photo import), and Google Fonts. No eval, no plugins,
 * no forms posting elsewhere, no <base> tricks.
 *
 * Usage: node scripts/add-csp.mjs [file]   (default: standalone/index.html)
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const file = process.argv[2] ?? "standalone/index.html";
const tess = JSON.parse(readFileSync(new URL("../node_modules/tesseract.js/package.json", import.meta.url), "utf8")).version;
const core = JSON.parse(readFileSync(new URL("../node_modules/tesseract.js-core/package.json", import.meta.url), "utf8")).version;

let html = readFileSync(file, "utf8").replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\s*/g, "");
const hashes = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .filter((m) => !/\bsrc=/.test(m[0].slice(0, m[0].indexOf(">"))))
  .map((m) => `'sha256-${createHash("sha256").update(m[1], "utf8").digest("base64")}'`);
if (!hashes.length) throw new Error(`No inline scripts found in ${file}`);

export const policy = [
  "default-src 'none'",
  // The app itself (by hash), WebAssembly for OCR, and the pinned OCR worker/engine scripts.
  `script-src ${[...new Set(hashes)].join(" ")} 'wasm-unsafe-eval' https://cdn.jsdelivr.net/npm/tesseract.js@v${tess}/ https://cdn.jsdelivr.net/npm/tesseract.js-core@v${core}/`,
  // The OCR engine runs in a worker created from an in-page blob (pdf.js runs on the page).
  "worker-src blob:",
  "style-src 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src data: blob:",
  "connect-src https://generativelanguage.googleapis.com https://cdn.jsdelivr.net/npm/@tesseract.js-data/ data: blob:",
  "media-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

const meta = `<meta http-equiv="Content-Security-Policy" content="${policy}" />\n    <meta name="referrer" content="no-referrer" />`;
// Must come before any script, so it sits right after <meta charset>.
if (!/<meta charset="UTF-8" \/>/i.test(html)) throw new Error("No <meta charset> to anchor the policy");
html = html.replace(/<meta name="referrer"[^>]*>\s*/g, "").replace(/(<meta charset="UTF-8" \/>)/i, `$1\n    ${meta}`);
writeFileSync(file, html);
console.log(`CSP added to ${file} (${hashes.length} inline script hash${hashes.length === 1 ? "" : "es"})`);
