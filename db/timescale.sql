-- TimescaleDB Extension and Hypertable Setup
-- This script runs automatically on first database initialization

-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Convert candles table to hypertable for time-series optimization
-- Only if the table exists and is not already a hypertable
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'candles'
  ) AND NOT EXISTS (
    SELECT 1 FROM timescaledb_information.hypertables 
    WHERE hypertable_name = 'candles'
  ) THEN
    PERFORM create_hypertable('candles', 'ts', if_not_exists => TRUE);
  END IF;
END $$;

