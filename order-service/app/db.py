"""Database connection utilities."""
import psycopg
import psycopg.errors
from app.config import settings
from urllib.parse import urlparse


class DatabaseConnectionError(Exception):
    """Raised when database connection fails."""
    pass


def get_conn():
    """
    Get a synchronous psycopg connection to the database with timeout.
    
    Returns:
        psycopg.Connection: Database connection
        
    Raises:
        DatabaseConnectionError: If connection fails or times out
    """
    parsed_url = urlparse(settings.DATABASE_URL)
    host = parsed_url.hostname or "unknown"
    port = parsed_url.port or "unknown"
    
    try:
        conn = psycopg.connect(
            settings.DATABASE_URL,
            connect_timeout=settings.DB_CONNECT_TIMEOUT
        )
        
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
        raise DatabaseConnectionError(
            f"Database connection error for server at {host}:{port}. "
            f"Error: {str(e)}"
        )
    except Exception as e:
        raise DatabaseConnectionError(
            f"Unexpected error connecting to database server at {host}:{port}. "
            f"Error: {str(e)}"
        )


def init_schema():
    """Initialize database schema on startup."""
    conn = get_conn()
    try:
        with open("/app/db/schema.sql", "r") as f:
            schema_sql = f.read()
        with conn.cursor() as cur:
            cur.execute(schema_sql)
        conn.commit()
    except Exception as e:
        # Schema might already exist, log and continue
        import logging
        logger = logging.getLogger("order.db")
        logger.warning(f"Schema init warning: {e}")
    finally:
        conn.close()

