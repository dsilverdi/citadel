import { describe, expect, it } from "vitest";
import { defaultSettings, estimateCost, settingsSchema } from "@citadel/ai/models";
import { planOutputSchema, submissionSchema } from "../server/contracts";
import { applyAnnotations, linkCitations, mergeSources } from "../server/citations";

describe("model selection and plans", () => {
  it("keeps the requested model and supported effort unchanged", () => {
    const value = { model: "gpt-6-astra", effort: "high" };
    expect(settingsSchema.parse(value)).toEqual(value);
    expect(settingsSchema.safeParse({ model: "unknown", effort: "high" }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...defaultSettings, effort: "none" }).success).toBe(false);
  });
  it("requires nonempty messages and bounded, actionable plans", () => {
    expect(
      submissionSchema.safeParse({
        id: crypto.randomUUID(),
        content: "   ",
        mode: "research",
        settings: defaultSettings,
      }).success,
    ).toBe(false);
    const base = {
      kind: "plan",
      title: "Test",
      summary: "Summary",
      questions: ["What is established?"],
      clarifyingQuestions: [],
    };
    expect(planOutputSchema.safeParse(base).success).toBe(true);
    expect(planOutputSchema.safeParse({ ...base, questions: [] }).success).toBe(false);
    expect(
      planOutputSchema.safeParse({ ...base, questions: Array(7).fill("Question") }).success,
    ).toBe(false);
    expect(
      planOutputSchema.safeParse({
        ...base,
        kind: "clarification",
        questions: [],
        clarifyingQuestions: ["Which region?"],
      }).success,
    ).toBe(true);
  });
});
describe("citations", () => {
  it("deduplicates safe sources and rejects invented source references", () => {
    const sources = mergeSources([
      { id: "", title: "Docs", url: "https://example.com" },
      { id: "", title: "Duplicate", url: "https://example.com/" },
      { id: "", title: "Unsafe", url: "javascript:alert(1)" },
    ]);
    expect(sources).toEqual([{ id: "S1", title: "Docs", url: "https://example.com/" }]);
    expect(linkCitations("Evidence [S1]", sources)).toBe("Evidence [S1](<https://example.com/>)");
    expect(() => linkCitations("Invented [S99]", sources)).toThrow("Unknown citation");
  });
  it("replaces provider annotations from right to left without corrupting offsets", () => {
    expect(
      applyAnnotations("Fact A; Fact B", [
        { start_index: 0, end_index: 6, title: "A", url: "https://a.example/" },
        { start_index: 8, end_index: 14, title: "B", url: "https://b.example/" },
      ]),
    ).toBe("[A](<https://a.example/>); [B](<https://b.example/>)");
  });
  it("does not fabricate a price when rates are unavailable", () => {
    const usage = { inputTokens: 1_000_000, outputTokens: 500_000, toolCalls: 10 };
    expect(estimateCost(usage)).toBeNull();
    expect(
      estimateCost(usage, { inputPerMillion: 1, outputPerMillion: 2, webSearchPerThousand: 10 }),
    ).toBeCloseTo(2.1);
  });
});
