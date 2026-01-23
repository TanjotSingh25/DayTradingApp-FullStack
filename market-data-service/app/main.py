"""FastAPI application with REST and WebSocket endpoints."""
from fastapi import FastAPI, Query, HTTPException, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from datetime import datetime
from typing import Optional
from app.config import settings
from app.crud import (
    list_symbols,
    get_candles,
    get_candles_range,
    NotFoundError,
    BadRequestError
)
from app.db import DatabaseConnectionError
from app.models import CandleResponse
from app.ws import replay_candles


app = FastAPI(title="Market Data Service")

# CORS configuration for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Exception handlers
@app.exception_handler(NotFoundError)
async def not_found_handler(request, exc: NotFoundError):
    """Handle NotFoundError exceptions."""
    return JSONResponse(status_code=404, content={"error": str(exc)})


@app.exception_handler(BadRequestError)
async def bad_request_handler(request, exc: BadRequestError):
    """Handle BadRequestError exceptions."""
    return JSONResponse(status_code=400, content={"error": str(exc)})


@app.exception_handler(DatabaseConnectionError)
async def database_connection_handler(request, exc: DatabaseConnectionError):
    """Handle DatabaseConnectionError exceptions."""
    return JSONResponse(
        status_code=503, 
        content={
            "error": "Service Unavailable",
            "message": str(exc),
            "type": "database_connection_error"
        }
    )


# REST Endpoints

@app.get("/health")
async def health():
    """
    Health check endpoint.
    Also checks database connectivity.
    """
    try:
        # Quick database connectivity check
        from app.db import get_conn
        conn = get_conn()
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
            cur.fetchone()
        conn.close()
        return {
            "status": "ok",
            "database": "connected"
        }
    except DatabaseConnectionError as e:
        return JSONResponse(
            status_code=503,
            content={
                "status": "degraded",
                "database": "disconnected",
                "error": str(e)
            }
        )
    except Exception:
        return {
            "status": "ok",
            "database": "unknown"
        }


@app.get("/symbols")
async def get_symbols(
    limit: int = Query(default=100, ge=1, le=settings.MAX_LIMIT),
    prefix: Optional[str] = Query(default=None)
):
    """
    List available ticker symbols.
    
    Args:
        limit: Maximum number of symbols to return (1-5000)
        prefix: Optional prefix filter (case-insensitive)
    
    Returns:
        Dictionary with symbols list and count
    """
    try:
        symbols = list_symbols(limit=limit, prefix=prefix)
        return {
            "symbols": symbols,
            "count": len(symbols)
        }
    except DatabaseConnectionError:
        raise
    except BadRequestError:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")


@app.get("/candles", response_model=CandleResponse)
async def get_candles_endpoint(
    ticker: str = Query(..., description="Ticker symbol (required)"),
    tf_min: int = Query(default=settings.DEFAULT_TF_MIN, ge=1, description="Timeframe in minutes"),
    limit: int = Query(default=200, ge=1, le=settings.MAX_LIMIT, description="Maximum number of candles"),
    order: str = Query(default="asc", regex="^(asc|desc)$", description="Sort order: asc or desc")
):
    """
    Get historical candles for a ticker.
    
    Args:
        ticker: Ticker symbol (required)
        tf_min: Timeframe in minutes (default: 5)
        limit: Maximum number of candles to return (default: 200, max: 5000)
        order: Sort order - "asc" or "desc" (default: "asc")
    
    Returns:
        CandleResponse with data and count
    """
    try:
        candles = get_candles(ticker=ticker, tf_min=tf_min, limit=limit, order=order)
        return CandleResponse(data=candles, count=len(candles))
    except NotFoundError:
        raise
    except BadRequestError:
        raise
    except DatabaseConnectionError:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")


@app.get("/candles/range", response_model=CandleResponse)
async def get_candles_range_endpoint(
    ticker: str = Query(..., description="Ticker symbol (required)"),
    tf_min: int = Query(default=settings.DEFAULT_TF_MIN, ge=1, description="Timeframe in minutes"),
    start: str = Query(..., description="Start timestamp (ISO format)"),
    end: str = Query(..., description="End timestamp (ISO format)"),
    limit: int = Query(default=settings.MAX_LIMIT, ge=1, le=settings.MAX_LIMIT, description="Maximum number of candles")
):
    """
    Get candles for a ticker within a time range.
    
    Args:
        ticker: Ticker symbol (required)
        tf_min: Timeframe in minutes (default: 5)
        start: Start timestamp in ISO format (required)
        end: End timestamp in ISO format (required)
        limit: Maximum number of candles to return (default: 5000, max: 5000)
    
    Returns:
        CandleResponse with data and count
    """
    try:
        # Parse ISO datetime strings
        try:
            start_dt = datetime.fromisoformat(start.replace('Z', '+00:00'))
        except ValueError:
            raise BadRequestError(f"Invalid start datetime format: {start}. Use ISO format.")
        
        try:
            end_dt = datetime.fromisoformat(end.replace('Z', '+00:00'))
        except ValueError:
            raise BadRequestError(f"Invalid end datetime format: {end}. Use ISO format.")
        
        if start_dt > end_dt:
            raise BadRequestError("Start datetime must be before end datetime")
        
        candles = get_candles_range(
            ticker=ticker,
            tf_min=tf_min,
            start=start_dt,
            end=end_dt,
            limit=limit
        )
        return CandleResponse(data=candles, count=len(candles))
    except NotFoundError:
        raise
    except BadRequestError:
        raise
    except DatabaseConnectionError:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")


# WebSocket Endpoint

@app.websocket("/ws/replay")
async def websocket_replay(
    websocket: WebSocket,
    ticker: str = Query(..., description="Ticker symbol (required)"),
    tf_min: int = Query(default=settings.DEFAULT_TF_MIN, ge=1, description="Timeframe in minutes"),
    step_seconds: int = Query(
        default=settings.WS_DEFAULT_STEP_SECONDS,
        ge=settings.WS_MIN_STEP_SECONDS,
        le=settings.WS_MAX_STEP_SECONDS,
        description="Seconds between candles"
    )
):
    """
    WebSocket endpoint for replaying candles at accelerated speed.
    
    Args:
        websocket: WebSocket connection
        ticker: Ticker symbol (required)
        tf_min: Timeframe in minutes (default: 5)
        step_seconds: Seconds to wait between candles (default: 15, min: 1, max: 60)
    
    Behavior:
        - On connect, loads all candles for ticker+timeframe
        - Sends STATUS message with total_candles
        - Replays candles sequentially with seq index
        - Sends STATUS "replay_complete" when done
        - Closes gracefully
        - Reset-per-symbol: new connection = new replay from candle 0
    """
    await replay_candles(websocket, ticker, tf_min, step_seconds)

