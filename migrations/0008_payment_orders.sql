CREATE TABLE IF NOT EXISTS payment_orders (
  out_trade_no TEXT PRIMARY KEY,
  openid TEXT NOT NULL,
  product_id TEXT NOT NULL CHECK(product_id = 'permanent_member'),
  amount INTEGER NOT NULL CHECK(amount = 188),
  wx_order_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','fulfilled','refunded','closed')),
  delivery_ack INTEGER NOT NULL DEFAULT 0,
  checked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS payment_orders_owner ON payment_orders(openid,created_at);
CREATE INDEX IF NOT EXISTS payment_orders_reconcile ON payment_orders(checked_at,status);
