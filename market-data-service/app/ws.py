"""WebSocket endpoint for candle replay."""
import asyncio
from fastapi import WebSocket, Query
from app.config import settings
from app.crud import get_candles, NotFoundError, BadRequestError
from app.db import DatabaseConnectionError
from app.models import WsCandleMessage, WsStatusMessage, Candle
from typing import Optional
from fastapi.encoders import jsonable_encoder
from starlette.websockets import WebSocketDisconnect


async def replay_candles(
    websocket: WebSocket,
    ticker: str,
    tf_min: int,
    step_seconds: int
):
    """
    Replay candles for a ticker at accelerated speed.
    
    Args:
        websocket: WebSocket connection
        ticker: Ticker symbol
        tf_min: Timeframe in minutes
        step_seconds: Seconds to wait between candles
    """
    await websocket.accept()
    
    try:
        # Load all candles for this ticker/timeframe
        # Using a large limit to get all candles (or use a separate query)
        # For v1, we'll use a large limit
        candles = get_candles(ticker, tf_min, limit=100000, order="asc")
        
        if not candles:
            # Send status message and close
            status = WsStatusMessage(
                type="STATUS",
                message="No candles found for ticker",
                ticker=ticker,
                tf_min=tf_min,
                step_seconds=step_seconds,
                total_candles=0
            )
            await websocket.send_json(jsonable_encoder(status))
            await websocket.close(code=1008, reason="No candles found")
            return
        
        total_candles = len(candles)
        
        # Send initial status message
        status = WsStatusMessage(
            type="STATUS",
            message="replay_starting",
            ticker=ticker,
            tf_min=tf_min,
            step_seconds=step_seconds,
            total_candles=total_candles
        )
        await websocket.send_json(jsonable_encoder(status))
        
        # Replay candles
        for seq, candle in enumerate(candles):
            message = WsCandleMessage(
                type="CANDLE",
                candle=candle,
                seq=seq
            )
            await websocket.send_json(jsonable_encoder(message))
            
            # Sleep between candles (except for the last one)
            if seq < total_candles - 1:
                await asyncio.sleep(step_seconds)
        
        # Send completion status
        status = WsStatusMessage(
            type="STATUS",
            message="replay_complete",
            ticker=ticker,
            tf_min=tf_min,
            step_seconds=step_seconds,
            total_candles=total_candles
        )
        await websocket.send_json(jsonable_encoder(status))
        
        # Close gracefully
        await websocket.close()

    except WebSocketDisconnect:
        return  # Client disconnected, exit silently
        
    except DatabaseConnectionError as e:
        status = WsStatusMessage(
            type="STATUS",
            message=f"Database connection error: {str(e)}",
            ticker=ticker,
            tf_min=tf_min,
            step_seconds=step_seconds,
            total_candles=0
        )
        await websocket.send_json(jsonable_encoder(status))
        await websocket.close(code=1011, reason="Database connection failed")
    except NotFoundError as e:
        status = WsStatusMessage(
            type="STATUS",
            message=str(e),
            ticker=ticker,
            tf_min=tf_min,
            step_seconds=step_seconds,
            total_candles=0
        )
        await websocket.send_json(jsonable_encoder(status))
        await websocket.close(code=1008, reason=str(e))
    except BadRequestError as e:
        status = WsStatusMessage(
            type="STATUS",
            message=f"Invalid request: {str(e)}",
            ticker=ticker,
            tf_min=tf_min,
            step_seconds=step_seconds,
            total_candles=0
        )
        await websocket.send_json(jsonable_encoder(status))
        await websocket.close(code=1008, reason=str(e))
    except Exception as e:
        try:
            status = WsStatusMessage(
                type="STATUS",
                message=f"Error: {str(e)}",
                ticker=ticker,
                tf_min=tf_min,
                step_seconds=step_seconds,
                total_candles=0,
            )
            await websocket.send_json(jsonable_encoder(status))
            await websocket.close(code=1011, reason="Internal error")
        except Exception:
            # If already closed, don't spam logs with secondary failures.
            return

