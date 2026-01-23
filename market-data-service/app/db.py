"""Database connection utilities."""
import psycopg
from app.config import settings


def get_conn():
    """Get a synchronous psycopg connection to the database."""
    return psycopg.connect(settings.DATABASE_URL)

