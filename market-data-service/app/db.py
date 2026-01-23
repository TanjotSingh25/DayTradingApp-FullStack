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
    # Parse DATABASE_URL once to extract connection details for error messages
    parsed_url = urlparse(settings.DATABASE_URL)
    host = parsed_url.hostname or "unknown"
    port = parsed_url.port or "unknown"
    
    try:
        # Create connection with timeout
        # psycopg3 supports connect_timeout parameter
        conn = psycopg.connect(
            settings.DATABASE_URL,
            connect_timeout=settings.DB_CONNECT_TIMEOUT
        )
        
        # Set command timeout (statement_timeout in PostgreSQL is in milliseconds)
        with conn.cursor() as cur:
            cur.execute(f"SET statement_timeout = {settings.DB_COMMAND_TIMEOUT * 1000}")
        conn.commit()
        
        return conn
    except psycopg.OperationalError as e:
        # Connection failed or timed out
        raise DatabaseConnectionError(
            f"Cannot connect to database server at {host}:{port}. "
            f"Connection timeout after {settings.DB_CONNECT_TIMEOUT} seconds. "
            f"Error: {str(e)}"
        )
    except psycopg.errors.QueryCanceled:
        # Query was cancelled due to timeout
        raise DatabaseConnectionError(
            f"Query timeout: Database operation exceeded {settings.DB_COMMAND_TIMEOUT} seconds "
            f"for server at {host}:{port}."
        )
    except psycopg.Error as e:
        # Other database errors
        raise DatabaseConnectionError(
            f"Database connection error for server at {host}:{port}. "
            f"Error: {str(e)}"
        )
    except Exception as e:
        # Unexpected errors
        raise DatabaseConnectionError(
            f"Unexpected error connecting to database server at {host}:{port}. "
            f"Error: {str(e)}"
        )

