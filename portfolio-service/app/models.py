from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, Field
from typing import Literal, Optional, List


LedgerType = Literal["DEPOSIT", "WITHDRAWAL", "BUY", "SELL", "FEE", "ADJUSTMENT", "RESERVE", "RELEASE"]
Side = Literal["BUY", "SELL"]


class ErrorResponse(BaseModel):
    error: str
    message: str | None = None


class HealthResponse(BaseModel):
    status: str


class AccountSummary(BaseModel):
    user_id: str
    cash_available_cents: int
    cash_reserved_cents: int
    cash_total_cents: int
    market_value_cents: Optional[int] = None
    equity_cents: Optional[int] = None
    updated_at: datetime


class DepositRequest(BaseModel):
    amount_cents: int = Field(..., gt=0)
    note: Optional[str] = None


class WithdrawRequest(BaseModel):
    amount_cents: int = Field(..., gt=0)
    note: Optional[str] = None


class FundingResponse(BaseModel):
    summary: AccountSummary
    ledger_entry_id: str


class Position(BaseModel):
    ticker: str
    qty: int
    avg_cost_cents: int
    realized_pnl_cents: int
    created_at: datetime
    updated_at: datetime


class PositionsResponse(BaseModel):
    positions: List[Position]
    count: int


class LedgerEntry(BaseModel):
    id: str
    ts: datetime
    type: LedgerType
    ticker: Optional[str] = None
    qty: Optional[int] = None
    price_cents: Optional[int] = None
    amount_cents: int
    cash_available_after_cents: int
    cash_reserved_after_cents: int
    position_qty_after: Optional[int] = None
    position_avg_cost_after_cents: Optional[int] = None
    external_ref: Optional[str] = None
    note: Optional[str] = None


class LedgerResponse(BaseModel):
    entries: List[LedgerEntry]
    next_cursor: Optional[str] = None


class ApplyExecutionRequest(BaseModel):
    execution_id: str
    order_id: str
    user_id: str
    ticker: str
    side: Side
    fill_qty: int = Field(..., gt=0)
    fill_price_cents: int = Field(..., gt=0)
    fee_cents: int = Field(default=0, ge=0)
    ts: Optional[datetime] = None


class ApplyExecutionResponse(BaseModel):
    applied: bool
    summary: AccountSummary
    position: Optional[Position] = None
    ledger_entry_ids: List[str]


class ReserveCashRequest(BaseModel):
    reservation_id: str
    user_id: str
    amount_cents: int = Field(..., gt=0)
    reason: Optional[str] = None


class ReserveCashResponse(BaseModel):
    applied: bool
    summary: AccountSummary
    ledger_entry_id: str


class ReleaseCashRequest(BaseModel):
    reservation_id: str
    user_id: str
    amount_cents: int = Field(..., gt=0)
    reason: Optional[str] = None


class ReleaseCashResponse(BaseModel):
    applied: bool
    summary: AccountSummary
    ledger_entry_id: str


