from __future__ import annotations

import base64
import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Optional, Sequence
from uuid import uuid4

import psycopg
from psycopg.rows import dict_row


logger = logging.getLogger("portfolio.services")


class ConflictError(Exception):
    def __init__(self, code: str, message: str | None = None):
        self.code = code
        self.message = message or code
        super().__init__(self.message)


class NotFoundError(Exception):
    pass


@dataclass
class AccountRow:
    user_id: str
    cash_available_cents: int
    cash_reserved_cents: int
    created_at: datetime
    updated_at: datetime


@dataclass
class PositionRow:
    user_id: str
    ticker: str
    qty: int
    avg_cost_cents: int
    realized_pnl_cents: int
    created_at: datetime
    updated_at: datetime


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _ensure_account_for_update(cur: psycopg.Cursor, user_id: str) -> AccountRow:
    cur.execute(
        "INSERT INTO accounts (user_id) VALUES (%s) ON CONFLICT (user_id) DO NOTHING",
        (user_id,),
    )
    cur.execute(
        """
        SELECT user_id, cash_available_cents, cash_reserved_cents, created_at, updated_at
        FROM accounts
        WHERE user_id = %s
        FOR UPDATE
        """,
        (user_id,),
    )
    row = cur.fetchone()
    assert row, "accounts row must exist after upsert"
    return AccountRow(**row)


def _get_position_for_update(cur: psycopg.Cursor, user_id: str, ticker: str) -> Optional[PositionRow]:
    cur.execute(
        """
        SELECT user_id, ticker, qty, avg_cost_cents, realized_pnl_cents, created_at, updated_at
        FROM positions
        WHERE user_id = %s AND ticker = %s
        FOR UPDATE
        """,
        (user_id, ticker),
    )
    row = cur.fetchone()
    return PositionRow(**row) if row else None


def _upsert_position(
    cur: psycopg.Cursor,
    user_id: str,
    ticker: str,
    qty: int,
    avg_cost_cents: int,
    realized_pnl_cents: int,
) -> PositionRow:
    now = _utcnow()
    cur.execute(
        """
        INSERT INTO positions (user_id, ticker, qty, avg_cost_cents, realized_pnl_cents, created_at, updated_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (user_id, ticker)
        DO UPDATE SET
          qty = EXCLUDED.qty,
          avg_cost_cents = EXCLUDED.avg_cost_cents,
          realized_pnl_cents = EXCLUDED.realized_pnl_cents,
          updated_at = EXCLUDED.updated_at
        RETURNING user_id, ticker, qty, avg_cost_cents, realized_pnl_cents, created_at, updated_at
        """,
        (user_id, ticker, qty, avg_cost_cents, realized_pnl_cents, now, now),
    )
    row = cur.fetchone()
    assert row
    return PositionRow(**row)


def _update_account(cur: psycopg.Cursor, user_id: str, cash_available_cents: int, cash_reserved_cents: int) -> AccountRow:
    now = _utcnow()
    cur.execute(
        """
        UPDATE accounts
        SET cash_available_cents = %s,
            cash_reserved_cents = %s,
            updated_at = %s
        WHERE user_id = %s
        RETURNING user_id, cash_available_cents, cash_reserved_cents, created_at, updated_at
        """,
        (cash_available_cents, cash_reserved_cents, now, user_id),
    )
    row = cur.fetchone()
    assert row
    return AccountRow(**row)


def _insert_ledger(
    cur: psycopg.Cursor,
    *,
    user_id: str,
    ts: datetime,
    type_: str,
    ticker: Optional[str],
    qty: Optional[int],
    price_cents: Optional[int],
    amount_cents: int,
    fee_cents: int,
    cash_available_after_cents: int,
    cash_reserved_after_cents: int,
    position_qty_after: Optional[int],
    position_avg_cost_after_cents: Optional[int],
    external_ref: Optional[str],
    note: Optional[str],
) -> str:
    ledger_id = str(uuid4())
    cur.execute(
        """
        INSERT INTO ledger (
          id, user_id, ts, type, ticker, qty, price_cents, amount_cents, fee_cents,
          cash_available_after_cents, cash_reserved_after_cents,
          position_qty_after, position_avg_cost_after_cents, external_ref, note
        )
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """,
        (
            ledger_id,
            user_id,
            ts,
            type_,
            ticker,
            qty,
            price_cents,
            amount_cents,
            fee_cents,
            cash_available_after_cents,
            cash_reserved_after_cents,
            position_qty_after,
            position_avg_cost_after_cents,
            external_ref,
            note,
        ),
    )
    return ledger_id


def account_summary_from_row(user_id: str, cash_avail: int, cash_res: int, updated_at: datetime) -> dict[str, Any]:
    cash_total = cash_avail + cash_res
    return {
        "user_id": user_id,
        "cash_available_cents": cash_avail,
        "cash_reserved_cents": cash_res,
        "cash_total_cents": cash_total,
        "market_value_cents": None,
        "equity_cents": None,
        "updated_at": updated_at,
    }


def deposit(conn: psycopg.Connection, user_id: str, amount_cents: int, note: Optional[str]) -> tuple[dict[str, Any], str]:
    logger.info("deposit user_id=%s amount_cents=%s", user_id, amount_cents)
    with conn.transaction():
        with conn.cursor(row_factory=dict_row) as cur:
            acct = _ensure_account_for_update(cur, user_id)
            new_avail = acct.cash_available_cents + amount_cents
            acct2 = _update_account(cur, user_id, new_avail, acct.cash_reserved_cents)
            ledger_id = _insert_ledger(
                cur,
                user_id=user_id,
                ts=_utcnow(),
                type_="DEPOSIT",
                ticker=None,
                qty=None,
                price_cents=None,
                amount_cents=amount_cents,
                fee_cents=0,
                cash_available_after_cents=acct2.cash_available_cents,
                cash_reserved_after_cents=acct2.cash_reserved_cents,
                position_qty_after=None,
                position_avg_cost_after_cents=None,
                external_ref=None,
                note=note,
            )
            return account_summary_from_row(
                acct2.user_id, acct2.cash_available_cents, acct2.cash_reserved_cents, acct2.updated_at
            ), ledger_id


def withdraw(conn: psycopg.Connection, user_id: str, amount_cents: int, note: Optional[str]) -> tuple[dict[str, Any], str]:
    logger.info("withdraw user_id=%s amount_cents=%s", user_id, amount_cents)
    with conn.transaction():
        with conn.cursor(row_factory=dict_row) as cur:
            acct = _ensure_account_for_update(cur, user_id)
            if acct.cash_available_cents < amount_cents:
                raise ConflictError("INSUFFICIENT_FUNDS")
            new_avail = acct.cash_available_cents - amount_cents
            acct2 = _update_account(cur, user_id, new_avail, acct.cash_reserved_cents)
            ledger_id = _insert_ledger(
                cur,
                user_id=user_id,
                ts=_utcnow(),
                type_="WITHDRAWAL",
                ticker=None,
                qty=None,
                price_cents=None,
                amount_cents=-amount_cents,
                fee_cents=0,
                cash_available_after_cents=acct2.cash_available_cents,
                cash_reserved_after_cents=acct2.cash_reserved_cents,
                position_qty_after=None,
                position_avg_cost_after_cents=None,
                external_ref=None,
                note=note,
            )
            return account_summary_from_row(
                acct2.user_id, acct2.cash_available_cents, acct2.cash_reserved_cents, acct2.updated_at
            ), ledger_id


def init_account(conn: psycopg.Connection, user_id: str) -> tuple[bool, dict[str, Any]]:
    """
    Initialize a portfolio account for a user.
    Idempotent: if account already exists, returns existing account.
    Returns: (created: bool, summary: dict)
    """
    logger.info("init_account user_id=%s", user_id)
    with conn.transaction():
        with conn.cursor(row_factory=dict_row) as cur:
            # Check if account already exists
            cur.execute(
                "SELECT user_id, cash_available_cents, cash_reserved_cents, created_at, updated_at FROM accounts WHERE user_id = %s",
                (user_id,),
            )
            existing = cur.fetchone()
            if existing:
                # Account already exists, return it
                acct = AccountRow(**existing)
                return False, account_summary_from_row(
                    acct.user_id, acct.cash_available_cents, acct.cash_reserved_cents, acct.updated_at
                )
            
            # Create new account with zero balance
            acct = _ensure_account_for_update(cur, user_id)
            return True, account_summary_from_row(
                acct.user_id, acct.cash_available_cents, acct.cash_reserved_cents, acct.updated_at
            )


def get_summary(conn: psycopg.Connection, user_id: str) -> dict[str, Any]:
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            SELECT user_id, cash_available_cents, cash_reserved_cents, updated_at
            FROM accounts
            WHERE user_id = %s
            """,
            (user_id,),
        )
        row = cur.fetchone()
        if not row:
            # Treat missing account as zero-balance account
            return account_summary_from_row(user_id, 0, 0, _utcnow())
        return account_summary_from_row(row["user_id"], row["cash_available_cents"], row["cash_reserved_cents"], row["updated_at"])


def _request_key(payload: dict[str, Any]) -> str:
    # Stable JSON string for equality checks
    return json.dumps(payload, sort_keys=True, separators=(",", ":"))


def apply_execution(conn: psycopg.Connection, payload: dict[str, Any]) -> dict[str, Any]:
    """
    payload keys:
      execution_id, order_id, user_id, ticker, side, fill_qty, fill_price_cents, fee_cents, ts
    """
    execution_id = payload["execution_id"]
    user_id = payload["user_id"]
    ticker = payload["ticker"].upper()
    side = payload["side"]
    fill_qty = int(payload["fill_qty"])
    fill_price_cents = int(payload["fill_price_cents"])
    fee_cents = int(payload.get("fee_cents") or 0)
    ts = payload.get("ts") or _utcnow()

    logger.info(
        "apply_execution execution_id=%s user_id=%s side=%s ticker=%s qty=%s price=%s fee=%s",
        execution_id,
        user_id,
        side,
        ticker,
        fill_qty,
        fill_price_cents,
        fee_cents,
    )

    req_json = payload.copy()
    req_json["ticker"] = ticker
    if isinstance(ts, datetime):
        req_json["ts"] = ts.isoformat()
    req_key = _request_key(req_json)

    with conn.transaction():
        with conn.cursor(row_factory=dict_row) as cur:
            # Idempotency check
            cur.execute(
                "SELECT request_json, response_json FROM executions_applied WHERE execution_id = %s FOR UPDATE",
                (execution_id,),
            )
            existing = cur.fetchone()
            if existing:
                existing_key = _request_key(existing["request_json"])
                if existing_key != req_key:
                    raise ConflictError("IDEMPOTENCY_KEY_CONFLICT", "execution_id already used with different payload")
                return existing["response_json"]

            acct = _ensure_account_for_update(cur, user_id)
            pos = _get_position_for_update(cur, user_id, ticker)
            old_qty = pos.qty if pos else 0
            old_avg = pos.avg_cost_cents if pos else 0
            old_realized = pos.realized_pnl_cents if pos else 0

            ledger_ids: list[str] = []

            if side == "BUY":
                cost = fill_qty * fill_price_cents + fee_cents
                if acct.cash_available_cents < cost:
                    raise ConflictError("INSUFFICIENT_FUNDS")
                new_avail = acct.cash_available_cents - cost
                new_qty = old_qty + fill_qty
                new_avg = (old_qty * old_avg + fill_qty * fill_price_cents) // new_qty if new_qty > 0 else 0
                acct2 = _update_account(cur, user_id, new_avail, acct.cash_reserved_cents)
                pos2 = _upsert_position(cur, user_id, ticker, new_qty, new_avg, old_realized)
                ledger_ids.append(
                    _insert_ledger(
                        cur,
                        user_id=user_id,
                        ts=ts if isinstance(ts, datetime) else _utcnow(),
                        type_="BUY",
                        ticker=ticker,
                        qty=fill_qty,
                        price_cents=fill_price_cents,
                        amount_cents=-cost,
                        fee_cents=fee_cents,
                        cash_available_after_cents=acct2.cash_available_cents,
                        cash_reserved_after_cents=acct2.cash_reserved_cents,
                        position_qty_after=pos2.qty,
                        position_avg_cost_after_cents=pos2.avg_cost_cents,
                        external_ref=payload.get("order_id"),
                        note=f"execution_id={execution_id}",
                    )
                )
                summary = account_summary_from_row(
                    acct2.user_id, acct2.cash_available_cents, acct2.cash_reserved_cents, acct2.updated_at
                )
                response = {"applied": True, "summary": summary, "position": pos2.__dict__, "ledger_entry_ids": ledger_ids}
            else:
                # SELL
                if old_qty < fill_qty:
                    raise ConflictError("INSUFFICIENT_SHARES")
                proceeds = fill_qty * fill_price_cents - fee_cents
                new_avail = acct.cash_available_cents + proceeds
                new_qty = old_qty - fill_qty
                realized_delta = (fill_price_cents - old_avg) * fill_qty - fee_cents
                new_realized = old_realized + realized_delta
                acct2 = _update_account(cur, user_id, new_avail, acct.cash_reserved_cents)
                pos2 = _upsert_position(cur, user_id, ticker, new_qty, old_avg if new_qty > 0 else old_avg, new_realized)
                ledger_ids.append(
                    _insert_ledger(
                        cur,
                        user_id=user_id,
                        ts=ts if isinstance(ts, datetime) else _utcnow(),
                        type_="SELL",
                        ticker=ticker,
                        qty=fill_qty,
                        price_cents=fill_price_cents,
                        amount_cents=proceeds,
                        fee_cents=fee_cents,
                        cash_available_after_cents=acct2.cash_available_cents,
                        cash_reserved_after_cents=acct2.cash_reserved_cents,
                        position_qty_after=pos2.qty,
                        position_avg_cost_after_cents=pos2.avg_cost_cents,
                        external_ref=payload.get("order_id"),
                        note=f"execution_id={execution_id}",
                    )
                )
                summary = account_summary_from_row(
                    acct2.user_id, acct2.cash_available_cents, acct2.cash_reserved_cents, acct2.updated_at
                )
                response = {"applied": True, "summary": summary, "position": pos2.__dict__, "ledger_entry_ids": ledger_ids}

            # Persist idempotency result
            cur.execute(
                """
                INSERT INTO executions_applied (execution_id, order_id, user_id, request_json, response_json)
                VALUES (%s, %s, %s, %s::jsonb, %s::jsonb)
                """,
                (execution_id, payload["order_id"], user_id, json.dumps(req_json), json.dumps(response, default=str)),
            )
            return response


def reserve_cash(conn: psycopg.Connection, payload: dict[str, Any]) -> dict[str, Any]:
    reservation_id = payload["reservation_id"]
    user_id = payload["user_id"]
    amount_cents = int(payload["amount_cents"])
    reason = payload.get("reason")
    req_key = _request_key(payload)

    logger.info("reserve_cash reservation_id=%s user_id=%s amount_cents=%s", reservation_id, user_id, amount_cents)

    with conn.transaction():
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                "SELECT request_json, response_json FROM reservations_applied WHERE reservation_id = %s FOR UPDATE",
                (reservation_id,),
            )
            existing = cur.fetchone()
            if existing:
                if _request_key(existing["request_json"]) != req_key:
                    raise ConflictError("IDEMPOTENCY_KEY_CONFLICT", "reservation_id already used with different payload")
                return existing["response_json"]

            acct = _ensure_account_for_update(cur, user_id)
            if acct.cash_available_cents < amount_cents:
                raise ConflictError("INSUFFICIENT_FUNDS")
            acct2 = _update_account(
                cur,
                user_id,
                acct.cash_available_cents - amount_cents,
                acct.cash_reserved_cents + amount_cents,
            )
            ledger_id = _insert_ledger(
                cur,
                user_id=user_id,
                ts=_utcnow(),
                type_="RESERVE",
                ticker=None,
                qty=None,
                price_cents=None,
                amount_cents=-amount_cents,
                fee_cents=0,
                cash_available_after_cents=acct2.cash_available_cents,
                cash_reserved_after_cents=acct2.cash_reserved_cents,
                position_qty_after=None,
                position_avg_cost_after_cents=None,
                external_ref=reservation_id,
                note=reason,
            )
            summary = account_summary_from_row(acct2.user_id, acct2.cash_available_cents, acct2.cash_reserved_cents, acct2.updated_at)
            response = {"applied": True, "summary": summary, "ledger_entry_id": ledger_id}
            cur.execute(
                """
                INSERT INTO reservations_applied (reservation_id, user_id, request_json, response_json)
                VALUES (%s, %s, %s::jsonb, %s::jsonb)
                """,
                (reservation_id, user_id, json.dumps(payload), json.dumps(response, default=str)),
            )
            return response


def release_cash(conn: psycopg.Connection, payload: dict[str, Any]) -> dict[str, Any]:
    reservation_id = payload["reservation_id"]
    user_id = payload["user_id"]
    amount_cents = int(payload["amount_cents"])
    reason = payload.get("reason")
    req_key = _request_key(payload)

    logger.info("release_cash reservation_id=%s user_id=%s amount_cents=%s", reservation_id, user_id, amount_cents)

    with conn.transaction():
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                "SELECT request_json, response_json FROM reservations_applied WHERE reservation_id = %s FOR UPDATE",
                (reservation_id,),
            )
            existing = cur.fetchone()
            if existing:
                if _request_key(existing["request_json"]) != req_key:
                    raise ConflictError("IDEMPOTENCY_KEY_CONFLICT", "reservation_id already used with different payload")
                return existing["response_json"]

            acct = _ensure_account_for_update(cur, user_id)
            if acct.cash_reserved_cents < amount_cents:
                raise ConflictError("INSUFFICIENT_FUNDS", "Cannot release more than reserved")
            acct2 = _update_account(
                cur,
                user_id,
                acct.cash_available_cents + amount_cents,
                acct.cash_reserved_cents - amount_cents,
            )
            ledger_id = _insert_ledger(
                cur,
                user_id=user_id,
                ts=_utcnow(),
                type_="RELEASE",
                ticker=None,
                qty=None,
                price_cents=None,
                amount_cents=amount_cents,
                fee_cents=0,
                cash_available_after_cents=acct2.cash_available_cents,
                cash_reserved_after_cents=acct2.cash_reserved_cents,
                position_qty_after=None,
                position_avg_cost_after_cents=None,
                external_ref=reservation_id,
                note=reason,
            )
            summary = account_summary_from_row(acct2.user_id, acct2.cash_available_cents, acct2.cash_reserved_cents, acct2.updated_at)
            response = {"applied": True, "summary": summary, "ledger_entry_id": ledger_id}
            cur.execute(
                """
                INSERT INTO reservations_applied (reservation_id, user_id, request_json, response_json)
                VALUES (%s, %s, %s::jsonb, %s::jsonb)
                """,
                (reservation_id, user_id, json.dumps(payload), json.dumps(response, default=str)),
            )
            return response


def list_positions(conn: psycopg.Connection, user_id: str) -> list[dict[str, Any]]:
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            SELECT ticker, qty, avg_cost_cents, realized_pnl_cents, created_at, updated_at
            FROM positions
            WHERE user_id = %s
            ORDER BY ticker ASC
            """,
            (user_id,),
        )
        return cur.fetchall()


def get_position(conn: psycopg.Connection, user_id: str, ticker: str) -> dict[str, Any]:
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            SELECT ticker, qty, avg_cost_cents, realized_pnl_cents, created_at, updated_at
            FROM positions
            WHERE user_id = %s AND ticker = %s
            """,
            (user_id, ticker.upper()),
        )
        row = cur.fetchone()
        if not row:
            raise NotFoundError("Position not found")
        return row


def encode_cursor(ts: datetime, id_: str) -> str:
    raw = f"{ts.isoformat()}|{id_}".encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")


def decode_cursor(cursor: str) -> tuple[datetime, str]:
    padded = cursor + "=" * (-len(cursor) % 4)
    raw = base64.urlsafe_b64decode(padded.encode("utf-8")).decode("utf-8")
    ts_s, id_ = raw.split("|", 1)
    ts = datetime.fromisoformat(ts_s.replace("Z", "+00:00"))
    return ts, id_


def list_ledger(
    conn: psycopg.Connection,
    user_id: str,
    *,
    limit: int,
    cursor: Optional[str],
    type_: Optional[str],
    from_ts: Optional[datetime],
    to_ts: Optional[datetime],
) -> tuple[list[dict[str, Any]], Optional[str]]:
    where = ["user_id = %s"]
    params: list[Any] = [user_id]

    if type_:
        where.append("type = %s")
        params.append(type_)
    if from_ts:
        where.append("ts >= %s")
        params.append(from_ts)
    if to_ts:
        where.append("ts <= %s")
        params.append(to_ts)
    if cursor:
        c_ts, c_id = decode_cursor(cursor)
        where.append("(ts, id) < (%s, %s)")
        params.extend([c_ts, c_id])

    sql = f"""
      SELECT id, ts, type, ticker, qty, price_cents, amount_cents,
             cash_available_after_cents, cash_reserved_after_cents,
             position_qty_after, position_avg_cost_after_cents,
             external_ref, note
      FROM ledger
      WHERE {' AND '.join(where)}
      ORDER BY ts DESC, id DESC
      LIMIT %s
    """
    params.append(limit)

    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(sql, params)
        rows = cur.fetchall()

    next_cursor = None
    if rows:
        last = rows[-1]
        next_cursor = encode_cursor(last["ts"], last["id"])
    return rows, next_cursor


