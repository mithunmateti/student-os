import { describe, expect, it, vi } from "vitest";
import { fromAiResult } from "@/domain/import/ai";
import { AiError, GEMINI_MODEL, type JsonCaller, type JsonRequest } from "./gemini";
import { chunkPaper, mergeStructures, structurePaperWithAI, type PaperQuestion, type PaperStructure } from "./paper";

const q = (number: number, section = 0, text = `Question ${number} text`): PaperQuestion => ({
  number, section, type: "single", text, options: [{ key: "A", text: "1" }, { key: "B", text: "2" }, { key: "C", text: "3" }, { key: "D", text: "4" }],
  answer_letters: ["B"], answer_value: null, answer_status: "keyed", has_figure: false, chapter: "", confidence: 0.9,
});

function paperText(n: number) {
  const lines = ["PHYSICS - SECTION A"];
  for (let i = 1; i <= n; i++) {
    if (i === Math.floor(n / 2) + 1) lines.push("CHEMISTRY - SECTION A");
    lines.push(`${i}. A particle moves along a straight line so that its displacement after t seconds is given; find the velocity at t = ${i} s when the constant is ${i * 3}.`);
    lines.push("(1) 2 m/s (2) 4 m/s (3) 6 m/s (4) 8 m/s");
  }
  return lines.join("\n");
}

type Reply = PaperStructure | string | { stop: "max_tokens" };
function fakeClient(replies: (content: string) => Reply) {
  const stream = vi.fn(async (req: JsonRequest) => {
    const r = replies(req.user);
    if (typeof r === "object" && "stop" in r) throw new AiError("too_long", "cut off");
    return { model: GEMINI_MODEL, text: typeof r === "string" ? r : JSON.stringify(r) };
  });
  return { client: stream as JsonCaller, stream };
}

/** Replies with one question per "N." line found in the chunk's <paper> block. */
function echo(content: string): PaperStructure {
  const paper = content.slice(content.indexOf("<paper>"), content.indexOf("</paper>"));
  const nums = [...paper.matchAll(/^(\d+)\. /gm)].map((m) => Number(m[1]));
  const chem = paper.includes("CHEMISTRY");
  const firstChem = chem ? Number(paper.slice(paper.indexOf("CHEMISTRY")).match(/^(\d+)\. /m)?.[1]) : Infinity;
  const startsChem = !chem && /“CHEMISTRY[^”]*”, so it starts/.test(content);
  const sections = [{ name: "Section A", subject: startsChem ? "Chemistry" : "Physics", type: "single" }];
  if (chem) sections.push({ name: "Section A", subject: "Chemistry", type: "single" });
  return { sections, questions: nums.map((n) => q(n, chem && n >= firstChem ? 1 : 0)) };
}

describe("chunkPaper", () => {
  it("keeps short papers in one piece", () => {
    expect(chunkPaper(paperText(5))).toHaveLength(1);
  });
  it("cuts long papers only at question starts, losing nothing", () => {
    const text = paperText(120);
    const chunks = chunkPaper(text, 4000);
    expect(chunks.length).toBeGreaterThan(3);
    expect(chunks.join("\n")).toBe(text);
    for (const c of chunks.slice(1)) expect(c).toMatch(/^\d+\. /);
  });
});

describe("mergeStructures", () => {
  it("maps chunk-local sections onto shared ones and drops a question repeated at a boundary", () => {
    const merged = mergeStructures([
      { sections: [{ name: "Section A", subject: "Physics", type: "single" }], questions: [q(1), q(2, 0, "short")] },
      { sections: [{ name: "Section A", subject: "Physics", type: "single" }, { name: "Section A", subject: "Chemistry", type: "numerical" }], questions: [q(2, 0, "the full question two"), q(3), q(4, 1)] },
    ]);
    expect(merged.sections.map((s) => s.subject)).toEqual(["Physics", "Chemistry"]);
    expect(merged.questions.map((x) => [x.number, x.section])).toEqual([[1, 0], [2, 0], [3, 0], [4, 1]]);
    expect(merged.questions[1].text).toBe("the full question two");
  });
});

describe("structurePaperWithAI", () => {
  it("sends the paper, the key and a strict JSON schema", async () => {
    const { client, stream } = fakeClient(echo);
    const r = await structurePaperWithAI(client, paperText(6), "1-B 2-B", ["Physics", "Chemistry"]);
    const req = stream.mock.calls[0][0];
    expect(req.name).toBe("question_paper");
    expect(req.user).toContain("<key>\n1-B 2-B");
    expect((req.schema as { required: string[] }).required).toEqual(["sections", "questions"]);
    expect(r.result.questions).toHaveLength(6);
    expect(r.chunks).toBe(1);
  });

  it("reads a long paper in parts and merges them in order", async () => {
    const { client, stream } = fakeClient(echo);
    const progress: number[] = [];
    const r = await structurePaperWithAI(client, paperText(200), "", ["Physics", "Chemistry"], (d) => progress.push(d));
    expect(stream.mock.calls.length).toBe(r.chunks);
    expect(r.chunks).toBeGreaterThan(1);
    expect(r.result.questions.map((x) => x.number)).toEqual(Array.from({ length: 200 }, (_, i) => i + 1));
    expect(r.result.sections.map((s) => s.subject)).toEqual(["Physics", "Chemistry"]);
    expect(r.result.questions[199].section).toBe(1);
    expect(progress.at(-1)).toBe(r.chunks);
    // Later parts are told which section they start in.
    const last = stream.mock.calls.at(-1)![0].user;
    expect(last).toMatch(/part \d+ of \d+/);
    expect(last).toContain("CHEMISTRY - SECTION A");
    // And the merged result converts cleanly for the review table.
    const { paper, keys } = fromAiResult(r.result);
    expect(paper.questions).toHaveLength(200);
    expect(keys[0].letters).toEqual(["B"]);
  });

  it("splits a part in half when the reply is cut off", async () => {
    let first = true;
    const { client, stream } = fakeClient((c) => {
      if (first) { first = false; return { stop: "max_tokens" }; }
      return echo(c);
    });
    const r = await structurePaperWithAI(client, paperText(40), "", ["Physics"]);
    expect(stream.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(r.result.questions.map((x) => x.number)).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
  });

  it("rejects empty or unreadable input", async () => {
    const { client } = fakeClient(() => "not json");
    await expect(structurePaperWithAI(client, "  ", "", [])).rejects.toThrow("No paper text");
    await expect(structurePaperWithAI(client, paperText(3), "", [])).rejects.toThrow("couldn't be read");
  });
});
