"""CRUD operations for database queries."""
from app.db import get_conn, DatabaseConnectionError
from app.models import Candle
from datetime import datetime
from typing import Optional
import psycopg.errors


class NotFoundError(Exception):
    """Raised when a ticker or resource is not found."""
    pass


class BadRequestError(Exception):
    """Raised when a request is invalid."""
    pass


def list_symbols(limit: int, prefix: Optional[str] = None) -> list[str]:
    """
    List distinct tickers from the candles table.
    
    Args:
        limit: Maximum number of symbols to return
        prefix: Optional prefix filter (case-insensitive)
    
    Returns:
        List of ticker strings
        
    Raises:
        DatabaseConnectionError: If database connection fails
        BadRequestError: If parameters are invalid
    """
    # Validate parameter types
    if not isinstance(limit, int) or limit < 1:
        raise BadRequestError(f"Invalid limit parameter: {limit}. Must be a positive integer.")
    
    if prefix is not None and not isinstance(prefix, str):
        raise BadRequestError(f"Invalid prefix parameter: {prefix}. Must be a string.")
    
    conn = None
    try:
        conn = get_conn()
        with conn.cursor() as cur:
            if prefix:
                query = """
                    SELECT DISTINCT ticker 
                    FROM candles 
                    WHERE ticker ILIKE %s
                    ORDER BY ticker ASC 
                    LIMIT %s
                """
                pattern = f"{prefix}%"
                cur.execute(query, (pattern, limit))
            else:
                query = """
                    SELECT DISTINCT ticker 
                    FROM candles 
                    ORDER BY ticker ASC 
                    LIMIT %s
                """
                cur.execute(query, (limit,))
            
            results = cur.fetchall()
            return [row[0] for row in results]
    except DatabaseConnectionError:
        raise
    except psycopg.errors.QueryCanceled:
        raise DatabaseConnectionError("Query timeout: Database operation took too long.")
    except psycopg.errors.Error as e:
        raise DatabaseConnectionError(f"Database query error: {str(e)}")
    finally:
        if conn:
            conn.close()


def get_candles(
    ticker: str, 
    tf_min: int, 
    limit: int, 
    order: str = "asc"
) -> list[Candle]:
    """
    Get candles for a specific ticker and timeframe.
    
    Args:
        ticker: Ticker symbol
        tf_min: Timeframe in minutes
        limit: Maximum number of candles to return
        order: Sort order ("asc" or "desc")
    
    Returns:
        List of Candle objects
    
    Raises:
        NotFoundError: If no candles found for the ticker
        BadRequestError: If parameters are invalid
        DatabaseConnectionError: If database connection fails
    """
    # Validate parameter types
    if not isinstance(ticker, str) or not ticker.strip():
        raise BadRequestError(f"Invalid ticker parameter: {ticker}. Must be a non-empty string.")
    
    if not isinstance(tf_min, int) or tf_min < 1:
        raise BadRequestError(f"Invalid tf_min parameter: {tf_min}. Must be a positive integer.")
    
    if not isinstance(limit, int) or limit < 1:
        raise BadRequestError(f"Invalid limit parameter: {limit}. Must be a positive integer.")
    
    if not isinstance(order, str) or order not in ("asc", "desc"):
        raise BadRequestError(f"Invalid order parameter: {order}. Must be 'asc' or 'desc'")
    
    conn = None
    try:
        conn = get_conn()
        with conn.cursor() as cur:
            query = """
                SELECT ticker, tf_min, ts, open, high, low, close, volume, openint
                FROM candles
                WHERE ticker = %s AND tf_min = %s
                ORDER BY ts {order}
                LIMIT %s
            """.format(order=order.upper())
            
            cur.execute(query, (ticker, tf_min, limit))
            rows = cur.fetchall()
            
            if not rows:
                raise NotFoundError(f"No candles found for ticker '{ticker}' with timeframe {tf_min}min")
            
            candles = []
            for row in rows:
                candles.append(Candle(
                    ticker=row[0],
                    tf_min=row[1],
                    ts=row[2],
                    open=float(row[3]),
                    high=float(row[4]),
                    low=float(row[5]),
                    close=float(row[6]),
                    volume=float(row[7]),
                    openint=int(row[8])
                ))
            
            return candles
    except DatabaseConnectionError:
        raise
    except NotFoundError:
        raise
    except BadRequestError:
        raise
    except psycopg.errors.QueryCanceled:
        raise DatabaseConnectionError("Query timeout: Database operation took too long.")
    except psycopg.errors.Error as e:
        raise DatabaseConnectionError(f"Database query error: {str(e)}")
    finally:
        if conn:
            conn.close()


def get_candles_range(
    ticker: str,
    tf_min: int,
    start: datetime,
    end: datetime,
    limit: int
) -> list[Candle]:
    """
    Get candles for a specific ticker within a time range.
    
    Args:
        ticker: Ticker symbol
        tf_min: Timeframe in minutes
        start: Start timestamp (inclusive)
        end: End timestamp (inclusive)
        limit: Maximum number of candles to return
    
    Returns:
        List of Candle objects ordered by timestamp ascending
    
    Raises:
        NotFoundError: If no candles found for the ticker
        BadRequestError: If parameters are invalid
        DatabaseConnectionError: If database connection fails
    """
    # Validate parameter types
    if not isinstance(ticker, str) or not ticker.strip():
        raise BadRequestError(f"Invalid ticker parameter: {ticker}. Must be a non-empty string.")
    
    if not isinstance(tf_min, int) or tf_min < 1:
        raise BadRequestError(f"Invalid tf_min parameter: {tf_min}. Must be a positive integer.")
    
    if not isinstance(start, datetime):
        raise BadRequestError(f"Invalid start parameter: {start}. Must be a datetime object.")
    
    if not isinstance(end, datetime):
        raise BadRequestError(f"Invalid end parameter: {end}. Must be a datetime object.")
    
    if not isinstance(limit, int) or limit < 1:
        raise BadRequestError(f"Invalid limit parameter: {limit}. Must be a positive integer.")
    
    if start > end:
        raise BadRequestError("Start datetime must be before or equal to end datetime")
    
    conn = None
    try:
        conn = get_conn()
        with conn.cursor() as cur:
            query = """
                SELECT ticker, tf_min, ts, open, high, low, close, volume, openint
                FROM candles
                WHERE ticker = %s AND tf_min = %s AND ts >= %s AND ts <= %s
                ORDER BY ts ASC
                LIMIT %s
            """
            
            cur.execute(query, (ticker, tf_min, start, end, limit))
            rows = cur.fetchall()
            
            if not rows:
                raise NotFoundError(
                    f"No candles found for ticker '{ticker}' with timeframe {tf_min}min "
                    f"in range {start} to {end}"
                )
            
            candles = []
            for row in rows:
                candles.append(Candle(
                    ticker=row[0],
                    tf_min=row[1],
                    ts=row[2],
                    open=float(row[3]),
                    high=float(row[4]),
                    low=float(row[5]),
                    close=float(row[6]),
                    volume=float(row[7]),
                    openint=int(row[8])
                ))
            
            return candles
    except DatabaseConnectionError:
        raise
    except NotFoundError:
        raise
    except BadRequestError:
        raise
    except psycopg.errors.QueryCanceled:
        raise DatabaseConnectionError("Query timeout: Database operation took too long.")
    except psycopg.errors.Error as e:
        raise DatabaseConnectionError(f"Database query error: {str(e)}")
    finally:
        if conn:
            conn.close()


def get_first_last_ts(ticker: str, tf_min: int) -> Optional[tuple[datetime, datetime]]:
    """
    Get the first and last timestamp for a ticker and timeframe.
    
    Args:
        ticker: Ticker symbol
        tf_min: Timeframe in minutes
    
    Returns:
        Tuple of (first_ts, last_ts) or None if no candles found
        
    Raises:
        BadRequestError: If parameters are invalid
        DatabaseConnectionError: If database connection fails
    """
    # Validate parameter types
    if not isinstance(ticker, str) or not ticker.strip():
        raise BadRequestError(f"Invalid ticker parameter: {ticker}. Must be a non-empty string.")
    
    if not isinstance(tf_min, int) or tf_min < 1:
        raise BadRequestError(f"Invalid tf_min parameter: {tf_min}. Must be a positive integer.")
    
    conn = None
    try:
        conn = get_conn()
        with conn.cursor() as cur:
            query = """
                SELECT MIN(ts), MAX(ts)
                FROM candles
                WHERE ticker = %s AND tf_min = %s
            """
            
            cur.execute(query, (ticker, tf_min))
            row = cur.fetchone()
            
            if row and row[0] and row[1]:
                return (row[0], row[1])
            return None
    except DatabaseConnectionError:
        raise
    except BadRequestError:
        raise
    except psycopg.errors.QueryCanceled:
        raise DatabaseConnectionError("Query timeout: Database operation took too long.")
    except psycopg.errors.Error as e:
        raise DatabaseConnectionError(f"Database query error: {str(e)}")
    finally:
        if conn:
            conn.close()

