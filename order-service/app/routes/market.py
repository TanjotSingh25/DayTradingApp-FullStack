"""Market tick processing endpoint."""
from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime

from app.auth import UserIdDep
from app.db import get_conn
from app.models import MarketTickRequest, MarketTickResponse, ErrorResponse
from app.services.order_engine import process_tick

router = APIRouter()


@router.post("/market/tick", response_model=MarketTickResponse)
def process_market_tick(req: MarketTickRequest, user_id: str = UserIdDep):
    """
    Process a market tick (candle) and attempt to fill open orders.
    
    The frontend calls this endpoint each time it receives a new candle during replay.
    This ensures order execution is synchronized with what the user sees on the chart.
    """
    conn = get_conn()
    try:
        # Parse candle timestamp
        try:
            candle_ts = datetime.fromisoformat(req.candle.ts.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail={"error": "INVALID_REQUEST", "message": "Invalid candle.ts format, use ISO datetime"},
            )

        # Validate candle data
        if req.candle.high < req.candle.low:
            raise HTTPException(
                status_code=400,
                detail={"error": "INVALID_REQUEST", "message": "candle.high must be >= candle.low"},
            )

        result = process_tick(
            conn=conn,
            user_id=user_id,
            ticker=req.ticker.upper().strip(),
            tf_min=req.tf_min,
            candle_ts=candle_ts,
            candle_open=req.candle.open,
            candle_high=req.candle.high,
            candle_low=req.candle.low,
            candle_close=req.candle.close,
            candle_volume=req.candle.volume,
        )

        return MarketTickResponse(**result)
    finally:
        conn.close()

