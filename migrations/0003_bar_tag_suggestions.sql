CREATE TABLE IF NOT EXISTS bar_tag_suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bar_name TEXT NOT NULL,
  suggested_tags TEXT NOT NULL,
  note TEXT NOT NULL,
  device_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TEXT,
  UNIQUE (bar_name, device_hash)
);

CREATE INDEX IF NOT EXISTS bar_tag_suggestions_status_idx
  ON bar_tag_suggestions (status, created_at);
