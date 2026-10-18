CREATE TABLE research_clarifications (
  id TEXT PRIMARY KEY NOT NULL,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL REFERENCES runs(id),
  answer_run_id TEXT REFERENCES runs(id),
  summary TEXT NOT NULL,
  questions TEXT NOT NULL CHECK(json_valid(questions)),
  answers TEXT CHECK(answers IS NULL OR json_valid(answers)),
  status TEXT NOT NULL CHECK(status IN ('pending', 'answered', 'superseded')),
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX one_pending_clarification ON research_clarifications(conversation_id) WHERE status = 'pending';
