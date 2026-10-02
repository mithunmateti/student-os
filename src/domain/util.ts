/** Small, pure helpers shared by domain modules. */

let counter = 0;
export function uid(prefix = "id"): string {
  counter = (counter + 1) % 1e6;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${rand}`;
}

/** Deterministic PRNG (mulberry32) — used for seeded demo data. */
export function seededRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ----------------------------- dates ------------------------------ */

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function today(): string {
  return toISODate(new Date());
}

export function addDays(date: string, n: number): string {
  const d = parseISODate(date);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  const ms = parseISODate(b).getTime() - parseISODate(a).getTime();
  return Math.round(ms / 86_400_000);
}

export function formatDate(s: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }): string {
  if (!s) return "—";
  return parseISODate(s).toLocaleDateString(undefined, opts);
}

export function formatRelativeDay(date: string, ref = today()): string {
  const n = daysBetween(ref, date);
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n === -1) return "Yesterday";
  if (n > 1 && n < 7) return parseISODate(date).toLocaleDateString(undefined, { weekday: "long" });
  if (n < 0) return `${-n} days ago`;
  return formatDate(date, { day: "numeric", month: "short" });
}

/* ----------------------------- numbers ---------------------------- */

/** Round to 2 decimals without float noise (0.1 + 0.2 → 0.3). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function fmtNum(n: number, digits = 2): string {
  const r = Number(n.toFixed(digits));
  return Number.isInteger(r) ? String(r) : String(r);
}

export function fmtSigned(n: number): string {
  const r = round2(n);
  if (r > 0) return `+${fmtNum(r)}`;
  if (r < 0) return `−${fmtNum(Math.abs(r))}`;
  return "0";
}

export function pct(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function sum(ns: number[]): number {
  return round2(ns.reduce((a, b) => a + b, 0));
}

export function groupBy<T, K extends string>(items: T[], key: (t: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const it of items) {
    const k = key(it);
    (out[k] ||= []).push(it);
  }
  return out;
}

export function norm(s: string | undefined): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function plural(n: number, one: string, many = one + "s"): string {
  return `${n} ${n === 1 ? one : many}`;
}

export const OPTION_KEYS = ["A", "B", "C", "D", "E", "F"];

/** "today", "tomorrow", "Sunday", "3 Oct" — for use mid-sentence. */
export function relativeDayInline(date: string, ref = today()): string {
  return formatRelativeDay(date, ref).replace(/^(Today|Tomorrow|Yesterday)$/, (m) => m.toLowerCase());
}

/** A 0..100 percentage with at most one decimal: 54.75 → "54.8%". */
export function fmtPct1(p: number | null | undefined): string {
  if (p === null || p === undefined || Number.isNaN(p)) return "—";
  return `${Math.round(p * 10) / 10}%`;
}
