from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, Field
from typing import Literal, Optional, List


OrderSide = Literal["BUY", "SELL"]
OrderType = Literal["MARKET", "LIMIT"]
OrderStatus = Literal["OPEN", "FILLED", "CANCELLED", "REJECTED", "PARTIALLY_FILLED"]


class ErrorResponse(BaseModel):
    error: str
    message: str | None = None


class HealthResponse(BaseModel):
    status: str


class CandleData(BaseModel):
    ts: str  # ISO datetime string
    open: float
    high: float
    low: float
    close: float
    volume: float


class PlaceOrderRequest(BaseModel):
    ticker: str
    side: OrderSide
    type: OrderType
    qty: int = Field(..., gt=0)
    limit_price_dollars: Optional[float] = Field(None, gt=0)
    client_order_id: Optional[str] = None


class OrderResponse(BaseModel):
    order_id: str
    user_id: str
    ticker: str
    side: OrderSide
    type: OrderType
    qty: int
    limit_price_cents: Optional[int] = None
    status: OrderStatus
    filled_qty: int
    avg_fill_price_cents: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    client_order_id: Optional[str] = None
    reject_reason: Optional[str] = None


class OrdersResponse(BaseModel):
    orders: List[OrderResponse]
    count: int
    next_cursor: Optional[str] = None


class FillResponse(BaseModel):
    fill_id: str
    order_id: str
    ticker: str
    side: OrderSide
    fill_qty: int
    fill_price_cents: int
    fee_cents: int
    ts: datetime
    tick_ts: Optional[datetime] = None
    portfolio_applied: bool
    portfolio_error: Optional[str] = None


class FillsResponse(BaseModel):
    fills: List[FillResponse]
    count: int


class MarketTickRequest(BaseModel):
    ticker: str
    tf_min: int
    candle: CandleData


class MarketTickResponse(BaseModel):
    processed: bool
    ticker: str
    tick_ts: str
    orders_checked: int
    orders_filled: int
    orders_rejected: int
    fills: List[dict]


class CancelOrderResponse(BaseModel):
    order_id: str
    status: OrderStatus
    cancelled_at: datetime

