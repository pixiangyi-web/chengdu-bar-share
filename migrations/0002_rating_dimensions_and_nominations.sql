ALTER TABLE community_feedback ADD COLUMN classic_score INTEGER CHECK (classic_score BETWEEN 1 AND 5);
ALTER TABLE community_feedback ADD COLUMN special_score INTEGER CHECK (special_score BETWEEN 1 AND 5);
ALTER TABLE community_feedback ADD COLUMN environment_score INTEGER CHECK (environment_score BETWEEN 1 AND 5);

CREATE TABLE IF NOT EXISTS bar_nominations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bar_name TEXT NOT NULL,
  area TEXT NOT NULL,
  bar_type TEXT,
  source_url TEXT,
  reason TEXT NOT NULL,
  device_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'accepted', 'rejected')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (bar_name, device_hash)
);

CREATE INDEX IF NOT EXISTS bar_nominations_status_idx
  ON bar_nominations (status, created_at);
