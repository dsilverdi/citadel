import type OpenAI from "openai";

interface ProviderEvent {
  type: string;
  delta?: string;
  response?: { id: string };
}
export type Submission = { responseId: string } | { rejection: string };

export class ProviderRejected extends Error {
  name = "ProviderRejected";
}

export function submittedResponseId(submission: Submission | string): string {
  // Existing Workflow histories stored successful submissions as a bare ID.
  if (typeof submission === "string") return submission;
  if ("rejection" in submission) throw new ProviderRejected(submission.rejection);
  return submission.responseId;
}

export class UncertainSubmission extends Error {
  name = "UncertainSubmission";
}

function identifier(value: unknown, pattern: RegExp): string | undefined {
  return typeof value === "string" && pattern.test(value) ? value : undefined;
}

export function rejectionMessage(error: {
  status: number;
  code?: unknown;
  param?: unknown;
  requestID?: unknown;
}): string {
  const code = identifier(error.code, /^[a-z0-9_]{1,80}$/i);
  const param = identifier(error.param, /^[a-z0-9_.]{1,120}$/i);
  const requestId = identifier(error.requestID, /^req_[a-z0-9_-]{1,100}$/i);
  const reason =
    error.status === 429
      ? "AI rate or spending limit reached. Check your OpenAI project limits."
      : error.status === 401 || error.status === 403
        ? "AI authentication or permission was rejected. Check the OpenAI API key and AI Gateway token."
        : code === "model_not_found" || param === "model"
          ? "The selected model is unavailable to your OpenAI project. Check model access."
          : "The AI provider rejected this request. Check the indicated parameter and selected model’s supported settings.";
  // Never include raw provider messages: they may contain request text or credentials.
  return `${reason} (HTTP ${error.status}${code ? `; code: ${code}` : ""}${param ? `; parameter: ${param}` : ""}${requestId ? `; request: ${requestId}` : ""})`;
}

/** Return confirmed rejections as data so Workflow serialization cannot erase their type. */
export async function submitResponse(
  client: OpenAI,
  body: Record<string, unknown>,
): Promise<Submission> {
  let stream: AsyncIterable<ProviderEvent>;
  try {
    if (body.stream === false) {
      // A normal background acknowledgement avoids closing an SSE connection at
      // response.created, before the provider has started the queued work.
      const response = await client.post<{ id?: string }>("/responses", { body });
      if (!response.id)
        throw new UncertainSubmission(
          "OpenAI did not confirm a response ID. The request may have been accepted.",
        );
      return { responseId: response.id };
    }
    stream = await client.post<AsyncIterable<ProviderEvent>>("/responses", {
      stream: true,
      body,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      "status" in error &&
      typeof error.status === "number" &&
      [400, 401, 403, 404, 422, 429].includes(error.status)
    ) {
      return { rejection: rejectionMessage(error as Error & { status: number }) };
    }
    // Network failures and 5xx responses may follow an accepted, billable submission.
    throw error;
  }
  for await (const event of stream) {
    if (event.type === "response.created" && event.response?.id)
      return { responseId: event.response.id };
  }
  throw new UncertainSubmission(
    "OpenAI did not confirm a response ID. The request may have been accepted.",
  );
}
