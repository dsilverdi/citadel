import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteConversation, cleanDeletedConversationReports } from "../server/delete-conversation";
import type { Env } from "../server/env";

describe("conversation deletion", () => {
  let sqlite: DatabaseSync;
  let env: Env;
  const list = vi.fn();
  const remove = vi.fn();

  beforeEach(() => {
    sqlite = new DatabaseSync(":memory:");
    for (const name of [
      "0001_initial.sql",
      "0002_conversation_deletions.sql",
      "0003_research_clarifications.sql",
    ])
      sqlite.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
    sqlite.exec(`
      INSERT INTO conversations VALUES ('c', 'owner', 'Title', '{}', 0, 0);
      INSERT INTO runs (id, conversation_id, mode, status, settings, input, created_at, deadline)
        VALUES ('r', 'c', 'plan', 'completed', '{}', 'Question', 0, 100);
      INSERT INTO messages VALUES ('m', 'c', 'r', 'assistant', 'Answer', '[]', 0);
      INSERT INTO plans VALUES ('p', 'c', 'r', 'Title', 'Summary', '["Question"]', 'pending', 0);
      INSERT INTO research_clarifications (id, conversation_id, run_id, summary, questions, status, created_at) VALUES ('cl', 'c', 'r', 'Scope', '[]', 'pending', 0);
      INSERT INTO run_steps (id, run_id, status, created_at) VALUES ('s', 'r', 'completed', 0);
      INSERT INTO events (conversation_id, run_id, kind, message, created_at) VALUES ('c', 'r', 'completed', 'Done', 0);
    `);
    function prepare(sql: string) {
      let values: Array<string | number | null> = [];
      return {
        bind(...bound: typeof values) {
          values = bound;
          return this;
        },
        async run() {
          return { meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } };
        },
        async all() {
          return { results: sqlite.prepare(sql).all(...values) };
        },
      };
    }
    const DB = {
      prepare,
      async batch(statements: Array<ReturnType<typeof prepare>>) {
        sqlite.exec("BEGIN");
        try {
          const results = [];
          for (const stmt of statements) results.push(await stmt.run());
          sqlite.exec("COMMIT");
          return results;
        } catch (error) {
          sqlite.exec("ROLLBACK");
          throw error;
        }
      },
    };
    list.mockReset().mockResolvedValue({ objects: [{ key: "reports/c/r.md" }], truncated: false });
    remove.mockReset().mockResolvedValue(undefined);
    env = { DB, REPORTS: { list, delete: remove } } as unknown as Env;
  });
  afterEach(() => sqlite.close());
  const count = (db: DatabaseSync, table: string) =>
    db.prepare(`SELECT count(*) AS n FROM ${table}`).get()!.n;

  it("removes every child record and durably queues report deletion", async () => {
    await deleteConversation(env, "c", "owner");
    for (const table of [
      "conversations",
      "runs",
      "messages",
      "plans",
      "run_steps",
      "events",
      "research_clarifications",
    ])
      expect(count(sqlite, table)).toBe(0);
    expect(count(sqlite, "conversation_deletions")).toBe(1);
    await cleanDeletedConversationReports(env);
    expect(list).toHaveBeenCalledWith({ prefix: "reports/c/", cursor: undefined, limit: 1000 });
    expect(remove).toHaveBeenCalledWith(["reports/c/r.md"]);
    expect(count(sqlite, "conversation_deletions")).toBe(0);
  });

  it("cannot delete or queue cleanup for a different owner", async () => {
    await expect(deleteConversation(env, "c", "someone-else")).rejects.toMatchObject({
      status: 409,
    });
    expect(count(sqlite, "conversations")).toBe(1);
    expect(count(sqlite, "conversation_deletions")).toBe(0);
  });

  it.each(["queued", "running", "uncertain"])(
    "blocks a %s run, even if it starts immediately before deletion",
    async (status) => {
      sqlite.prepare("UPDATE runs SET status = ?").run(status);
      await expect(deleteConversation(env, "c", "owner")).rejects.toMatchObject({ status: 409 });
      expect(count(sqlite, "conversations")).toBe(1);
      expect(count(sqlite, "conversation_deletions")).toBe(0);
    },
  );

  it.each(["creating", "active"])(
    "blocks a cancelled run with a %s provider step",
    async (status) => {
      sqlite.exec("UPDATE runs SET status = 'cancelled';");
      sqlite.prepare("UPDATE run_steps SET status = ?").run(status);
      await expect(deleteConversation(env, "c", "owner")).rejects.toMatchObject({ status: 409 });
      sqlite.exec("UPDATE run_steps SET status = 'completed';");
      await expect(deleteConversation(env, "c", "owner")).resolves.toBeUndefined();
    },
  );

  it("retries private report cleanup after an R2 failure", async () => {
    await deleteConversation(env, "c", "owner");
    remove.mockRejectedValueOnce(new Error("Temporary storage failure"));
    await cleanDeletedConversationReports(env);
    expect(count(sqlite, "conversation_deletions")).toBe(1);
    await cleanDeletedConversationReports(env);
    expect(count(sqlite, "conversation_deletions")).toBe(0);
  });

  it("cleans all report pages before completing the job", async () => {
    await deleteConversation(env, "c", "owner");
    list
      .mockResolvedValueOnce({
        objects: [{ key: "reports/c/one.md" }],
        truncated: true,
        cursor: "next",
      })
      .mockResolvedValueOnce({ objects: [{ key: "reports/c/two.md" }], truncated: false });
    await cleanDeletedConversationReports(env);
    expect(list).toHaveBeenLastCalledWith({ prefix: "reports/c/", cursor: "next", limit: 1000 });
    expect(remove.mock.calls).toEqual([[["reports/c/one.md"]], [["reports/c/two.md"]]]);
    expect(count(sqlite, "conversation_deletions")).toBe(0);
  });
});
