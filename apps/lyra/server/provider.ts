import { parseProviderResponse, type Completion, type ProviderResponse } from "./provider-response";
export type { Completion } from "./provider-response";
import { createOpenAI, type ModelSettings, type Usage } from "@citadel/ai";
import { eq } from "drizzle-orm";
import type { WorkflowStep } from "cloudflare:workers";
import type { Env } from "./env";
import { database, getRun, type RunRow } from "./repository";
import { steps, messages, runs } from "./schema";

interface ProviderEvent {
  type: string;
  delta?: string;
  response?: ProviderResponse;
}
export class StoppedRun extends Error {
  name = "StoppedRun";
}
export class UncertainSubmission extends Error {
  name = "UncertainSubmission";
}
export class ResearchLimit extends Error {
  name = "ResearchLimit";
}
export class ProviderRejected extends Error {
  name = "ProviderRejected";
}

export async function assertRunning(env: Env, runId: string) {
  const run = await getRun(env, runId);
  if (!["running", "queued"].includes(run.status)) throw new StoppedRun();
  if (Date.now() >= run.deadline)
    throw new ResearchLimit("The run reached its 30 minute time limit.");
  return run;
}

async function savePartial(env: Env, run: RunRow, text: string) {
  await database(env)
    .insert(messages)
    .values({
      id: `${run.id}-assistant`,
      conversationId: run.conversationId,
      runId: run.id,
      role: "assistant",
      content: text,
      sources: "[]",
      createdAt: run.createdAt + 1,
    })
    .onConflictDoUpdate({ target: messages.id, set: { content: text } });
}

export async function complete(
  env: Env,
  run: RunRow,
  key: string,
  options: {
    instructions: string;
    input: string;
    search?: boolean;
    toolBudget?: number;
    json?: boolean;
    live?: (text: string) => Promise<void>;
  },
  workflow: WorkflowStep,
): Promise<Completion> {
  const db = database(env);
  const stepId = `${run.id}:${key}`;
  if (env.APP_ENV === "local" && env.MOCK_AI === "true") {
    await workflow.sleep(`${key}-mock-latency`, "1 second");
    return workflow.do(`${key}-mock`, async () => {
      await assertRunning(env, run.id);
      const text = options.json
        ? JSON.stringify({
            kind: "plan",
            title: "Research brief",
            summary: "Compare authoritative sources and report findings with citations.",
            questions: [
              "What do primary sources establish about the question?",
              "What tradeoffs and uncertainties should be considered?",
            ],
            clarifyingQuestions: [],
          })
        : options.search
          ? "Cloudflare Workers runs application code at the edge. Consult the official documentation for capabilities and limits. [Cloudflare](https://developers.cloudflare.com/workers/)"
          : key === "synthesis"
            ? "## Research findings\n\nCloudflare Workers supports deploying applications close to users. [S1]\n\n### What to consider\n\nChoose services around the workload and verify limits before deployment.\n\n### Uncertainties\n\nThis is a local demonstration using deterministic sample evidence, not live research."
            : "I’m Lyra, your research companion. Switch to **Deep research** to review a plan and explore a question with sources.\n\nThis local session uses sample responses. Configure OpenAI to run live research.";
      const result: Completion = {
        text,
        sources: options.search
          ? [
              {
                id: "S1",
                url: "https://developers.cloudflare.com/workers/",
                title: "Cloudflare Workers documentation",
              },
            ]
          : [],
        usage: { inputTokens: 120, outputTokens: 160, toolCalls: options.search ? 1 : 0 },
        incomplete: false,
      };
      if (options.live) {
        await savePartial(env, run, text);
        await options.live(text);
      }
      await db
        .insert(steps)
        .values({
          id: stepId,
          runId: run.id,
          status: "completed",
          result: JSON.stringify(result),
          ...usageColumns(result.usage),
          createdAt: Date.now(),
        })
        .onConflictDoNothing();
      await updateUsage(env, run.id);
      return result;
    });
  }

  const responseId = await workflow.do(
    `${key}-submit`,
    { retries: { limit: 0, delay: "1 second", backoff: "constant" }, timeout: "2 minutes" },
    async () => {
      await assertRunning(env, run.id);
      const existing = await db.select().from(steps).where(eq(steps.id, stepId)).get();
      if (existing?.responseId) return existing.responseId;
      if (existing)
        throw new UncertainSubmission(
          "A previous provider submission could not be confirmed. Cancel this run before trying again.",
        );
      const client = createOpenAI(env);
      await db
        .insert(steps)
        .values({ id: stepId, runId: run.id, status: "creating", createdAt: Date.now() });
      const settings = JSON.parse(run.settings) as ModelSettings;
      // Public SDK transport methods preserve support for newly released model settings.
      let stream: AsyncIterable<ProviderEvent>;
      try {
        stream = await client.post<AsyncIterable<ProviderEvent>>("/responses", {
          stream: true,
          body: {
            model: settings.model,
            reasoning: { effort: settings.effort },
            instructions: options.instructions,
            input: options.input,
            background: true,
            stream: true,
            store: true,
            max_output_tokens: 8192,
            ...(options.json ? { text: { format: { type: "json_object" } } } : {}),
            ...(options.search
              ? {
                  tools: [{ type: "web_search" }],
                  max_tool_calls: options.toolBudget || 1,
                  include: ["web_search_call.action.sources"],
                }
              : {}),
          },
        });
      } catch (error) {
        if (
          error instanceof Error &&
          "status" in error &&
          typeof error.status === "number" &&
          [400, 401, 403, 404, 422, 429].includes(error.status)
        ) {
          await db.update(steps).set({ status: "completed" }).where(eq(steps.id, stepId));
          throw new ProviderRejected(
            error.status === 429
              ? "OpenAI rate or spending limit reached. Check your project limits before starting another run."
              : "OpenAI rejected the request. Check your API key, model access, and the selected model’s tool and effort support.",
          );
        }
        throw error;
      }
      for await (const event of stream) {
        if (event.type === "response.created" && event.response?.id) {
          await db
            .update(steps)
            .set({ responseId: event.response.id, status: "active" })
            .where(eq(steps.id, stepId));
          await assertRunning(env, run.id);
          // Breaking closes the stream; background generation continues at OpenAI.
          return event.response.id;
        }
      }
      throw new UncertainSubmission(
        "OpenAI did not confirm a response ID. The request may have been accepted.",
      );
    },
  );

  if (options.live) {
    await workflow.do(
      `${key}-stream`,
      { retries: { limit: 0, delay: "1 second", backoff: "constant" }, timeout: "10 minutes" },
      async () => {
        await assertRunning(env, run.id);
        let text = "";
        let savedAt = 0;
        try {
          const stream = await createOpenAI(env).get<AsyncIterable<ProviderEvent>>(
            `/responses/${responseId}`,
            { stream: true, query: { stream: true } },
          );
          for await (const event of stream) {
            if (event.type === "response.output_text.delta" && event.delta) {
              text += event.delta;
              if (Date.now() - savedAt > 350) {
                await assertRunning(env, run.id);
                await savePartial(env, run, text);
                await options.live?.(text);
                savedAt = Date.now();
              }
            }
          }
          if (text) {
            await savePartial(env, run, text);
            await options.live?.(text);
          }
        } catch (error) {
          if (error instanceof StoppedRun || error instanceof ResearchLimit) throw error;
          // A dropped stream is recoverable: poll the saved provider response below.
        }
      },
    );
  }

  for (let poll = 0; poll < 360; poll++) {
    const response = await workflow.do(
      `${key}-poll-${poll}`,
      { retries: { limit: 3, delay: "2 seconds", backoff: "exponential" }, timeout: "1 minute" },
      async () => {
        await assertRunning(env, run.id);
        return createOpenAI(env).get<ProviderResponse>(`/responses/${responseId}`);
      },
    );
    if (["queued", "in_progress"].includes(response.status)) {
      await workflow.sleep(`${key}-wait-${poll}`, "5 seconds");
      continue;
    }
    if (response.status === "cancelled") throw new StoppedRun();
    if (!["completed", "incomplete"].includes(response.status))
      throw new Error("The model could not complete this step. Please try a new run.");
    return workflow.do(`${key}-save`, async () => {
      const result = parseProviderResponse(response);
      await db
        .update(steps)
        .set({ status: "completed", result: JSON.stringify(result), ...usageColumns(result.usage) })
        .where(eq(steps.id, stepId));
      await updateUsage(env, run.id);
      return result;
    });
  }
  throw new ResearchLimit("The run reached its polling limit.");
}

function usageColumns(usage: Usage) {
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    toolCalls: usage.toolCalls,
  };
}
async function updateUsage(env: Env, runId: string) {
  const rows = await database(env).select().from(steps).where(eq(steps.runId, runId)).all();
  const usage = rows.reduce(
    (sum, row) => ({
      inputTokens: sum.inputTokens + row.inputTokens,
      outputTokens: sum.outputTokens + row.outputTokens,
      toolCalls: sum.toolCalls + row.toolCalls,
    }),
    { inputTokens: 0, outputTokens: 0, toolCalls: 0 },
  );
  await database(env).update(runs).set(usage).where(eq(runs.id, runId));
}

export async function cancelProviderResponses(env: Env, runId: string) {
  if (env.APP_ENV === "local" && env.MOCK_AI === "true") return;
  const active = await database(env).select().from(steps).where(eq(steps.runId, runId)).all();
  for (const item of active.filter((entry) => entry.status === "active" && entry.responseId)) {
    const response = await createOpenAI(env).post<ProviderResponse>(
      `/responses/${item.responseId}/cancel`,
      {},
    );
    const result = parseProviderResponse(response);
    await database(env)
      .update(steps)
      .set({ status: "completed", result: JSON.stringify(result), ...usageColumns(result.usage) })
      .where(eq(steps.id, item.id));
  }
  await updateUsage(env, runId);
}
