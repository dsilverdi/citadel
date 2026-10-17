import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("D1 migration invariants", () => {
  let db: DatabaseSync;
  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    db.exec(readFileSync(new URL("../migrations/0001_initial.sql", import.meta.url), "utf8"));
    db.prepare("INSERT INTO conversations VALUES (?, ?, ?, ?, ?, ?)").run(
      "c",
      "owner",
      "Title",
      "{}",
      0,
      0,
    );
  });
  afterEach(() => db.close());
  const insert =
    "INSERT INTO runs (id, conversation_id, mode, status, settings, input, plan_id, created_at, deadline) VALUES (?, 'c', 'research', ?, '{}', 'question', ?, 0, 100)";
  it("serializes active runs, including uncertain provider submissions", () => {
    db.prepare(insert).run("r1", "uncertain", null);
    expect(() => db.prepare(insert).run("r2", "queued", null)).toThrow();
    db.exec("UPDATE runs SET status = 'cancelled' WHERE id = 'r1'");
    expect(() => db.prepare(insert).run("r2", "queued", null)).not.toThrow();
  });
  it("never executes an approved plan twice, including after completion", () => {
    db.prepare(insert).run("r1", "completed", "p1");
    expect(() => db.prepare(insert).run("r2", "queued", "p1")).toThrow();
  });
  it("only allows a single pending version of a plan", () => {
    db.prepare(insert).run("r1", "completed", null);
    const plan =
      "INSERT INTO plans VALUES (?, 'c', 'r1', 'Title', 'Summary', '[\"Question\"]', 'pending', 0)";
    db.prepare(plan).run("p1");
    expect(() => db.prepare(plan).run("p2")).toThrow();
    db.exec("UPDATE plans SET status = 'superseded'");
    expect(() => db.prepare(plan).run("p2")).not.toThrow();
  });
  it("does not approve a stale plan in the atomic approval statement", () => {
    db.prepare(insert).run("planner", "completed", null);
    db.exec(
      "INSERT INTO plans VALUES ('p1', 'c', 'planner', 'Title', 'Summary', '[\"Question\"]', 'superseded', 0)",
    );
    db.exec(
      "INSERT INTO runs (id, conversation_id, mode, status, settings, input, plan_id, created_at, deadline) SELECT 'research', conversation_id, 'research', 'queued', '{}', 'question', id, 0, 100 FROM plans WHERE id = 'p1' AND status = 'pending'",
    );
    expect(db.prepare("SELECT id FROM runs WHERE id = 'research'").get()).toBeUndefined();
  });
});
