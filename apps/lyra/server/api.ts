import { and, desc, eq, inArray } from "drizzle-orm";
import { models, settingsSchema, defaultSettings } from "@citadel/ai/models";
import type { Identity } from "@citadel/auth";
import {
  AppError,
  activeStatuses,
  approvalSchema,
  idSchema,
  submissionSchema,
  clarificationAnswersSchema,
  researchScopeInput,
  type ScopeQuestion,
} from "./contracts";
import {
  database,
  getRun,
  ownedConversation,
  snapshot,
  conversationView,
  runView,
} from "./repository";
import { conversations, plans, runs, clarifications } from "./schema";
import { notify, progress, retainPartialResearch } from "./research";
import { cancelProviderResponses } from "./provider";
import type { Env } from "./env";
import { deleteConversation, cleanDeletedConversationReports } from "./delete-conversation";

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "cache-control": "no-store" } });
}
async function readBody(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new AppError(415, "Expected JSON");
  if (Number(request.headers.get("content-length") || 0) > 40_000)
    throw new AppError(413, "Request too large");
  const reader = request.body?.getReader();
  if (!reader) throw new AppError(400, "Missing request body");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 40_000) {
        await reader.cancel();
        throw new AppError(413, "Request too large");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    try {
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new AppError(400, "Invalid JSON");
    }
  } finally {
    reader.releaseLock();
  }
}
export async function dispatchRun(env: Env, runId: string) {
  try {
    await env.RESEARCH.create({ id: runId, params: { runId } });
  } catch (error) {
    // Workflow IDs are stable. A duplicate delivery must not launch a second job.
    try {
      const existing = await env.RESEARCH.get(runId);
      await existing.status();
    } catch {
      throw error;
    }
  }
}
export async function listConversations(env: Env, owner: string) {
  const rows = await database(env)
    .select()
    .from(conversations)
    .where(eq(conversations.owner, owner))
    .orderBy(desc(conversations.updatedAt))
    .all();
  return rows.map(conversationView);
}

export async function api(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  identity: Identity,
): Promise<Response> {
  const path = new URL(request.url).pathname.split("/").filter(Boolean);
  const db = database(env);
  if (path[1] === "models" && request.method === "GET") return json(models);
  if (path[1] !== "conversations") throw new AppError(404, "Not found");
  if (path.length === 2) {
    if (request.method === "GET") return json(await listConversations(env, identity.subject));
    if (request.method === "POST") {
      const settings = settingsSchema.parse(defaultSettings);
      const id = crypto.randomUUID();
      const now = Date.now();
      await db.insert(conversations).values({
        id,
        owner: identity.subject,
        title: "New conversation",
        settings: JSON.stringify(settings),
        createdAt: now,
        updatedAt: now,
      });
      return json({ id }, 201);
    }
    throw new AppError(405, "Method not allowed");
  }
  const conversationId = idSchema.parse(path[2]);
  await ownedConversation(env, conversationId, identity.subject);
  if (path.length === 3 && request.method === "GET")
    return json(await snapshot(env, conversationId, identity.subject));
  if (path.length === 3 && request.method === "DELETE") {
    await deleteConversation(env, conversationId, identity.subject);
    ctx.waitUntil(cleanDeletedConversationReports(env));
    return json({ deleted: true });
  }
  if (
    path[3] === "clarifications" &&
    path[4] &&
    path[5] === "answer" &&
    path.length === 6 &&
    request.method === "POST"
  ) {
    const clarificationId = idSchema.parse(path[4]);
    const body = clarificationAnswersSchema.parse(await readBody(request));
    const clarification = await db
      .select()
      .from(clarifications)
      .where(
        and(
          eq(clarifications.id, clarificationId),
          eq(clarifications.conversationId, conversationId),
        ),
      )
      .get();
    if (!clarification) throw new AppError(404, "Scope questions not found");
    const content = researchScopeInput(
      JSON.parse(clarification.questions) as ScopeQuestion[],
      body.answers,
    );
    const prior = await db.select().from(runs).where(eq(runs.id, body.id)).get();
    if (prior) {
      if (
        clarification.answerRunId !== body.id ||
        prior.input !== content ||
        prior.conversationId !== conversationId
      )
        throw new AppError(409, "Submission ID already used");
      if (prior.status === "queued") ctx.waitUntil(dispatchRun(env, prior.id));
      return json(runView(env, prior));
    }
    if (clarification.status !== "pending")
      throw new AppError(409, "These questions have been answered or replaced. Refresh the chat.");
    const planner = await getRun(env, clarification.runId);
    const now = Date.now();
    try {
      await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO runs (id, conversation_id, mode, status, settings, input, created_at, deadline) SELECT ?, conversation_id, 'plan', 'queued', ?, ?, ?, ? FROM research_clarifications WHERE id = ? AND conversation_id = ? AND status = 'pending'",
        ).bind(
          body.id,
          planner.settings,
          content,
          now,
          now + 30 * 60_000,
          clarificationId,
          conversationId,
        ),
        env.DB.prepare(
          "UPDATE research_clarifications SET status = 'answered', answers = ?, answer_run_id = ? WHERE id = ? AND EXISTS (SELECT 1 FROM runs WHERE id = ?)",
        ).bind(JSON.stringify(body.answers), body.id, clarificationId, body.id),
        env.DB.prepare(
          "INSERT INTO messages (id, conversation_id, run_id, role, content, created_at) SELECT ?, conversation_id, id, 'user', input, ? FROM runs WHERE id = ?",
        ).bind(`${body.id}-user`, now, body.id),
        env.DB.prepare(
          "UPDATE conversations SET updated_at = ? WHERE id = ? AND EXISTS (SELECT 1 FROM runs WHERE id = ?)",
        ).bind(now, conversationId, body.id),
      ]);
    } catch {
      const saved = await db
        .select()
        .from(clarifications)
        .where(eq(clarifications.id, clarificationId))
        .get();
      const repeated = await db.select().from(runs).where(eq(runs.id, body.id)).get();
      if (saved?.answerRunId === body.id && repeated?.input === content)
        return json(runView(env, repeated));
      throw new AppError(
        409,
        "A request is active or these questions changed. Refresh before continuing.",
      );
    }
    const created = await db.select().from(runs).where(eq(runs.id, body.id)).get();
    if (!created) throw new AppError(409, "These questions have been replaced. Refresh the chat.");
    ctx.waitUntil(dispatchRun(env, created.id).catch(() => undefined));
    await notify(env, conversationId);
    return json(runView(env, created), 202);
  }
  if (path[3] === "messages" && path.length === 4 && request.method === "POST") {
    const body = submissionSchema.parse(await readBody(request));
    const existing = await db.select().from(runs).where(eq(runs.id, body.id)).get();
    if (existing) {
      if (
        existing.conversationId !== conversationId ||
        existing.input !== body.content ||
        existing.settings !== JSON.stringify(body.settings) ||
        existing.mode !== (body.mode === "research" ? "plan" : "chat")
      )
        throw new AppError(409, "Submission ID already used");
      if (existing.status === "queued") ctx.waitUntil(dispatchRun(env, existing.id));
      return json(runView(env, existing));
    }
    const now = Date.now();
    try {
      await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO runs (id, conversation_id, mode, status, settings, input, created_at, deadline) VALUES (?, ?, ?, 'queued', ?, ?, ?, ?)",
        ).bind(
          body.id,
          conversationId,
          body.mode === "research" ? "plan" : "chat",
          JSON.stringify(body.settings),
          body.content,
          now,
          now + 30 * 60_000,
        ),
        env.DB.prepare(
          "UPDATE conversations SET title = CASE WHEN NOT EXISTS (SELECT 1 FROM messages WHERE conversation_id = ? AND role = 'user') THEN ? ELSE title END, settings = ?, updated_at = ? WHERE id = ?",
        ).bind(
          conversationId,
          body.content.slice(0, 70),
          JSON.stringify(body.settings),
          now,
          conversationId,
        ),
        env.DB.prepare(
          "UPDATE plans SET status = 'superseded' WHERE conversation_id = ? AND status = 'pending'",
        ).bind(conversationId),
        env.DB.prepare(
          "UPDATE research_clarifications SET status = 'superseded' WHERE conversation_id = ? AND status = 'pending'",
        ).bind(conversationId),
        env.DB.prepare(
          "INSERT INTO messages (id, conversation_id, run_id, role, content, created_at) VALUES (?, ?, ?, 'user', ?, ?)",
        ).bind(`${body.id}-user`, conversationId, body.id, body.content, now),
      ]);
    } catch (error) {
      const active = await db
        .select()
        .from(runs)
        .where(and(eq(runs.conversationId, conversationId), inArray(runs.status, activeStatuses)))
        .get();
      if (active)
        throw new AppError(409, "A run is already active. Stop it before sending another message.");
      throw error;
    }
    ctx.waitUntil(dispatchRun(env, body.id).catch(() => undefined));
    await notify(env, conversationId);
    return json(runView(env, await getRun(env, body.id)), 202);
  }
  if (
    path[3] === "plans" &&
    path[4] &&
    path[5] === "approve" &&
    path.length === 6 &&
    request.method === "POST"
  ) {
    const planId = idSchema.parse(path[4]);
    const { id } = approvalSchema.parse(await readBody(request));
    const plan = await db
      .select()
      .from(plans)
      .where(and(eq(plans.id, planId), eq(plans.conversationId, conversationId)))
      .get();
    if (!plan) throw new AppError(404, "Plan not found");
    const prior = await db.select().from(runs).where(eq(runs.planId, planId)).get();
    if (prior) {
      if (prior.status === "queued") ctx.waitUntil(dispatchRun(env, prior.id));
      return json(runView(env, prior));
    }
    if (plan.status !== "pending")
      throw new AppError(409, "This plan has been replaced. Review the latest plan.");
    const planningRun = await getRun(env, plan.runId);
    const now = Date.now();
    try {
      await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO runs (id, conversation_id, mode, status, settings, input, plan_id, created_at, deadline) SELECT ?, conversation_id, 'research', 'queued', ?, ?, id, ?, ? FROM plans WHERE id = ? AND conversation_id = ? AND status = 'pending'",
        ).bind(
          id,
          planningRun.settings,
          planningRun.input,
          now,
          now + 30 * 60_000,
          planId,
          conversationId,
        ),
        env.DB.prepare(
          "UPDATE plans SET status = 'approved' WHERE id = ? AND EXISTS (SELECT 1 FROM runs WHERE id = ? AND plan_id = ?)",
        ).bind(planId, id, planId),
      ]);
    } catch (error) {
      const duplicate = await db.select().from(runs).where(eq(runs.planId, planId)).get();
      if (duplicate) return json(runView(env, duplicate));
      const active = await db
        .select()
        .from(runs)
        .where(and(eq(runs.conversationId, conversationId), inArray(runs.status, activeStatuses)))
        .get();
      if (active) throw new AppError(409, "A run is already active in this conversation.");
      throw error;
    }
    const created = await db.select().from(runs).where(eq(runs.id, id)).get();
    if (!created)
      throw new AppError(
        409,
        "The plan changed before approval. Refresh and review the latest plan.",
      );
    ctx.waitUntil(dispatchRun(env, id).catch(() => undefined));
    await notify(env, conversationId);
    return json(runView(env, created), 202);
  }
  if (path[3] === "runs" && path[4]) {
    const run = await getRun(env, idSchema.parse(path[4]));
    if (run.conversationId !== conversationId) throw new AppError(404, "Run not found");
    if (path[5] === "cancel" && path.length === 6 && request.method === "POST") {
      if (activeStatuses.includes(run.status as (typeof activeStatuses)[number])) {
        await db
          .update(runs)
          .set({ status: "cancelled", error: "Stopped. Partial findings are saved." })
          .where(and(eq(runs.id, run.id), inArray(runs.status, activeStatuses)));
        ctx.waitUntil(
          (async () => {
            try {
              await cancelProviderResponses(env, run.id);
            } catch {
              /* Scheduled reconciliation retries. */
            }
            await retainPartialResearch(env, run);
          })(),
        );
        await progress(env, run, "cancelled", "Stopped. Partial findings are saved.");
      }
      return json(runView(env, await getRun(env, run.id)));
    }
    if (path[5] === "report" && path.length === 6 && request.method === "GET") {
      const object = run.reportKey ? await env.REPORTS.get(run.reportKey) : null;
      if (!object) throw new AppError(404, "Report not ready");
      return new Response(object.body, {
        headers: {
          "content-type": "text/markdown; charset=utf-8",
          "content-disposition": `attachment; filename="lyra-${run.id}.md"`,
          "cache-control": "private, no-store",
          "x-content-type-options": "nosniff",
        },
      });
    }
  }
  throw new AppError(404, "Not found");
}
