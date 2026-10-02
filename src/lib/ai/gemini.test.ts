/** The Google Gemini connection: request shape, error handling and retries, with a fake fetch. */
import { describe, expect, it, vi } from "vitest";
import { AiError, checkGeminiKey, classify, GEMINI_FALLBACK_MODEL, GEMINI_MODEL, geminiCaller, parseJsonReply } from "./gemini";

const REQ = { system: "sys", user: "doc", schema: { type: "object", properties: {}, required: [], additionalProperties: false }, name: "test", maxTokens: 500 };
const ok = (text: string, finishReason = "STOP") =>
  new Response(JSON.stringify({ modelVersion: GEMINI_MODEL, candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason }] }), { status: 200 });
const err = (status: number, body: object, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });
/** Google's real reply to a bad key (captured from the live API). */
const BAD_KEY = { error: { code: 400, message: "API key not valid. Please pass a valid API key.", status: "INVALID_ARGUMENT", details: [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "API_KEY_INVALID" }] } };

describe("geminiCaller", () => {
  it("posts to generateContent with the key header, the model and a JSON schema", async () => {
    const f = vi.fn(async () => ok('{"a":1}'));
    const r = await geminiCaller("AIza-test", { fetch: f as typeof fetch })(REQ);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`);
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("AIza-test");
    expect(url).not.toContain("AIza");
    const body = JSON.parse(String(init.body));
    expect(body.systemInstruction.parts[0].text).toBe("sys");
    expect(body.contents).toEqual([{ role: "user", parts: [{ text: "doc" }] }]);
    expect(body.generationConfig).toEqual({ temperature: 0, maxOutputTokens: 500, responseMimeType: "application/json", responseJsonSchema: REQ.schema });
    expect(r).toEqual({ text: '{"a":1}', model: GEMINI_MODEL });
  });

  it("ignores thought parts and joins the answer parts", async () => {
    const reply = new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "thinking…", thought: true }, { text: '{"a":' }, { text: "1}" }] }, finishReason: "STOP" }] }), { status: 200 });
    const r = await geminiCaller("k", { fetch: (async () => reply) as typeof fetch })(REQ);
    expect(r.text).toBe('{"a":1}');
  });

  it("treats Google's 400 API_KEY_INVALID as a key problem, without retrying", async () => {
    const f = vi.fn(async () => err(400, BAD_KEY));
    await expect(geminiCaller("AIza-bad", { fetch: f as typeof fetch })(REQ)).rejects.toMatchObject({ kind: "auth" });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("falls back to plain JSON mode when the schema request is rejected", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(err(400, { error: { code: 400, message: "Invalid JSON payload: responseJsonSchema", status: "INVALID_ARGUMENT" } }))
      .mockResolvedValueOnce(ok('{"a":2}'));
    const r = await geminiCaller("k", { fetch: f as unknown as typeof fetch })(REQ);
    expect(r.text).toBe('{"a":2}');
    const second = JSON.parse(String((f.mock.calls[1] as [string, RequestInit])[1].body));
    expect(second.generationConfig.responseJsonSchema).toBeUndefined();
    expect(second.generationConfig.responseMimeType).toBe("application/json");
    expect(second.systemInstruction.parts[0].text).toContain("JSON Schema");
  });

  it("switches to the older Flash-Lite when the model isn't available to the key", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(err(404, { error: { code: 404, message: "models/x is not found", status: "NOT_FOUND" } }))
      .mockResolvedValueOnce(ok('{"a":4}'));
    const r = await geminiCaller("k", { fetch: f as unknown as typeof fetch })(REQ);
    expect(r.text).toBe('{"a":4}');
    expect((f.mock.calls[1] as [string])[0]).toContain(`/models/${GEMINI_FALLBACK_MODEL}:generateContent`);
  });

  it("retries rate limits and server errors, honouring Google's retryDelay", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(err(429, { error: { code: 429, status: "RESOURCE_EXHAUSTED", details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "0s" }] } }))
      .mockResolvedValueOnce(err(503, { error: { code: 503, message: "overloaded" } }, { "retry-after": "0" }))
      .mockResolvedValueOnce(ok('{"a":3}'));
    const r = await geminiCaller("k", { fetch: f as unknown as typeof fetch, retries: 2 })(REQ);
    expect(r.text).toBe('{"a":3}');
    expect(f).toHaveBeenCalledTimes(3);
  });

  it("reports a cut-off reply, a blocked document and a network failure clearly", async () => {
    await expect(geminiCaller("k", { fetch: (async () => ok('{"a"', "MAX_TOKENS")) as typeof fetch })(REQ)).rejects.toMatchObject({ kind: "too_long" });
    await expect(geminiCaller("k", { fetch: (async () => ok("", "SAFETY")) as typeof fetch })(REQ)).rejects.toMatchObject({ kind: "refusal" });
    const blocked = new Response(JSON.stringify({ promptFeedback: { blockReason: "PROHIBITED_CONTENT" } }), { status: 200 });
    await expect(geminiCaller("k", { fetch: (async () => blocked) as typeof fetch })(REQ)).rejects.toMatchObject({ kind: "refusal" });
    await expect(geminiCaller("k", { retries: 0, fetch: (async () => { throw new TypeError("offline"); }) as typeof fetch })(REQ)).rejects.toMatchObject({ kind: "network" });
  });
});

describe("helpers", () => {
  it("checks a key with GET /models, key in the header only", async () => {
    const good = vi.fn(async () => new Response("{}", { status: 200 }));
    await expect(checkGeminiKey("AIza-good", good as typeof fetch)).resolves.toEqual({ ok: true });
    const [url, init] = good.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("AIza-good");
    const bad = (async () => err(400, BAD_KEY)) as typeof fetch;
    await expect(checkGeminiKey("AIza-bad", bad)).resolves.toEqual({ ok: false, error: "Google rejected this key. Copy it again from aistudio.google.com/apikey." });
  });

  it("classifies statuses", () => {
    expect(classify(403, {}).kind).toBe("auth");
    expect(classify(429, {}).kind).toBe("rate");
    expect(classify(404, {}).kind).toBe("not_found");
    expect(classify(500, {}).kind).toBe("server");
    expect(classify(400, { error: { message: "bad field" } }).message).toContain("bad field");
  });

  it("pulls JSON out of a reply, or explains that it can't", () => {
    expect(parseJsonReply('Sure! {"x": [1]} hope that helps')).toEqual({ x: [1] });
    expect(() => parseJsonReply("nothing here")).toThrow(AiError);
  });
});
