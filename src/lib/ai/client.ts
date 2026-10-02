"use client";
/**
 * Browser-side access to the AI features (Google Gemini).
 *
 * Two ways in, tried in order:
 *  1. The student's own Gemini API key, saved in Settings on this device
 *     (the only option in the standalone index.html, which has no server).
 *  2. The Next.js server route, when the server has GEMINI_API_KEY set.
 *
 * The key lives in localStorage — never in the exported backup — and is only
 * ever sent to generativelanguage.googleapis.com.
 */
import { checkGeminiKey, describeAiError, geminiCaller } from "./gemini";
import { structurePaperWithAI, type PaperProgress, type PaperStructure } from "./paper";
import { extractSyllabusWithAI, type SyllabusExtraction } from "./syllabus";

const KEY = "exam-pilot-gemini-key";
/** Keys from the earlier Claude and Grok versions; removed so no unused secret lingers in the browser. */
const OLD_KEYS = ["exam-pilot-anthropic-key", "exam-pilot-xai-key"];

/** The single-file build has no server, so it never calls /api/ai. */
export const HAS_SERVER = process.env.NEXT_PUBLIC_STANDALONE !== "1";

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function getUserApiKey(): string | null {
  const ls = storage();
  if (!ls) return null;
  for (const k of OLD_KEYS) ls.removeItem(k);
  return ls.getItem(KEY) || null;
}

export function setUserApiKey(key: string | null) {
  const ls = storage();
  if (ls) {
    if (key) ls.setItem(KEY, key.trim());
    else ls.removeItem(KEY);
    for (const k of OLD_KEYS) ls.removeItem(k);
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event("exam-pilot-ai-key"));
}

/** Cheap validity check: lists the models the key can use (no tokens billed). */
export function testApiKey(key: string) {
  return checkGeminiKey(key.trim());
}

/** Does this server have its own Gemini key? (Always false in the single-file app.) */
export async function serverHasAi(): Promise<boolean> {
  if (!HAS_SERVER) return false;
  try {
    const r = await fetch("/api/ai", { cache: "no-store" });
    if (!r.ok) return false;
    return !!(await r.json()).enabled;
  } catch {
    return false;
  }
}

export type AiSource = "user-key" | "server" | null;

/** Which AI path is available right now (null = rule-based parsing only). */
export async function detectAiSource(): Promise<AiSource> {
  if (getUserApiKey()) return "user-key";
  return (await serverHasAi()) ? "server" : null;
}

async function viaServer<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? "AI extraction isn't available.");
  return j as T;
}

export async function aiExtractSyllabus(text: string, subjects: string[]): Promise<SyllabusExtraction> {
  const key = getUserApiKey();
  if (key) {
    try {
      return await extractSyllabusWithAI(geminiCaller(key), text, subjects);
    } catch (e) {
      throw new Error(describeAiError(e));
    }
  }
  return (await viaServer<{ result: SyllabusExtraction }>("/api/ai/syllabus", { text, subjects })).result;
}

/** Structures question-paper (and key) text with Gemini. Returns the raw structure for fromAiResult. */
export async function aiStructurePaper(paper: string, key: string, subjects: string[], onProgress?: PaperProgress): Promise<{ result: PaperStructure; chunks: number }> {
  const apiKey = getUserApiKey();
  if (apiKey) {
    try {
      const r = await structurePaperWithAI(geminiCaller(apiKey), paper, key, subjects, onProgress);
      return { result: r.result, chunks: r.chunks };
    } catch (e) {
      throw new Error(describeAiError(e));
    }
  }
  const j = await viaServer<{ result: PaperStructure; chunks?: number }>("/api/ai", { paperText: paper, keyText: key, subjects });
  return { result: j.result, chunks: Number(j.chunks) || 1 };
}
