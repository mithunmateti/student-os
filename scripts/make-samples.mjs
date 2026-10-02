// Renders the bundled sample paper + key as real PDFs (with a text layer) in public/samples/.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const src = readFileSync(new URL("../src/domain/demo/sample-paper.ts", import.meta.url), "utf8");
const grab = (name) => src.split(`export const ${name} = \``)[1].split("`;")[0];

async function render(text, file, title) {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([595, 842]);
  let y = 800;
  const wrap = (line, size, f) => {
    const words = line.split(" ");
    const out = [];
    let cur = "";
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (f.widthOfTextAtSize(next, size) > 500) { out.push(cur); cur = w; } else cur = next;
    }
    out.push(cur);
    return out;
  };
  for (const raw of text.split("\n")) {
    const heading = /^[A-Z][A-Z0-9 \-]+$/.test(raw.trim()) && raw.trim().length > 3;
    const f = heading ? bold : font;
    const size = heading ? 12 : 10.5;
    for (const line of raw.trim() ? wrap(raw, size, f) : [""]) {
      if (y < 60) { page = doc.addPage([595, 842]); y = 800; }
      page.drawText(line, { x: 48, y, size, font: f, color: rgb(0.1, 0.1, 0.1) });
      y -= size + 6;
    }
  }
  mkdirSync(new URL("../public/samples/", import.meta.url), { recursive: true });
  writeFileSync(new URL(`../public/samples/${file}`, import.meta.url), await doc.save());
  console.log("wrote", file);
}

await render(grab("SAMPLE_PAPER"), "sample-question-paper.pdf", "Practice Test 07 - Question Paper");
await render(grab("SAMPLE_KEY"), "sample-answer-key.pdf", "Practice Test 07 - Answer Key");
