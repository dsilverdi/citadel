import { AppError } from "./contracts";
import type { Env } from "./env";

// Checked inside the same transaction as deletion, so a concurrent send either
// creates an active run first (blocking deletion) or loses its parent FK.
const deletableConversation = `id = ? AND owner = ?
  AND NOT EXISTS (
    SELECT 1 FROM runs WHERE conversation_id = conversations.id
      AND status IN ('queued', 'running', 'uncertain')
  )
  AND NOT EXISTS (
    SELECT 1 FROM run_steps JOIN runs ON runs.id = run_steps.run_id
    WHERE runs.conversation_id = conversations.id AND run_steps.status IN ('creating', 'active')
  )`;

export async function deleteConversation(env: Env, id: string, owner: string) {
  const result = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO conversation_deletions (conversation_id, created_at)
       SELECT id, ? FROM conversations WHERE ${deletableConversation}
       ON CONFLICT(conversation_id) DO NOTHING`,
    ).bind(Date.now(), id, owner),
    env.DB.prepare(`DELETE FROM conversations WHERE ${deletableConversation}`).bind(id, owner),
  ]);
  if (!result[1]?.meta.changes)
    throw new AppError(
      409,
      "A request is active or still awaiting provider confirmation. Stop generation and wait for it to settle before deleting this chat.",
    );
}

export async function cleanDeletedConversationReports(env: Env) {
  const pending = await env.DB.prepare(
    "SELECT conversation_id FROM conversation_deletions ORDER BY created_at LIMIT 25",
  ).all<{ conversation_id: string }>();
  for (const { conversation_id: id } of pending.results) {
    try {
      let cursor: string | undefined;
      do {
        const page = await env.REPORTS.list({ prefix: `reports/${id}/`, cursor, limit: 1000 });
        if (page.objects.length) await env.REPORTS.delete(page.objects.map((object) => object.key));
        cursor = page.truncated ? page.cursor : undefined;
      } while (cursor);
      await env.DB.prepare("DELETE FROM conversation_deletions WHERE conversation_id = ?")
        .bind(id)
        .run();
    } catch {
      // Keep the job for the five-minute cron. The deleted chat is already inaccessible.
    }
  }
}
