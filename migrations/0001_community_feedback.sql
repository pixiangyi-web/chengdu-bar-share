CREATE TABLE IF NOT EXISTS community_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bar_id TEXT NOT NULL,
  device_hash TEXT NOT NULL,
  drink_score INTEGER CHECK (drink_score BETWEEN 1 AND 5),
  atmosphere_score INTEGER CHECK (atmosphere_score BETWEEN 1 AND 5),
  service_score INTEGER CHECK (service_score BETWEEN 1 AND 5),
  value_score INTEGER CHECK (value_score BETWEEN 1 AND 5),
  rank_opinion TEXT CHECK (rank_opinion IN ('high', 'fair', 'low')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (bar_id, device_hash)
);

CREATE INDEX IF NOT EXISTS community_feedback_bar_id_idx
  ON community_feedback (bar_id);
