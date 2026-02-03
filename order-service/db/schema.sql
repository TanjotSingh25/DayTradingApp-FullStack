-- Order Service Database Schema

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
  order_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  ticker TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
  type TEXT NOT NULL CHECK (type IN ('MARKET', 'LIMIT')),
  qty BIGINT NOT NULL CHECK (qty > 0),
  limit_price_cents BIGINT NULL,
  status TEXT NOT NULL CHECK (status IN ('OPEN', 'FILLED', 'CANCELLED', 'REJECTED', 'PARTIALLY_FILLED')),
  filled_qty BIGINT NOT NULL DEFAULT 0,
  avg_fill_price_cents BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  client_order_id TEXT NULL,
  reject_reason TEXT NULL
);

-- Fills (executions) table
CREATE TABLE IF NOT EXISTS fills (
  fill_id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  ticker TEXT NOT NULL,
  side TEXT NOT NULL,
  fill_qty BIGINT NOT NULL,
  fill_price_cents BIGINT NOT NULL,
  fee_cents BIGINT NOT NULL DEFAULT 0,
  ts TIMESTAMP NOT NULL DEFAULT NOW(),
  tick_ts TIMESTAMP NULL,
  external_execution_id TEXT NOT NULL UNIQUE,
  portfolio_applied BOOLEAN NOT NULL DEFAULT FALSE,
  portfolio_error TEXT NULL
);

-- Tick deduplication table
CREATE TABLE IF NOT EXISTS tick_dedup (
  user_id TEXT NOT NULL,
  ticker TEXT NOT NULL,
  tick_key TEXT NOT NULL,
  processed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, ticker, tick_key)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_orders_user_status_created ON orders (user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_user_ticker_status ON orders (user_id, ticker, status);
CREATE INDEX IF NOT EXISTS idx_fills_order_ts ON fills (order_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_fills_user_ts ON fills (user_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_orders_client_order_id ON orders (user_id, client_order_id) WHERE client_order_id IS NOT NULL;

