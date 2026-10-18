import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  owner: text("owner").notNull(),
  title: text("title").notNull(),
  settings: text("settings").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
export const conversationDeletions = sqliteTable("conversation_deletions", {
  conversationId: text("conversation_id").primaryKey(),
  createdAt: integer("created_at").notNull(),
});
export const runs = sqliteTable("runs", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  mode: text("mode").notNull(),
  status: text("status").notNull(),
  settings: text("settings").notNull(),
  input: text("input").notNull(),
  planId: text("plan_id"),
  reportKey: text("report_key"),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  toolCalls: integer("tool_calls").notNull().default(0),
  error: text("error"),
  createdAt: integer("created_at").notNull(),
  deadline: integer("deadline").notNull(),
});
export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  runId: text("run_id").references(() => runs.id),
  role: text("role").notNull(),
  content: text("content").notNull(),
  sources: text("sources").notNull().default("[]"),
  createdAt: integer("created_at").notNull(),
});
export const plans = sqliteTable("plans", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  runId: text("run_id")
    .notNull()
    .references(() => runs.id),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  questions: text("questions").notNull(),
  status: text("status").notNull(),
  createdAt: integer("created_at").notNull(),
});
export const clarifications = sqliteTable("research_clarifications", {
  answerRunId: text("answer_run_id").references(() => runs.id),
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  runId: text("run_id")
    .notNull()
    .references(() => runs.id),
  summary: text("summary").notNull(),
  questions: text("questions").notNull(),
  answers: text("answers"),
  status: text("status").notNull(),
  createdAt: integer("created_at").notNull(),
});
export const steps = sqliteTable("run_steps", {
  id: text("id").primaryKey(),
  runId: text("run_id")
    .notNull()
    .references(() => runs.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  responseId: text("response_id"),
  result: text("result"),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  toolCalls: integer("tool_calls").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});
export const events = sqliteTable("events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  runId: text("run_id")
    .notNull()
    .references(() => runs.id),
  kind: text("kind").notNull(),
  message: text("message").notNull(),
  createdAt: integer("created_at").notNull(),
});
