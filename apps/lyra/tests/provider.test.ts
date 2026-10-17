import { describe, expect, it } from "vitest";
import { parseProviderResponse } from "../server/provider-response";

describe("OpenAI response normalization", () => {
  it("keeps evidence, clickable citations, and actual usage", () => {
    const result = parseProviderResponse({
      id: "resp_1",
      status: "completed",
      usage: { input_tokens: 123, output_tokens: 45 },
      output: [
        {
          type: "web_search_call",
          action: { sources: [{ url: "https://example.com/", title: "Primary source" }] },
        },
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: "Finding [1]",
              annotations: [
                {
                  type: "url_citation",
                  start_index: 8,
                  end_index: 11,
                  title: "Primary source",
                  url: "https://example.com/",
                },
              ],
            },
          ],
        },
      ],
    });
    expect(result.text).toBe("Finding [Primary source](<https://example.com/>)");
    expect(result.sources).toHaveLength(1);
    expect(result.usage).toEqual({ inputTokens: 123, outputTokens: 45, toolCalls: 1 });
    expect(result.incomplete).toBe(false);
  });
  it("preserves partial text for output-limit responses", () => {
    expect(
      parseProviderResponse({
        id: "resp_1",
        status: "incomplete",
        output: [{ type: "message", content: [{ type: "output_text", text: "Partial evidence" }] }],
      }),
    ).toMatchObject({ text: "Partial evidence", incomplete: true });
  });
});
