CREATE TABLE IF NOT EXISTS user_profiles (
  openid TEXT PRIMARY KEY,
  profile TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE community_feedback ADD COLUMN openid TEXT;
CREATE INDEX IF NOT EXISTS community_feedback_openid_idx ON community_feedback (bar_id, openid);
