/** Server AI route protection: same-site only, size caps, per-visitor rate limit. */
import { beforeEach, describe, expect, it } from "vitest";
import { guardAiRequest, readJsonCapped, resetGuard, TooLarge } from "./guard";

const req = (headers: Record<string, string> = {}, body = "{}") =>
  new Request("https://exam.example/api/ai", { method: "POST", headers: { host: "exam.example", ...headers }, body });

beforeEach(() => resetGuard());

describe("guardAiRequest", () => {
  it("lets the app's own pages through", () => {
    expect(guardAiRequest(req({ origin: "https://exam.example", "sec-fetch-site": "same-origin" }))).toBeNull();
    expect(guardAiRequest(req())).toBeNull();
  });
  it("refuses other websites", async () => {
    expect(guardAiRequest(req({ origin: "https://evil.example" }))?.status).toBe(403);
    expect(guardAiRequest(req({ "sec-fetch-site": "cross-site" }))?.status).toBe(403);
    expect(guardAiRequest(req({ origin: "not a url" }))?.status).toBe(403);
  });
  it("rate-limits each visitor, then lets them back after the window", () => {
    const t0 = 1_000_000;
    const ip = { "x-forwarded-for": "203.0.113.9" };
    for (let i = 0; i < 30; i++) expect(guardAiRequest(req(ip), t0 + i)).toBeNull();
    const blocked = guardAiRequest(req(ip), t0 + 100);
    expect(blocked?.status).toBe(429);
    expect(Number(blocked?.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(guardAiRequest(req({ "x-forwarded-for": "198.51.100.1" }), t0 + 100)).toBeNull(); // others unaffected
    expect(guardAiRequest(req(ip), t0 + 11 * 60_000)).toBeNull();
  });
});

describe("readJsonCapped", () => {
  it("reads a normal body", async () => {
    await expect(readJsonCapped(req({}, '{"a":1}'), 100)).resolves.toEqual({ a: 1 });
  });
  it("stops reading a body that is too big, even without a size header", async () => {
    await expect(readJsonCapped(req({}, JSON.stringify({ t: "x".repeat(5000) })), 1000)).rejects.toBeInstanceOf(TooLarge);
    await expect(readJsonCapped(req({ "content-length": "999999" }, "{}"), 1000)).rejects.toBeInstanceOf(TooLarge);
  });
});
