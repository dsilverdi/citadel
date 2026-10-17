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
export const planOutputSchema = z
  .object({
    kind: z.enum(["plan", "clarification"]),
    title: z.string().min(1).max(160),
    summary: z.string().min(1).max(2_000),
    questions: z.array(z.string().min(1).max(500)).max(6),
    clarifyingQuestions: z.array(z.string().min(1).max(500)).max(3),
  })
  .refine((value) =>
    value.kind === "plan"
      ? value.questions.length > 0 && value.clarifyingQuestions.length === 0
      : value.clarifyingQuestions.length > 0,
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
