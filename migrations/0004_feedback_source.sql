ALTER TABLE community_feedback ADD COLUMN source TEXT NOT NULL DEFAULT 'web' CHECK (source IN ('web', 'mini_program'));
