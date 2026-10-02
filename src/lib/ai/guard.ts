/**
 * Protects the server's AI routes (only used when the server has its own GEMINI_API_KEY):
 *  - only this site's own pages may call them (other websites can't use a visitor's browser to),
 *  - request bodies are size-capped while being read (a missing/false Content-Length doesn't help),
 *  - each visitor gets a limited number of requests, so nobody can drain the server's AI quota.
 * Server-side only; nothing here runs in the browser.
 */
const WINDOW_MS = 10 * 60_000;
const MAX_REQUESTS = 30;
const hits = new Map<string, number[]>();

const deny = (status: number, error: string, headers: Record<string, string> = {}) => Response.json({ error }, { status, headers });

/** Returns a ready error Response when the request must be refused, otherwise null. */
export function guardAiRequest(req: Request, now = Date.now()): Response | null {
  // Browsers mark cross-site requests; refuse them outright.
  if (req.headers.get("sec-fetch-site") === "cross-site") return deny(403, "Not allowed.");
  const origin = req.headers.get("origin");
  if (origin) {
    let originHost = "";
    try {
      originHost = new URL(origin).host;
    } catch {
      return deny(403, "Not allowed.");
    }
    if (originHost !== new URL(req.url).host && originHost !== req.headers.get("host")) return deny(403, "Not allowed.");
  }
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS) {
    const wait = Math.ceil((WINDOW_MS - (now - recent[0])) / 1000);
    return deny(429, "Too many AI requests. Try again in a few minutes.", { "Retry-After": String(wait) });
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (now - v[v.length - 1] >= WINDOW_MS) hits.delete(k);
  return null;
}

export class TooLarge extends Error {}

/** Reads a JSON body, giving up as soon as it exceeds `maxBytes`. */
export async function readJsonCapped(req: Request, maxBytes: number): Promise<unknown> {
  const declared = Number(req.headers.get("content-length"));
  if (declared > maxBytes) throw new TooLarge();
  if (!req.body) return JSON.parse(await req.text());
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new TooLarge();
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let off = 0;
  for (const c of chunks) {
    all.set(c, off);
    off += c.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(all));
}

/** For tests. */
export function resetGuard() {
  hits.clear();
}
