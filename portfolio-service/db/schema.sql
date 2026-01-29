-- portfolio-service/db/schema.sql
-- Keep schema in sync with app/services logic.

CREATE TABLE IF NOT EXISTS accounts (
  user_id TEXT PRIMARY KEY,
  cash_available_cents BIGINT NOT NULL DEFAULT 0,
  cash_reserved_cents  BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS positions (
  user_id TEXT NOT NULL,
  ticker  TEXT NOT NULL,
  qty     BIGINT NOT NULL,
  avg_cost_cents BIGINT NOT NULL DEFAULT 0,
  realized_pnl_cents BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, ticker)
);

CREATE TABLE IF NOT EXISTS executions_applied (
  execution_id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  request_json JSONB NOT NULL,
  response_json JSONB NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reservations_applied (
  reservation_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  request_json JSONB NOT NULL,
  response_json JSONB NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  type TEXT NOT NULL,
  ticker TEXT NULL,
  qty BIGINT NULL,
  price_cents BIGINT NULL,
  amount_cents BIGINT NOT NULL,
  fee_cents BIGINT NOT NULL DEFAULT 0,
  cash_available_after_cents BIGINT NOT NULL,
  cash_reserved_after_cents  BIGINT NOT NULL,
  position_qty_after BIGINT NULL,
  position_avg_cost_after_cents BIGINT NULL,
  external_ref TEXT NULL,
  note TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_ledger_user_ts ON ledger (user_id, ts DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_positions_user ON positions (user_id);


