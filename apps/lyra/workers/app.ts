import { createRequestHandler } from "react-router";
import { routeAgentRequest } from "agents";
import { authenticate, assertSameOrigin } from "@citadel/auth";
import { ZodError } from "zod";
import { and, eq, inArray, lt } from "drizzle-orm";
import { api, dispatchRun, json } from "../server/api";
import { AppError, idSchema } from "../server/contracts";
import type { Env } from "../server/env";
import { database, ownedConversation } from "../server/repository";
import { cancelProviderResponses } from "../server/provider";
import { progress, retainPartialResearch } from "../server/research";
import { getRun } from "../server/repository";
import { runs } from "../server/schema";

export { ConversationAgent } from "./conversation-agent";
export { ResearchWorkflow } from "./research-workflow";

const handler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);
export default {
  async fetch(request, env, ctx) {
    try {
      const identity = await authenticate(request, env);
      const url = new URL(request.url);
      assertSameOrigin(request);
      if (url.pathname.startsWith("/agents/")) {
        const match = /^\/agents\/conversation-agent\/([a-f0-9-]+)$/.exec(url.pathname);
        if (!match) throw new AppError(404, "Not found");
        await ownedConversation(env, idSchema.parse(match[1]), identity.subject);
        if (
          request.headers.get("upgrade")?.toLowerCase() !== "websocket" ||
          request.headers.get("origin") !== url.origin
        )
          throw new AppError(403, "Invalid connection origin");
        return (
          (await routeAgentRequest(request, env)) || new Response("Not found", { status: 404 })
        );
      }
      const response = url.pathname.startsWith("/api/")
        ? await api(request, env, ctx, identity)
        : url.pathname !== "/"
          ? await env.ASSETS.fetch(request).then((asset) => new Response(asset.body, asset))
          : await handler(request, { cloudflare: { env, ctx } });
      response.headers.set("x-content-type-options", "nosniff");
      response.headers.set("referrer-policy", "strict-origin-when-cross-origin");
      response.headers.set("x-frame-options", "DENY");
      response.headers.set("cache-control", "private, no-store");
      if (url.pathname === "/sw.js") {
        response.headers.set("content-type", "application/javascript; charset=utf-8");
        response.headers.set("service-worker-allowed", "/");
      }
      if (url.pathname === "/site.webmanifest") {
        response.headers.set("content-type", "application/manifest+json; charset=utf-8");
      }
      return response;
    } catch (error) {
      if (error instanceof Response) return error;
      if (error instanceof ZodError)
        return json({ error: error.issues.map((issue) => issue.message).join(". ") }, 400);
      if (error instanceof AppError) return json({ error: error.message }, error.status);
      // Do not log prompts, response bodies, secrets, or raw provider exceptions.
      console.error("Lyra request failed", {
        name: error instanceof Error ? error.name : "UnknownError",
      });
      return json({ error: "The request could not be completed. Try again." }, 500);
    }
  },
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(
      (async () => {
        const db = database(env);
        const queued = await db
          .select()
          .from(runs)
          .where(and(eq(runs.status, "queued"), lt(runs.createdAt, Date.now() - 30_000)))
          .limit(100)
          .all();
        for (const run of queued) {
          if (run.deadline > Date.now()) {
            try {
              await dispatchRun(env, run.id);
            } catch {
              /* Next cron retries dispatch. */
            }
          }
        }
        const expired = await db
          .select()
          .from(runs)
          .where(and(inArray(runs.status, ["queued", "running"]), lt(runs.deadline, Date.now())))
          .limit(100)
          .all();
        for (const run of expired) {
          await db
            .update(runs)
            .set({
              status: "limited",
              error: "The run reached its time limit. Partial findings are saved.",
            })
            .where(and(eq(runs.id, run.id), inArray(runs.status, ["queued", "running"])));
          await progress(env, run, "limited", "Time limit reached. Partial findings are saved.");
          await retainPartialResearch(env, run);
        }
        const stopped = await env.DB.prepare(
          "SELECT DISTINCT runs.id FROM runs JOIN run_steps ON run_steps.run_id = runs.id WHERE runs.status IN ('cancelled', 'limited', 'failed', 'uncertain') AND run_steps.status = 'active' LIMIT 100",
        ).all<{ id: string }>();
        for (const row of stopped.results) {
          try {
            await cancelProviderResponses(env, row.id);
            await retainPartialResearch(env, await getRun(env, row.id));
          } catch {
            /* Next cron reconciles provider cancellation. */
          }
        }
      })(),
    );
  },
} satisfies ExportedHandler<Env>;
