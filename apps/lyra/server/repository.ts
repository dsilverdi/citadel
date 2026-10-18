import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { estimateCost, type ModelSettings, type Price } from "@citadel/ai/models";
import {
  AppError,
  type Conversation,
  type Message,
  type ResearchPlan,
  type ResearchClarification,
  type Run,
  type Snapshot,
  type Source,
  type RunStatus,
} from "./contracts";
import * as schema from "./schema";
import type { Env } from "./env";

export function database(env: Env) {
  return drizzle(env.DB, { schema });
}
export type RunRow = typeof schema.runs.$inferSelect;

export async function ownedConversation(env: Env, id: string, owner: string) {
  const row = await database(env)
    .select()
    .from(schema.conversations)
    .where(and(eq(schema.conversations.id, id), eq(schema.conversations.owner, owner)))
    .get();
  if (!row) throw new AppError(404, "Conversation not found");
  return row;
}
export function conversationView(row: typeof schema.conversations.$inferSelect): Conversation {
  return {
    id: row.id,
    title: row.title,
    settings: JSON.parse(row.settings) as ModelSettings,
    updatedAt: row.updatedAt,
  };
}
export function runView(env: Env, row: RunRow): Run {
  const settings = JSON.parse(row.settings) as ModelSettings;
  const usage = {
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    toolCalls: row.toolCalls,
  };
  let price: Price | undefined;
  try {
    price = (JSON.parse(env.MODEL_PRICING_JSON || "{}") as Record<string, Price>)[settings.model];
  } catch {
    /* Estimates remain unavailable until valid pricing is configured. */
  }
  return {
    id: row.id,
    conversationId: row.conversationId,
    mode: row.mode as Run["mode"],
    status: row.status as RunStatus,
    settings,
    usage,
    estimatedCost: estimateCost(usage, price),
    reportReady: !!row.reportKey,
    error: row.error,
    createdAt: row.createdAt,
  };
}
export async function snapshot(env: Env, id: string, owner: string): Promise<Snapshot> {
  const conversation = await ownedConversation(env, id, owner);
  const db = database(env);
  const [messageRows, planRows, runRows, eventRows, clarificationRows] = await Promise.all([
    db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.conversationId, id))
      .orderBy(schema.messages.createdAt, schema.messages.id)
      .all(),
    db
      .select()
      .from(schema.plans)
      .where(eq(schema.plans.conversationId, id))
      .orderBy(schema.plans.createdAt)
      .all(),
    db
      .select()
      .from(schema.runs)
      .where(eq(schema.runs.conversationId, id))
      .orderBy(schema.runs.createdAt)
      .all(),
    db
      .select()
      .from(schema.events)
      .where(eq(schema.events.conversationId, id))
      .orderBy(desc(schema.events.id))
      .limit(80)
      .all(),
    db
      .select()
      .from(schema.clarifications)
      .where(eq(schema.clarifications.conversationId, id))
      .orderBy(schema.clarifications.createdAt)
      .all(),
  ]);
  return {
    conversation: conversationView(conversation),
    messages: messageRows.map((row): Message => ({
      ...row,
      role: row.role as Message["role"],
      sources: JSON.parse(row.sources) as Source[],
    })),
    plans: planRows.map((row): ResearchPlan => ({
      ...row,
      questions: JSON.parse(row.questions) as string[],
      status: row.status as ResearchPlan["status"],
    })),
    clarifications: clarificationRows.map((row): ResearchClarification => ({
      id: row.id,
      conversationId: row.conversationId,
      summary: row.summary,
      questions: JSON.parse(row.questions) as ResearchClarification["questions"],
      status: row.status as ResearchClarification["status"],
    })),
    runs: runRows.map((row) => runView(env, row)),
    events: eventRows.reverse(),
  };
}
export async function getRun(env: Env, id: string): Promise<RunRow> {
  const row = await database(env).select().from(schema.runs).where(eq(schema.runs.id, id)).get();
  if (!row) throw new AppError(404, "Run not found");
  return row;
}
