"""Pydantic models for request/response validation."""
from pydantic import BaseModel
from datetime import datetime
from typing import Literal


class Candle(BaseModel):
    """Candle data model."""
    ticker: str
    tf_min: int
    ts: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float
    openint: int


class CandleResponse(BaseModel):
    """Response model for candle queries."""
    data: list[Candle]
    count: int


class SymbolItem(BaseModel):
    """Symbol/ticker item."""
    ticker: str


class WsCandleMessage(BaseModel):
    """WebSocket message for a single candle."""
    type: Literal["CANDLE"]
    candle: Candle
    seq: int  # 0-based index in replay


class WsStatusMessage(BaseModel):
    """WebSocket status message."""
    type: Literal["STATUS"]
    message: str
    ticker: str
    tf_min: int
    step_seconds: int
    total_candles: int

