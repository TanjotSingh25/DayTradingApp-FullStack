-- db/schema.sql

CREATE TABLE IF NOT EXISTS candles (
  ticker      TEXT        NOT NULL,
  tf_min      SMALLINT    NOT NULL,
  ts          TIMESTAMP   NOT NULL,
  open        DOUBLE PRECISION NOT NULL,
  high        DOUBLE PRECISION NOT NULL,
  low         DOUBLE PRECISION NOT NULL,
  close       DOUBLE PRECISION NOT NULL,
  volume      DOUBLE PRECISION NOT NULL,
  openint     BIGINT      NOT NULL,
  PRIMARY KEY (ticker, tf_min, ts)
);

-- Fast “latest candles for a symbol” queries
CREATE INDEX IF NOT EXISTS idx_candles_ticker_ts
  ON candles (ticker, ts DESC);
