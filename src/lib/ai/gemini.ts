/**
 * Google Gemini connection for the AI features: syllabus extraction and question-paper
 * structuring. Plain fetch against the Gemini API's generateContent endpoint, so it runs
 * the same in the browser (student's own key; Google allows cross-origin calls, even from
 * a file:// page) and on the Next.js server (GEMINI_API_KEY).
 */

/** Fast, low-cost Gemini model with a free tier ($0.30 / $2.50 per million tokens on the paid tier). Thinks minimally by default. */
export const GEMINI_MODEL = "gemini-3.5-flash-lite";
/** Used if the main model isn't available to the key (404). */
export const GEMINI_FALLBACK_MODEL = "gemini-2.5-flash-lite";
export const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

export type AiErrorKind = "auth" | "rate" | "network" | "server" | "bad_request" | "not_found" | "refusal" | "too_long" | "unreadable";

export class AiError extends Error {
  constructor(public kind: AiErrorKind, message: string, public status?: number) {
    super(message);
    this.name = "AiError";
  }
}

export interface JsonRequest {
  system: string;
  user: string;
  /** JSON Schema the reply must follow (all properties required, no extras). */
  schema: object;
  name: string;
  maxTokens: number;
}
export interface JsonReply { text: string; model: string }
/** Asks a model for JSON. The extraction code only depends on this, so tests can pass a fake. */
export type JsonCaller = (req: JsonRequest) => Promise<JsonReply>;

type Fetch = typeof fetch;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface GoogleError { error?: { message?: string; status?: string; details?: { reason?: string; retryDelay?: string }[] } }

function errorText(body: unknown): string {
  const e = (body as GoogleError | null)?.error;
  return typeof e?.message === "string" ? e.message : "";
}

/** Google reports a bad key as 400 INVALID_ARGUMENT with reason API_KEY_INVALID, not 401. */
export function classify(status: number, body: unknown): AiError {
  const text = errorText(body);
  const reasons = ((body as GoogleError | null)?.error?.details ?? []).map((d) => d.reason ?? "");
  if (status === 401 || status === 403 || reasons.some((r) => /API_KEY/.test(r)) || /api key/i.test(text)) return new AiError("auth", "Google rejected the Gemini API key. Check it in Settings.", status);
  if (status === 429) return new AiError("rate", "Gemini's usage limit was reached (the free tier allows a few requests a minute). Wait a minute and try again.", status);
  if (status === 404) return new AiError("not_found", `This Gemini model isn't available to your key${text ? `: ${text.slice(0, 140)}` : ""}.`, status);
  if (status >= 500) return new AiError("server", `Google had a problem (${status}). Try again shortly.`, status);
  return new AiError("bad_request", `Gemini couldn't process the request (${status})${text ? `: ${text.slice(0, 140)}` : ""}.`, status);
}

/** Wait suggested by Google: a Retry-After header, or RetryInfo.retryDelay ("30s") in the body. */
function retryWait(res: Response, body: unknown, attempt: number): number {
  const header = Number(res.headers.get("retry-after")) * 1000;
  if (header) return header;
  const delay = ((body as GoogleError | null)?.error?.details ?? []).find((d) => d.retryDelay)?.retryDelay;
  const secs = delay ? parseFloat(delay) : NaN;
  return Number.isFinite(secs) ? secs * 1000 : 1500 * (attempt + 1);
}

const BLOCKED = /SAFETY|RECITATION|BLOCKLIST|PROHIBITED|SPII|IMAGE_SAFETY|LANGUAGE/;

/** Calls Gemini's generateContent with a JSON schema; retries rate limits and server errors. */
export function geminiCaller(apiKey: string, opts: { fetch?: Fetch; model?: string; fallbackModel?: string | null; baseUrl?: string; retries?: number } = {}): JsonCaller {
  const doFetch = opts.fetch ?? fetch.bind(globalThis);
  const base = opts.baseUrl ?? GEMINI_BASE_URL;
  const retries = opts.retries ?? 2;
  const fallbackModel = opts.fallbackModel === undefined ? GEMINI_FALLBACK_MODEL : opts.fallbackModel;
  let model = opts.model ?? GEMINI_MODEL;

  const send = async (req: JsonRequest, structured: boolean): Promise<JsonReply> => {
    const body = {
      systemInstruction: { parts: [{ text: structured ? req.system : `${req.system}\n\nRespond with only one JSON object that matches this JSON Schema:\n${JSON.stringify(req.schema)}` }] },
      contents: [{ role: "user", parts: [{ text: req.user }] }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: req.maxTokens,
        responseMimeType: "application/json",
        ...(structured ? { responseJsonSchema: req.schema } : {}),
      },
    };
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await doFetch(`${base}/models/${model}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey }, body: JSON.stringify(body) });
      } catch {
        if (attempt < retries) { await sleep(800 * (attempt + 1)); continue; }
        throw new AiError("network", "Couldn't reach Google Gemini. Check your internet connection.");
      }
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const err = classify(res.status, json);
        if ((err.kind === "rate" || err.kind === "server") && attempt < retries) {
          await sleep(Math.min(retryWait(res, json, attempt), 20_000));
          continue;
        }
        throw err;
      }
      type Candidate = { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string };
      const reply = json as { candidates?: Candidate[]; promptFeedback?: { blockReason?: string }; modelVersion?: string } | null;
      if (reply?.promptFeedback?.blockReason) throw new AiError("refusal", "Gemini declined to read this document.");
      const cand = reply?.candidates?.[0];
      if (cand?.finishReason === "MAX_TOKENS") throw new AiError("too_long", "The reply was cut off because the document is too long for one pass.");
      if (cand?.finishReason && BLOCKED.test(cand.finishReason)) throw new AiError("refusal", "Gemini declined to read this document.");
      const text = (cand?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("");
      if (!text) throw new AiError("unreadable", "Gemini returned an empty reply.");
      return { text, model: reply?.modelVersion ?? model };
    }
  };

  const withFallbacks = async (req: JsonRequest, structured: boolean): Promise<JsonReply> => {
    try {
      return await send(req, structured);
    } catch (e) {
      // The model isn't offered to this key (retired, or region): use the older Flash-Lite.
      if (e instanceof AiError && e.kind === "not_found" && fallbackModel && model !== fallbackModel) {
        model = fallbackModel;
        return send(req, structured);
      }
      throw e;
    }
  };

  return async (req) => {
    try {
      return await withFallbacks(req, true);
    } catch (e) {
      // If the schema itself is rejected, ask for plain JSON with the schema in the instructions.
      if (e instanceof AiError && e.kind === "bad_request") return withFallbacks(req, false);
      throw e;
    }
  };
}

/** Checks a key without spending tokens: lists the models it can use. */
export async function checkGeminiKey(apiKey: string, doFetch: Fetch = fetch.bind(globalThis)): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await doFetch(`${GEMINI_BASE_URL}/models?pageSize=1`, { headers: { "x-goog-api-key": apiKey } });
    if (res.ok) return { ok: true };
    const err = classify(res.status, await res.json().catch(() => null));
    return { ok: false, error: err.kind === "auth" ? "Google rejected this key. Copy it again from aistudio.google.com/apikey." : err.message };
  } catch {
    return { ok: false, error: "Couldn't reach Google Gemini. Check your internet connection." };
  }
}

/** Pulls the JSON object out of a reply (tolerates text around it in the plain-JSON fallback). */
export function parseJsonReply(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new AiError("unreadable", "The AI response couldn't be read.");
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new AiError("unreadable", "The AI response couldn't be read.");
  }
}

/** Human-readable message for any AI failure. */
export function describeAiError(e: unknown): string {
  if (e instanceof AiError) return e.message;
  return e instanceof Error ? e.message : "AI extraction failed.";
}
