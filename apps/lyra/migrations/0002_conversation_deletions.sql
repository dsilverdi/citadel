-- Keep report cleanup durable after the conversation and its child rows are removed.
CREATE TABLE conversation_deletions (
  conversation_id TEXT PRIMARY KEY NOT NULL,
  created_at INTEGER NOT NULL
);
