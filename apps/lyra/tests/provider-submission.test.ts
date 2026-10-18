import OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";
import { planResponseFormat } from "../server/contracts";
import {
  submitResponse,
  submittedResponseId,
  ProviderRejected,
  UncertainSubmission,
} from "../server/provider-submission";

function client(fetch: typeof globalThis.fetch) {
  return new OpenAI({ apiKey: "test-key", maxRetries: 0, fetch });
}

describe("provider submissions across Workflow serialization", () => {
  it("can replay a successful submission from an older Workflow version", () => {
    expect(submittedResponseId("resp_existing")).toBe("resp_existing");
  });
  it("keeps a rejected parameter actionable after a persisted step result", async () => {
    const fetch = vi.fn(async () =>
      Response.json(
        {
          error: {
            message: "Private prompt and secret-key must not escape",
            code: "unsupported_value",
            param: "text.format.type",
            type: "invalid_request_error",
          },
        },
        { status: 400, headers: { "x-request-id": "req_test123" } },
      ),
    );
    const result = await submitResponse(client(fetch), {
      model: "gpt-6-luna",
      text: { format: planResponseFormat },
      input: "Research edge hosting",
      background: true,
      stream: true,
      store: true,
    });
    const restored = JSON.parse(JSON.stringify(result));
    expect(() => submittedResponseId(restored)).toThrow(ProviderRejected);
    expect(() => submittedResponseId(restored)).toThrow(
      "HTTP 400; code: unsupported_value; parameter: text.format.type; request: req_test123",
    );
    expect(JSON.stringify(result)).not.toMatch(/Private prompt|secret-key/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([401, 403, 404, 422, 429])(
    "does not retry a confirmed HTTP %i rejection",
    async (status) => {
      const fetch = vi.fn(async () =>
        Response.json({ error: { message: "rejected" } }, { status }),
      );
      const result = await submitResponse(client(fetch), { model: "gpt-6-astra", stream: true });
      expect(() => submittedResponseId(JSON.parse(JSON.stringify(result)))).toThrow(
        `HTTP ${status}`,
      );
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it("preserves ambiguous network/server failures without claiming a confirmed rejection", async () => {
    const fetch = vi.fn(async () => new Response("Unavailable", { status: 503 }));
    await expect(submitResponse(client(fetch), {})).rejects.toMatchObject({ status: 503 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("recovers the response ID from a real SDK event stream", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          'event: response.created\ndata: {"type":"response.created","response":{"id":"resp_test"}}\n\ndata: [DONE]\n\n',
          { headers: { "content-type": "text/event-stream" } },
        ),
    );
    const result = await submitResponse(client(fetch), { stream: true });
    expect(submittedResponseId(JSON.parse(JSON.stringify(result)))).toBe("resp_test");
  });

  it("keeps submissions without a response ID uncertain", async () => {
    const fetch = vi.fn(
      async () =>
        new Response("data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } }),
    );
    await expect(submitResponse(client(fetch), { stream: true })).rejects.toBeInstanceOf(
      UncertainSubmission,
    );
  });
});
