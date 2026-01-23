from __future__ import annotations
from dotenv import load_dotenv
from pathlib import Path
import os
from pathlib import Path
import psycopg

REPO_ROOT = Path(__file__).resolve().parents[1]
print("REPO_ROOT =", REPO_ROOT)
load_dotenv(dotenv_path=REPO_ROOT / ".env", override=True)

# Folder containing your CSVs
STOCKS_DIR = Path("Stocks")

# Postgres URL (works with your docker port mapping 5433:5432)
DB_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5433/trading")
print("DB_URL =", DB_URL)


# 1) staging table that matches TXT columns exactly
CREATE_STAGE = """
CREATE TEMP TABLE candles_stage (
  ticker   TEXT,
  tf_min   SMALLINT,
  yyyymmdd INTEGER,
  hhmmss   INTEGER,
  open     DOUBLE PRECISION,
  high     DOUBLE PRECISION,
  low      DOUBLE PRECISION,
  close    DOUBLE PRECISION,
  volume   DOUBLE PRECISION,
  openint  BIGINT
) ON COMMIT DROP;
"""

# 2) insert into final table and build `ts` from yyyymmdd + hhmmss
INSERT_FINAL = """
INSERT INTO candles (ticker, tf_min, ts, open, high, low, close, volume, openint)
SELECT
  ticker,
  tf_min,
  to_timestamp(
    yyyymmdd::text || lpad(hhmmss::text, 6, '0'),
    'YYYYMMDDHH24MISS'
  )::timestamp AS ts,
  open, high, low, close, volume, openint
FROM candles_stage
ON CONFLICT DO NOTHING;
"""

def main() -> None:
    if not STOCKS_DIR.exists():
        raise SystemExit(f"Stocks folder not found: {STOCKS_DIR.resolve()}")

    files = sorted(STOCKS_DIR.rglob("*.txt"))
    if not files:
        raise SystemExit(f"No .txt files found under: {STOCKS_DIR.resolve()}")

    print(f"Found {len(files)} TXT files. Connecting to DB...")
    with psycopg.connect(DB_URL) as conn:
        print("Connected. Starting import...")
        # Make it faster
        conn.autocommit = False

        for i, fp in enumerate(files, start=1):
            with conn.cursor() as cur:
                # Create temp staging table for this file load
                cur.execute(CREATE_STAGE)

                # Copy TXT into staging
                copy_sql = """
                COPY candles_stage
                (ticker, tf_min, yyyymmdd, hhmmss, open, high, low, close, volume, openint)
                FROM STDIN WITH (FORMAT csv, HEADER true)
                """

                with cur.copy(copy_sql) as copy:
                    # Stream file lines directly (fast and memory efficient)
                    with fp.open("r", encoding="utf-8", newline="") as f:
                        for line in f:
                            copy.write(line)

                # Insert into final table with timestamp conversion
                cur.execute(INSERT_FINAL)

            conn.commit()

            if i % 100 == 0 or i == len(files):
                print(f"Imported {i}/{len(files)} files (latest: {fp.name})")

    print("Import complete.")

if __name__ == "__main__":
    main()
