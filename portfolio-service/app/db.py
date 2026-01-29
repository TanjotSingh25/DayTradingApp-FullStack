from __future__ import annotations

import psycopg
import psycopg.errors
from urllib.parse import urlparse
from pathlib import Path

from app.config import settings


class DatabaseConnectionError(Exception):
    pass


def get_conn() -> psycopg.Connection:
    parsed = urlparse(settings.DATABASE_URL)
    host = parsed.hostname or "unknown"
    port = parsed.port or "unknown"
    try:
        conn = psycopg.connect(settings.DATABASE_URL, connect_timeout=settings.DB_CONNECT_TIMEOUT)
        with conn.cursor() as cur:
            cur.execute(f"SET statement_timeout = {settings.DB_COMMAND_TIMEOUT * 1000}")
        conn.commit()
        return conn
    except psycopg.OperationalError as e:
        raise DatabaseConnectionError(
            f"Cannot connect to database server at {host}:{port}. "
            f"Connection timeout after {settings.DB_CONNECT_TIMEOUT} seconds. "
            f"Error: {str(e)}"
        )
    except psycopg.errors.QueryCanceled:
        raise DatabaseConnectionError(
            f"Query timeout: Database operation exceeded {settings.DB_COMMAND_TIMEOUT} seconds "
            f"for server at {host}:{port}."
        )
    except psycopg.Error as e:
        raise DatabaseConnectionError(f"Database connection error for server at {host}:{port}. Error: {str(e)}")


def run_schema_init(conn: psycopg.Connection) -> None:
    schema_path = Path(__file__).resolve().parent.parent / "db" / "schema.sql"
    sql = schema_path.read_text(encoding="utf-8")
    with conn.cursor() as cur:
        cur.execute(sql)
    conn.commit()


