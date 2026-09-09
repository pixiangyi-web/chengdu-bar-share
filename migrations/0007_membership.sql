CREATE TABLE IF NOT EXISTS memberships (
  openid TEXT PRIMARY KEY,
  product_id TEXT NOT NULL DEFAULT 'permanent_member',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  wx_order_id TEXT UNIQUE,
  out_trade_no TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS memberships_status_idx ON memberships (status, updated_at);
