import { describe, expect, it } from "vitest";
import { defaultSettings, estimateCost, settingsSchema } from "@citadel/ai/models";
import {
  planOutputSchema,
  submissionSchema,
  scopeQuestionSchema,
  clarificationAnswersSchema,
  researchScopeInput,
} from "../server/contracts";
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
        clarifyingQuestions: [
          {
            question: "Which region?",
            options: [
              { label: "Indonesia", description: "Focus on your local market." },
              { label: "Global", description: "Compare markets internationally." },
            ],
            recommendedIndex: 0,
          },
        ],
      }).success,
    ).toBe(true);
  });
});
describe("research scoping", () => {
  const question = {
    id: "q1",
    question: "What is your goal?",
    options: [
      { label: "Choose a product", description: "Compare practical options." },
      { label: "Understand the field", description: "Map concepts and evidence." },
    ],
    recommendedIndex: 0,
  };
  it("requires a valid recommendation and distinct useful choices", () => {
    expect(scopeQuestionSchema.safeParse(question).success).toBe(true);
    expect(scopeQuestionSchema.safeParse({ ...question, recommendedIndex: 3 }).success).toBe(false);
    expect(
      scopeQuestionSchema.safeParse({
        ...question,
        options: [question.options[0], question.options[0]],
      }).success,
    ).toBe(false);
  });
  it("accepts custom answers and turns them into explicit intent for the next plan", () => {
    const body = clarificationAnswersSchema.parse({
      id: crypto.randomUUID(),
      answers: [{ questionId: "q1", answer: "  Evaluate tools for a nonprofit team  " }],
    });
    expect(researchScopeInput([question], body.answers)).toContain(
      "What is your goal?\nAnswer: Evaluate tools for a nonprofit team",
    );
    expect(
      clarificationAnswersSchema.safeParse({
        id: crypto.randomUUID(),
        answers: [{ questionId: "q1", answer: " " }],
      }).success,
    ).toBe(false);
  });
  it("rejects missing, duplicate, and invented question IDs", () => {
    expect(() => researchScopeInput([question], [])).toThrow("Answer each scope question once");
    expect(() =>
      researchScopeInput([question], [{ questionId: "wrong", answer: "Test" }]),
    ).toThrow();
    expect(() =>
      researchScopeInput(
        [question],
        [
          { questionId: "q1", answer: "A" },
          { questionId: "q1", answer: "B" },
        ],
      ),
    ).toThrow();
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
