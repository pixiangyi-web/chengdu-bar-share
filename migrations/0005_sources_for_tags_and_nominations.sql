ALTER TABLE bar_tag_suggestions ADD COLUMN source TEXT NOT NULL DEFAULT 'web' CHECK (source IN ('web', 'mini_program'));
ALTER TABLE bar_nominations ADD COLUMN source TEXT NOT NULL DEFAULT 'web' CHECK (source IN ('web', 'mini_program'));
