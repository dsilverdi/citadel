PRAGMA foreign_keys = ON;

CREATE TABLE conversations (
  id TEXT PRIMARY KEY NOT NULL,
  owner TEXT NOT NULL,
  title TEXT NOT NULL,
  settings TEXT NOT NULL CHECK(json_valid(settings)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX conversations_owner_updated ON conversations(owner, updated_at DESC);

CREATE TABLE runs (
  id TEXT PRIMARY KEY NOT NULL,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK(mode IN ('chat', 'plan', 'research')),
  status TEXT NOT NULL CHECK(status IN ('queued', 'running', 'completed', 'failed', 'cancelled', 'limited', 'uncertain')),
  settings TEXT NOT NULL CHECK(json_valid(settings)),
  input TEXT NOT NULL,
  plan_id TEXT,
  report_key TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  tool_calls INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at INTEGER NOT NULL,
  deadline INTEGER NOT NULL
);
CREATE UNIQUE INDEX one_active_run_per_conversation ON runs(conversation_id) WHERE status IN ('queued', 'running', 'uncertain');
CREATE UNIQUE INDEX one_run_per_approved_plan ON runs(plan_id) WHERE plan_id IS NOT NULL;
CREATE INDEX runs_dispatch ON runs(status, created_at);

CREATE TABLE messages (
  id TEXT PRIMARY KEY NOT NULL,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  run_id TEXT REFERENCES runs(id),
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  sources TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(sources)),
  created_at INTEGER NOT NULL
);
CREATE INDEX messages_conversation ON messages(conversation_id, created_at, id);

CREATE TABLE plans (
  id TEXT PRIMARY KEY NOT NULL,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL REFERENCES runs(id),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  questions TEXT NOT NULL CHECK(json_valid(questions)),
  status TEXT NOT NULL CHECK(status IN ('pending', 'approved', 'superseded')),
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX one_pending_plan ON plans(conversation_id) WHERE status = 'pending';

CREATE TABLE run_steps (
  id TEXT PRIMARY KEY NOT NULL,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK(status IN ('creating', 'active', 'completed')),
  response_id TEXT,
  result TEXT CHECK(result IS NULL OR json_valid(result)),
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  tool_calls INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX steps_run ON run_steps(run_id);

CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL REFERENCES runs(id),
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX events_conversation ON events(conversation_id, id);
