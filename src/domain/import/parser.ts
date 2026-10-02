/**
 * Text → structured paper/key/syllabus parsers.
 *
 * These run on text produced by any extractor (PDF text layer, OCR, pasted text).
 * They never claim certainty: every field gets a confidence and anything odd
 * (skipped numbers, duplicates, restarted numbering, figures) is reported so the
 * student can fix it in the review table. Nothing is silently discarded.
 */
import type { QuestionOption, QuestionType } from "../types";
import { OPTION_KEYS } from "../util";

export interface ParsedSection {
  name: string;
  subject?: string;
  type?: QuestionType;
}

export interface ParsedQuestion {
  /** Printed number. */
  number: number;
  /** Index into sections[]. */
  section: number;
  text: string;
  options: QuestionOption[];
  type: QuestionType;
  hasFigure: boolean;
  confidence: { number: number; text: number; options: number; type: number };
  notes: string[];
  page?: number;
}

export interface ParsedPaper {
  sections: ParsedSection[];
  questions: ParsedQuestion[];
  warnings: string[];
}

const SUBJECT_WORDS: Record<string, string> = {
  physics: "Physics",
  chemistry: "Chemistry",
  mathematics: "Mathematics",
  maths: "Mathematics",
  math: "Mathematics",
  biology: "Biology",
  botany: "Biology",
  zoology: "Biology",
  "mental ability": "Mental Ability",
  reasoning: "Reasoning",
  english: "English",
  "general knowledge": "General Knowledge",
};

export function detectSubject(line: string): string | undefined {
  const l = line.toLowerCase();
  for (const [w, s] of Object.entries(SUBJECT_WORDS)) {
    if (new RegExp(`\\b${w}\\b`).test(l)) return s;
  }
  return undefined;
}

const PAGE_MARKER = /^\s*\[\[page (\d+)\]\]\s*$/i;
const Q_START = /^\s*(?:Q(?:uestion|ue)?\s*\.?\s*(?:no\.?)?\s*)?(\d{1,3})\s*[.):]\s*(\S.*)?$/i;
const Q_START_BARE = /^\s*Q\s*\.?\s*(\d{1,3})\s+(\S.*)$/i;

function isSectionHeading(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 70) return false;
  if (/^(section|part|paper)\s*[-–:]?\s*([A-Z0-9]{1,3}|[IVX]{1,4})\b/i.test(t)) return true;
  const subj = detectSubject(t);
  if (subj && t.split(/\s+/).length <= 6 && !/[?]/.test(t) && !/^\d/.test(t)) return true;
  return false;
}

function headingType(line: string): QuestionType | undefined {
  const l = line.toLowerCase();
  if (/(one or more|multiple correct|more than one)/.test(l)) return "multiple";
  if (/(numerical|integer|numeric value|integer type)/.test(l)) return "numerical";
  if (/(single correct|only one|mcq)/.test(l)) return "single";
  return undefined;
}

/** Split a question block into stem and options. Supports (A) / A. / A) / (a) / (1) markers. */
export function splitOptions(block: string): { stem: string; options: QuestionOption[] } {
  const letter = /(?:^|\s)\(\s*([A-Da-d])\s*\)\s*|(?:^|\s)([A-D])[.)]\s+/g;
  let marks = [...block.matchAll(letter)].map((m) => ({ key: (m[1] || m[2]).toUpperCase(), index: m.index!, len: m[0].length }));
  // Keep a clean A,B,C,D… sequence.
  marks = sequence(marks);
  if (marks.length < 2) {
    const numeric = [...block.matchAll(/(?:^|\s)\(\s*([1-6])\s*\)\s*/g)].map((m) => ({ key: OPTION_KEYS[Number(m[1]) - 1], index: m.index!, len: m[0].length }));
    const seq = sequence(numeric);
    if (seq.length >= 2) marks = seq;
  }
  if (marks.length < 2) return { stem: block.trim(), options: [] };
  const stem = block.slice(0, marks[0].index).trim();
  const options = marks.map((m, i) => ({
    key: m.key,
    text: block.slice(m.index + m.len, i + 1 < marks.length ? marks[i + 1].index : undefined).trim(),
  }));
  return { stem, options };
}

function sequence<T extends { key: string }>(marks: T[]): T[] {
  const out: T[] = [];
  for (const m of marks) {
    const expected = OPTION_KEYS[out.length];
    if (m.key === expected) out.push(m);
    else if (m.key === "A" && out.length > 0 && out.length < 2) {
      out.length = 0;
      out.push(m);
    }
  }
  return out;
}

const FIGURE_RE = /(figure|diagram|shown (below|above|in)|as shown|graph (below|shown)|circuit (below|shown)|\bfig\.)/i;

export function parsePaperText(raw: string): ParsedPaper {
  const lines = raw.replace(/\r/g, "").replace(/ /g, " ").split("\n");
  const sections: ParsedSection[] = [];
  const questions: ParsedQuestion[] = [];
  const warnings: string[] = [];
  let current: { number: number; lines: string[]; section: number; page?: number } | null = null;
  let page: number | undefined;
  let lastNumber = 0;
  let sectionIdx = -1;
  let sectionType: QuestionType | undefined;

  const ensureSection = () => {
    if (sectionIdx < 0) {
      sections.push({ name: "Section 1" });
      sectionIdx = 0;
    }
  };

  const flush = () => {
    if (!current) return;
    const block = current.lines.join(" ").replace(/\s+/g, " ").trim();
    const { stem, options } = splitOptions(block);
    const hasFigure = FIGURE_RE.test(block);
    const notes: string[] = [];
    let type: QuestionType = sectionType ?? (options.length >= 2 ? "single" : "numerical");
    let typeConf = sectionType ? 0.9 : options.length >= 2 ? 0.8 : 0.5;
    if (/(one or more|more than one) (correct|option)/i.test(block)) {
      type = "multiple";
      typeConf = 0.85;
    }
    if (type !== "numerical" && options.length < 2) {
      notes.push("No options detected");
    }
    const garbage = stem.length ? (stem.match(/[^\w\s.,;:()\-+=/*^'"%°?!<>[\]{}√π∫Σθαβγλμ]/g)?.length ?? 0) / stem.length : 1;
    let textConf = stem.length >= 25 ? 0.95 : stem.length >= 10 ? 0.7 : 0.4;
    if (garbage > 0.15) {
      textConf = Math.min(textConf, 0.45);
      notes.push("Text may contain OCR noise");
    }
    if (hasFigure) {
      textConf = Math.min(textConf, 0.7);
      notes.push("References a figure/equation that may not be captured");
    }
    const optConf = type === "numerical" ? (options.length ? 0.6 : 0.9) : options.length === 4 ? 0.95 : options.length >= 2 ? 0.6 : 0.2;
    questions.push({
      number: current.number,
      section: current.section,
      text: stem || block,
      options: type === "numerical" ? [] : options,
      type,
      hasFigure,
      confidence: { number: 1, text: textConf, options: optConf, type: typeConf },
      notes,
      page: current.page,
    });
    current = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const pm = line.match(PAGE_MARKER);
    if (pm) {
      page = Number(pm[1]);
      continue;
    }
    if (!line.trim()) continue;

    if (isSectionHeading(line) && !(current && current.lines.length === 0)) {
      const m = line.match(Q_START);
      if (!m || detectSubject(line)) {
        flush();
        const subj = detectSubject(line);
        const ht = headingType(line);
        // Merge "PHYSICS" + "Section A (single correct)" style headings into one section.
        const prev = sections[sectionIdx];
        const prevEmpty = prev && !questions.some((q) => q.section === sectionIdx);
        if (prev && prevEmpty) {
          prev.name = `${prev.name} — ${line.trim()}`.slice(0, 80);
          prev.subject = prev.subject ?? subj;
          prev.type = ht ?? prev.type;
        } else {
          sections.push({ name: line.trim().slice(0, 80), subject: subj ?? sections[sectionIdx]?.subject, type: ht });
          sectionIdx = sections.length - 1;
        }
        sectionType = sections[sectionIdx].type;
        continue;
      }
    }
    if (headingType(line) && !line.match(Q_START) && line.length < 120) {
      sectionType = headingType(line);
      if (sectionIdx >= 0) sections[sectionIdx].type = sectionType;
    }

    const m = line.match(Q_START) ?? line.match(Q_START_BARE);
    if (m) {
      const n = Number(m[1]);
      const plausible =
        n === lastNumber + 1 ||
        (n === 1) ||
        (n > lastNumber && n <= lastNumber + 4) ||
        (current === null && n > 0);
      // Avoid treating numbered lines inside a question (e.g. "1. statement") as a new question
      // when they don't continue the sequence.
      if (plausible || !current) {
        flush();
        ensureSection();
        current = { number: n, lines: [m[2] ?? ""], section: sectionIdx, page };
        lastNumber = n;
        continue;
      }
    }
    if (current) current.lines.push(line.trim());
  }
  flush();

  // Post-checks: numbering continuity, duplicates, restarts.
  const seen = new Map<string, number>();
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const prev = questions[i - 1];
    const key = `${q.section}:${q.number}`;
    if (seen.has(key)) {
      q.confidence.number = 0.4;
      q.notes.push(`Duplicate question number ${q.number}`);
      warnings.push(`Question number ${q.number} appears more than once${sections.length > 1 ? ` in ${sections[q.section]?.name}` : ""}. Both copies were kept — delete one in review if it's a duplicate.`);
    }
    seen.set(key, i);
    if (prev) {
      if (q.number === 1 && prev.number > 1) {
        if (q.section === prev.section) warnings.push(`Numbering restarts at Q1 after Q${prev.number} — treated as a new block. Check sections in review.`);
      } else if (q.number > prev.number + 1) {
        const missing = q.number - prev.number - 1;
        q.confidence.number = Math.min(q.confidence.number, 0.7);
        warnings.push(`${missing === 1 ? `Question ${prev.number + 1} was` : `Questions ${prev.number + 1}–${q.number - 1} were`} not found between Q${prev.number} and Q${q.number}. Add ${missing === 1 ? "it" : "them"} manually if the paper has ${missing === 1 ? "it" : "them"}.`);
      } else if (q.number <= prev.number && q.number !== 1) {
        q.confidence.number = Math.min(q.confidence.number, 0.5);
        q.notes.push("Out-of-order number");
      }
    }
  }
  if (!questions.length) warnings.push("No questions could be detected in this text. You can still build the paper manually.");
  return { sections, questions, warnings };
}

/* ------------------------------------------------------------------ */
/* Answer keys                                                         */
/* ------------------------------------------------------------------ */

export interface KeyEntry {
  number: number;
  raw: string;
  /** Option letters (A-F) if interpretable as options. */
  letters: string[];
  /** Numerical value if interpretable as a number. */
  value?: number;
  bonus?: boolean;
  dropped?: boolean;
  confidence: number;
}

export interface ParsedKey {
  entries: KeyEntry[];
  warnings: string[];
}

const KEY_RE =
  /(?:^|[\s,;|])(?:Q\.?\s*)?(\d{1,3})\s*(?:[.):\-–=]|\s)\s*\(?\s*(-?\d+\.\d+|bonus|drop(?:ped)?|\*|[A-Fa-f](?:\s*[,&/]\s*[A-Fa-f])*|-?\d+)\s*\)?(?=$|[\s,;|])/gi;

export function parseAnswerKey(raw: string): ParsedKey {
  const text = raw.replace(/\r/g, "").replace(/ /g, " ").replace(/\[\[page \d+\]\]/gi, " ");
  const entries: KeyEntry[] = [];
  const warnings: string[] = [];
  for (const m of text.matchAll(KEY_RE)) {
    const number = Number(m[1]);
    const v = m[2].trim();
    const e: KeyEntry = { number, raw: v, letters: [], confidence: 0.9 };
    if (/^bonus$/i.test(v) || v === "*") {
      e.bonus = true;
    } else if (/^drop/i.test(v)) {
      e.dropped = true;
    } else if (/^[A-Fa-f]/.test(v)) {
      e.letters = v.toUpperCase().split(/\s*[,&/]\s*/).filter(Boolean);
      e.confidence = 0.95;
    } else {
      const n = Number(v);
      e.value = n;
      if (Number.isInteger(n) && n >= 1 && n <= 4) {
        e.letters = [OPTION_KEYS[n - 1]];
        e.confidence = 0.7; // ambiguous: option number or numerical answer
      }
    }
    entries.push(e);
  }
  // Drop matches that are clearly part of prose (numbers out of sequence far away).
  const cleaned: KeyEntry[] = [];
  for (const e of entries) {
    const prev = cleaned[cleaned.length - 1];
    if (prev && e.number !== 1 && (e.number <= prev.number - 1 || e.number > prev.number + 10)) {
      warnings.push(`Ignored an out-of-sequence key entry “${e.number} → ${e.raw}”. Check this entry manually.`);
      continue;
    }
    cleaned.push(e);
  }
  if (!cleaned.length) warnings.push("No answers could be read from the answer key. You can enter the key in the review table.");
  return { entries: cleaned, warnings };
}

/* ------------------------------------------------------------------ */
/* Syllabus                                                            */
/* ------------------------------------------------------------------ */

export interface ParsedSyllabusTopic {
  subject: string;
  chapter: string;
  topic: string;
}

/** Lines in syllabus notices that are never syllabus content. */
const NOTICE_NOISE = /^(test\s+notice|notice|circular|syllabus|subjects?\s*(\/|&|and)?\s*(chapters?|topics?)?\s*(names?)?|chapter\s*names?|topics?|s\.?\s*no\.?\b.*|sr\.?\s*no\.?\b.*)$/i;
const META_LABEL = /^(session|division|course|class|phase|batch|stream|centre|center|test\s*(date|pattern|timing|time|type|name|mode|no\.?)|date|day|time|timing|timings|mode|venue|duration|max(imum)?\s*marks|marks|pattern|reporting\s*time|note|notes|instructions?|important)\b/i;
const TEST_TITLE = /\b(minor|major|unit|mock|monthly|weekly|part|phase|cumulative|full)\s+(test|exam)\b|^(test|exam)\s*[-–:#]?\s*\d+$/i;

function titleCase(s: string): string {
  if (s !== s.toUpperCase() || !/[A-Z]/.test(s)) return s;
  const small = new Set(["and", "of", "the", "in", "on", "to", "for", "a", "an", "with", "by", "under"]);
  return s.toLowerCase().replace(/[a-z][a-z']*/g, (w, idx: number) => (idx > 0 && small.has(w) ? w : w[0].toUpperCase() + w.slice(1)))
    .replace(/\b(Goc|Shm|Dna|Rna|Ac|Dc|Emf|Ph|Iupac|Vsepr)\b/g, (w) => w.toUpperCase());
}

/** Words that strongly suggest a subject; used only to settle which neighbouring label a line belongs to. */
const SUBJECT_KEYWORDS: Record<string, RegExp> = {
  Physics: /\b(motion|kinematics|force|friction|gravity|gravitation|vectors?|velocity|momentum|energy|power|optics|current|magnet\w*|waves?|oscillations?|circular|rotational|fluids?|pressure|electrostatics|capacitors?|semiconductors?|units and dimensions)\b/gi,
  Chemistry: /\b(mole|stoichiometry|concentration|redox|equilibrium|organic|bonding|periodic|thermochemistry|electrochemistry|solutions?|acids?|bases?|salts?|hydrocarbons?|polymers?|atomic structure|chemical|isomerism|kinetics|states of matter)\b/gi,
  Mathematics: /\b(quadratic|logarithms?|surds|matrices|determinants|probability|permutations?|combinations?|sequences?|series|binomial|conic|limits|integration|differentiation|sets|relations|functions|complex numbers|statistics)\b/gi,
  Biology: /\b(cells?|genetics|evolution|plants?|animals?|human|reproduction|ecology|photosynthesis|respiration|tissues?|diversity|biomolecules|inheritance)\b/gi,
};
const keywordScore = (text: string, subject: string | null) => (subject && SUBJECT_KEYWORDS[subject] ? (text.match(SUBJECT_KEYWORDS[subject]) ?? []).length : 0);

/**
 * Flattened tables ("SUBJECT | chapters") put the subject label beside the middle of its
 * chapter list, so text extraction prints chapters above and below the label and can cut
 * a chapter name around it ("…, INTEGRAL" / "PHYSICS CALCULUS, …"). This pass:
 *  - rejoins a name cut around a subject label;
 *  - moves a line printed just above a lone label (after the previous subject's list
 *    ended) under that label, when its keywords agree.
 */
function untangleTableRows(lines: string[]): string[] {
  const out = [...lines];
  const label = (l: string | undefined) => {
    const m = l?.match(SUBJECT_AT_START);
    const subj = m && detectSubject(m[1]);
    return subj ? { subject: subj, rest: m[2].replace(/^[:–—-]\s*/, "").trim(), word: m[1] } : null;
  };
  const isOpenList = (l: string) => l.includes(",") && !/,\s*$/.test(l);
  const lastItem = (l: string) => l.slice(l.lastIndexOf(",") + 1).trim();
  const short = (t: string) => t.length > 1 && t.split(/\s+/).length <= 3;
  let current: string | null = null;
  for (let i = 0; i < out.length; i++) {
    const here = label(out[i]);
    if (here) current = here.subject;
    const line = out[i];
    if (!isOpenList(line)) continue;
    const next = label(out[i + 1]);
    if (!next) continue;
    const frag = lastItem(line);
    if (!short(frag)) continue;
    // Only a list that comes *before* its own label can be cut by it: the first block, or a
    // line that starts right after the previous subject's list ended.
    const prev = out[i - 1];
    const prevEnded = prev !== undefined && prev.includes(",") && !/(,|&|\band|\bof)\s*$/i.test(prev);
    if (!(current === null || (prevEnded && !here))) continue;
    if (next.rest) {
      // "…, INTEGRAL" + "PHYSICS CALCULUS, …" → "…," + "PHYSICS INTEGRAL CALCULUS, …"
      out[i] = line.slice(0, line.lastIndexOf(",") + 1);
      out[i + 1] = `${next.word} ${frag} ${next.rest}`;
    } else if (out[i + 2] !== undefined && !label(out[i + 2])) {
      // "…, CONCENTRATION" + "CHEMISTRY" + "UNITS, …" → "…," + "CHEMISTRY" + "CONCENTRATION UNITS, …"
      out[i] = line.slice(0, line.lastIndexOf(",") + 1);
      out[i + 2] = `${frag} ${out[i + 2]}`;
      // A line that started after the previous subject's list ended belongs to the label below it.
      if (!here && prevEnded && keywordScore(out[i], next.subject) >= keywordScore(out[i], current)) {
        [out[i], out[i + 1]] = [out[i + 1], out[i]];
        current = next.subject;
        i++;
      }
    }
  }
  return out;
}

const SUBJECT_AT_START = new RegExp(`^(${Object.keys(SUBJECT_WORDS).sort((a, b) => b.length - a.length).join("|")})\\b[\\s:–—-]*(.*)$`, "i");

/**
 * Rule-based syllabus parser (used when AI extraction isn't available).
 * Filters notice metadata (dates, timings, session…), rejoins wrapped lines,
 * and understands "Subject: chapters", "Unit 1: Chapter - topics", bullets and
 * comma-separated chapter lists. Output always goes through a review step.
 */
export function parseSyllabusText(raw: string, fallbackSubject = "General"): ParsedSyllabusTopic[] {
  // 1. Clean lines, drop obvious notice metadata.
  const lines: string[] = [];
  for (const rawLine of raw.replace(/\r/g, "").split("\n")) {
    const line = rawLine.replace(/\[\[page \d+\]\]/i, "").replace(/\s+/g, " ").trim();
    if (!line) continue;
    const label = line.split(/\s*[:：]\s*/)[0];
    const hasColon = /[:：]/.test(line);
    if (NOTICE_NOISE.test(line)) continue;
    if (hasColon && META_LABEL.test(label) && !/^(unit|chapter|module)\b/i.test(label)) continue;
    if (!hasColon && META_LABEL.test(line) && line.split(" ").length <= 6 && /\d/.test(line)) continue;
    if (TEST_TITLE.test(line) && line.split(" ").length <= 6) continue;
    if (/^\(?\d{4}\s*[-–]\s*\d{2,4}\)?$/.test(line)) continue;
    lines.push(line);
  }
  // 2. Rejoin lines that were wrapped mid-name ("FORCE AND" + "LAWS OF MOTION").
  const joined: string[] = [];
  for (const line of lines) {
    const prev = joined[joined.length - 1];
    if (prev !== undefined && /(,|&|\band|\bof|\bthe|\bin|[-–])$/i.test(prev) && !SUBJECT_AT_START.test(line.split(/[,:]/)[0]) ) {
      joined[joined.length - 1] = `${prev} ${line}`;
    } else joined.push(line);
  }
  const tableLines = untangleTableRows(joined);

  type Row = { subject: string | null; chapter: string; topic: string };
  const rows: Row[] = [];
  let subject: string | null = null;
  let chapter = "";
  let chapterHasTopics = false;
  const push = (ch: string, tp: string) => {
    const c = titleCase(ch.replace(/[.;:]+$/, "").trim());
    const t = titleCase(tp.replace(/[.;:]+$/, "").trim());
    if (c.length > 1 && t.length > 1) rows.push({ subject, chapter: c, topic: t });
  };
  const closeChapter = () => {
    if (chapter && !chapterHasTopics) push(chapter, chapter);
    chapter = "";
    chapterHasTopics = false;
  };
  const items = (text: string) => {
    const parts = text.split(/;|,(?![^()]*\))/).map((x) => x.trim()).filter((x) => x.length > 1);
    // Keep chapter names that contain a comma together: "Work, Energy and Power", "Sets, Relations and Functions".
    const out: string[] = [];
    for (let i = 0; i < parts.length; i++) {
      const nxt = parts[i + 1];
      if (nxt && /^[A-Za-z]+$/.test(parts[i]) && /^[A-Za-z]+ (and|&) [A-Za-z]+$/i.test(nxt) && (parts.length === 2 || i + 2 === parts.length)) {
        out.push(`${parts[i]}, ${nxt}`);
        i++;
      } else out.push(parts[i]);
    }
    return out;
  };
  const bullet = /^([-•*▪◦·]|\d+\.\d+|[a-z]\)|\([a-z]\)|[ivx]+\))\s+/i;

  for (let line of tableLines) {
    // Subject label, alone or at the start of a table row ("PHYSICS KINEMATICS, …").
    const sm = line.match(SUBJECT_AT_START);
    if (sm && !bullet.test(line)) {
      const subj = detectSubject(sm[1]);
      if (subj) {
        closeChapter();
        if (subject === null) for (const r of rows) if (r.subject === null) r.subject = subj; // table rows printed above the label
        subject = subj;
        line = sm[2].replace(/^[:–—-]\s*/, "").trim();
        if (!line) continue;
      }
    }
    const chap = line.match(/^(?:unit|chapter|module)\b\s*[-–:]?\s*\d*\s*[-–:.)]?\s*(.+)$/i) ?? line.match(/^\d{1,2}[.)]\s+(.+)$/);
    if (chap && !bullet.test(line)) {
      closeChapter();
      const [name, rest] = chap[1].trim().split(/\s*[:–—-]\s+/, 2);
      chapter = name;
      if (rest) for (const t of items(rest)) { push(chapter, t); chapterHasTopics = true; }
      continue;
    }
    if (line.endsWith(":") && line.length < 60) {
      closeChapter();
      chapter = line.slice(0, -1);
      continue;
    }
    const content = line.replace(bullet, "").trim();
    if (bullet.test(line) && chapter) {
      for (const t of items(content)) { push(chapter, t); chapterHasTopics = true; }
      continue;
    }
    const colon = content.match(/^([^:]{2,60}):\s*(.+)$/);
    if (colon) {
      closeChapter();
      chapter = colon[1];
      for (const t of items(colon[2])) { push(chapter, t); chapterHasTopics = true; }
      continue;
    }
    // A plain list of chapter names (the common table layout).
    closeChapter();
    for (const c of items(content)) push(c, c);
  }
  closeChapter();

  const seen = new Set<string>();
  return rows
    .map((r) => ({ subject: r.subject ?? fallbackSubject, chapter: r.chapter, topic: r.topic }))
    .filter((t) => {
      const k = `${t.subject}|${t.chapter}|${t.topic}`.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}
