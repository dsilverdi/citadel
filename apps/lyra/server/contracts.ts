import { z } from "zod";
import { settingsSchema, type ModelSettings, type Usage } from "@citadel/ai/models";

export const idSchema = z.string().uuid();
export const submissionSchema = z.object({
  id: idSchema,
  content: z.string().trim().min(1).max(24_000),
  mode: z.enum(["chat", "research"]),
  settings: settingsSchema,
});
export const approvalSchema = z.object({ id: idSchema });
export const scopeQuestionSchema = z
  .object({
    question: z.string().min(1).max(300),
    options: z
      .array(
        z.object({
          label: z.string().min(1).max(80),
          description: z.string().min(1).max(180),
        }),
      )
      .min(2)
      .max(4),
    recommendedIndex: z.number().int().min(0).max(3),
  })
  .refine(
    (value) =>
      value.recommendedIndex < value.options.length &&
      new Set(value.options.map((option) => option.label)).size === value.options.length,
  );
export type ScopeQuestion = z.infer<typeof scopeQuestionSchema> & { id: string };
export interface ResearchClarification {
  id: string;
  conversationId: string;
  summary: string;
  questions: ScopeQuestion[];
  status: "pending" | "answered" | "superseded";
}
export const clarificationAnswersSchema = z.object({
  id: idSchema,
  answers: z
    .array(
      z.object({
        questionId: z.string().min(1).max(20),
        answer: z.string().trim().min(1).max(1000),
      }),
    )
    .min(1)
    .max(3),
});
export function researchScopeInput(
  questions: ScopeQuestion[],
  answers: z.infer<typeof clarificationAnswersSchema>["answers"],
): string {
  const byId = new Map(answers.map((answer) => [answer.questionId, answer.answer]));
  if (
    byId.size !== answers.length ||
    answers.length !== questions.length ||
    questions.some((question) => !byId.has(question.id))
  )
    throw new AppError(400, "Answer each scope question once before continuing.");
  return `Research scope preferences:\n${questions.map((question) => `${question.question}\nAnswer: ${byId.get(question.id)}`).join("\n\n")}`;
}
// Strict Structured Outputs avoids legacy JSON-mode prompt requirements.
// Cross-field rules and size bounds remain enforced by planOutputSchema below.
export const planResponseFormat = {
  type: "json_schema",
  name: "research_plan",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      kind: { type: "string", enum: ["plan", "clarification"] },
      title: { type: "string" },
      summary: { type: "string" },
      questions: { type: "array", items: { type: "string" } },
      clarifyingQuestions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            question: { type: "string" },
            options: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: { label: { type: "string" }, description: { type: "string" } },
                required: ["label", "description"],
              },
            },
            recommendedIndex: { type: "integer" },
          },
          required: ["question", "options", "recommendedIndex"],
        },
      },
    },
    required: ["kind", "title", "summary", "questions", "clarifyingQuestions"],
  },
} as const;
export const planOutputSchema = z
  .object({
    kind: z.enum(["plan", "clarification"]),
    title: z.string().min(1).max(160),
    summary: z.string().min(1).max(2_000),
    questions: z.array(z.string().min(1).max(500)).max(6),
    clarifyingQuestions: z.array(scopeQuestionSchema).max(3),
  })
  .refine((value) =>
    value.kind === "plan"
      ? value.questions.length > 0 && value.clarifyingQuestions.length === 0
      : value.clarifyingQuestions.length > 0 && value.questions.length === 0,
  );

export interface Source {
  id: string;
  url: string;
  title: string;
}
export interface Message {
  id: string;
  conversationId: string;
  runId: string | null;
  role: "user" | "assistant";
  content: string;
  sources: Source[];
  createdAt: number;
}
export interface Conversation {
  id: string;
  title: string;
  settings: ModelSettings;
  updatedAt: number;
}
export interface ResearchPlan {
  id: string;
  conversationId: string;
  title: string;
  summary: string;
  questions: string[];
  status: "pending" | "approved" | "superseded";
}
export type RunStatus =
  "queued" | "running" | "completed" | "failed" | "cancelled" | "limited" | "uncertain";
export interface Run {
  id: string;
  conversationId: string;
  mode: "chat" | "plan" | "research";
  status: RunStatus;
  settings: ModelSettings;
  usage: Usage;
  estimatedCost: number | null;
  reportReady: boolean;
  error: string | null;
  createdAt: number;
}
export interface RunEvent {
  id: number;
  runId: string;
  kind: string;
  message: string;
  createdAt: number;
}
export interface Snapshot {
  conversation: Conversation;
  messages: Message[];
  plans: ResearchPlan[];
  clarifications: ResearchClarification[];
  runs: Run[];
  events: RunEvent[];
}
export type LiveEvent = { type: "refresh" } | { type: "delta"; runId: string; text: string };
export const activeStatuses: RunStatus[] = ["queued", "running", "uncertain"];

export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
