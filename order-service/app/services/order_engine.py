"""Order execution engine - core trading logic."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

import psycopg
from psycopg.rows import dict_row

from app.services.portfolio_client import (
    apply_execution,
    InsufficientFundsError,
    InsufficientSharesError,
    PortfolioClientError,
)

logger = logging.getLogger("order.engine")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _dollars_to_cents(price: float) -> int:
    """Convert dollar price to cents, rounding to nearest cent."""
    return int(round(price * 100))


def _should_fill_market(side: str, candle_close_cents: int) -> tuple[bool, int]:
    """
    Determine if MARKET order should fill.
    Returns: (should_fill, fill_price_cents)
    """
    # MARKET orders always fill at candle close
    return True, candle_close_cents


def _should_fill_limit(
    side: str, limit_price_cents: int, candle_low_cents: int, candle_high_cents: int
) -> tuple[bool, int]:
    """
    Determine if LIMIT order should fill.
    Returns: (should_fill, fill_price_cents)
    
    Rules:
    - BUY limit: fills if candle.low <= limit_price (fill at limit)
    - SELL limit: fills if candle.high >= limit_price (fill at limit)
    """
    if side == "BUY":
        if candle_low_cents <= limit_price_cents:
            return True, limit_price_cents
    else:  # SELL
        if candle_high_cents >= limit_price_cents:
            return True, limit_price_cents
    
    return False, 0


def place_order(
    conn: psycopg.Connection,
    user_id: str,
    ticker: str,
    side: str,
    order_type: str,
    qty: int,
    limit_price_cents: Optional[int],
    client_order_id: Optional[str],
) -> dict:
    """
    Place a new order.
    
    Returns:
        Order dict with order_id, status, etc.
    """
    logger.info(
        "place_order user_id=%s ticker=%s side=%s type=%s qty=%s limit_price_cents=%s client_order_id=%s",
        user_id,
        ticker,
        side,
        order_type,
        qty,
        limit_price_cents,
        client_order_id,
    )

    # Check for duplicate client_order_id
    if client_order_id:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                "SELECT * FROM orders WHERE user_id = %s AND client_order_id = %s",
                (user_id, client_order_id),
            )
            existing = cur.fetchone()
            if existing:
                logger.info("Duplicate client_order_id found, returning existing order")
                return dict(existing)

    order_id = str(uuid4())
    now = _utcnow()

    with conn.transaction():
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                INSERT INTO orders (
                    order_id, user_id, ticker, side, type, qty, limit_price_cents,
                    status, filled_qty, created_at, updated_at, client_order_id
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING *
                """,
                (
                    order_id,
                    user_id,
                    ticker,
                    side,
                    order_type,
                    qty,
                    limit_price_cents,
                    "OPEN",
                    0,
                    now,
                    now,
                    client_order_id,
                ),
            )
            order = dict(cur.fetchone())

    logger.info("Order placed: order_id=%s", order_id)
    return order


def process_tick(
    conn: psycopg.Connection,
    user_id: str,
    ticker: str,
    tf_min: int,
    candle_ts: datetime,
    candle_open: float,
    candle_high: float,
    candle_low: float,
    candle_close: float,
    candle_volume: float,
) -> dict:
    """
    Process a market tick (candle) and attempt to fill open orders.
    
    Returns:
        Summary dict with processed, orders_checked, orders_filled, orders_rejected, fills
    """
    logger.info(
        "process_tick user_id=%s ticker=%s tf_min=%s candle_ts=%s close=%s",
        user_id,
        ticker,
        tf_min,
        candle_ts,
        candle_close,
    )

    # Build tick key for deduplication
    tick_key = f"{tf_min}:{candle_ts.isoformat()}"
    
    # Check for duplicate tick
    is_duplicate = False
    with conn.cursor() as cur:
        cur.execute(
            "SELECT 1 FROM tick_dedup WHERE user_id = %s AND ticker = %s AND tick_key = %s",
            (user_id, ticker, tick_key),
        )
        if cur.fetchone():
            is_duplicate = True
            logger.info("Duplicate tick detected, but will still evaluate orders for new fills")

    # Convert prices to cents
    candle_open_cents = _dollars_to_cents(candle_open)
    candle_high_cents = _dollars_to_cents(candle_high)
    candle_low_cents = _dollars_to_cents(candle_low)
    candle_close_cents = _dollars_to_cents(candle_close)

    # Load open orders for this user and ticker (FIFO: oldest first)
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            SELECT * FROM orders
            WHERE user_id = %s AND ticker = %s AND status = 'OPEN'
            ORDER BY created_at ASC
            FOR UPDATE
            """,
            (user_id, ticker),
        )
        open_orders = cur.fetchall()

    orders_checked = len(open_orders)
    orders_filled = 0
    orders_rejected = 0
    fills_summary = []

    # Process each order
    for order in open_orders:
        order_id = order["order_id"]
        side = order["side"]
        order_type = order["type"]
        qty = order["qty"]
        filled_qty = order["filled_qty"]
        remaining_qty = qty - filled_qty
        limit_price_cents = order.get("limit_price_cents")

        logger.info(
            "Checking order order_id=%s side=%s type=%s remaining_qty=%s",
            order_id,
            side,
            order_type,
            remaining_qty,
        )

        # Determine if order should fill
        should_fill = False
        fill_price_cents = 0

        if order_type == "MARKET":
            should_fill, fill_price_cents = _should_fill_market(side, candle_close_cents)
        elif order_type == "LIMIT":
            if limit_price_cents is None:
                logger.warning("LIMIT order missing limit_price_cents, skipping")
                continue
            should_fill, fill_price_cents = _should_fill_limit(
                side, limit_price_cents, candle_low_cents, candle_high_cents
            )

        if not should_fill:
            logger.info("Order does not fill on this tick")
            continue

        # Attempt to fill the order
        fill_qty = remaining_qty  # v1: fill entire remaining qty
        fill_id = str(uuid4())
        execution_id = str(uuid4())
        now = _utcnow()

        try:
            # Create fill record and call portfolio in a transaction
            with conn.transaction():
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        INSERT INTO fills (
                            fill_id, order_id, user_id, ticker, side,
                            fill_qty, fill_price_cents, fee_cents, ts, tick_ts,
                            external_execution_id, portfolio_applied
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        """,
                        (
                            fill_id,
                            order_id,
                            user_id,
                            ticker,
                            side,
                            fill_qty,
                            fill_price_cents,
                            0,  # fee_cents
                            now,
                            candle_ts,
                            execution_id,
                            False,
                        ),
                    )

                # Call portfolio service (outside transaction to avoid long locks)
                try:
                    portfolio_result = apply_execution(
                        execution_id=execution_id,
                        order_id=order_id,
                        user_id=user_id,
                        ticker=ticker,
                        side=side,
                        fill_qty=fill_qty,
                        fill_price_cents=fill_price_cents,
                        fee_cents=0,
                        ts=candle_ts.isoformat(),
                    )

                    # Mark fill as applied and update order in a new transaction
                    with conn.transaction():
                        with conn.cursor() as cur:
                            cur.execute(
                                "UPDATE fills SET portfolio_applied = TRUE WHERE fill_id = %s",
                                (fill_id,),
                            )

                            # Update order status
                            new_filled_qty = filled_qty + fill_qty
                            new_status = "FILLED" if new_filled_qty >= qty else "PARTIALLY_FILLED"
                            new_avg_price = fill_price_cents  # v1: simple average

                            cur.execute(
                                """
                                UPDATE orders
                                SET filled_qty = %s,
                                    avg_fill_price_cents = %s,
                                    status = %s,
                                    updated_at = %s
                                WHERE order_id = %s
                                """,
                                (new_filled_qty, new_avg_price, new_status, now, order_id),
                            )

                    orders_filled += 1
                    fills_summary.append(
                        {
                            "order_id": order_id,
                            "fill_qty": fill_qty,
                            "fill_price_cents": fill_price_cents,
                            "status": new_status,
                        }
                    )
                    logger.info(
                        "Order filled successfully order_id=%s fill_qty=%s fill_price_cents=%s",
                        order_id,
                        fill_qty,
                        fill_price_cents,
                    )

                except InsufficientFundsError:
                    logger.warning("Insufficient funds for order order_id=%s", order_id)
                    with conn.transaction():
                        with conn.cursor() as cur:
                            cur.execute(
                                """
                                UPDATE fills SET portfolio_error = %s WHERE fill_id = %s
                                """,
                                ("INSUFFICIENT_FUNDS", fill_id),
                            )
                            cur.execute(
                                """
                                UPDATE orders
                                SET status = 'REJECTED',
                                    reject_reason = 'INSUFFICIENT_FUNDS',
                                    updated_at = %s
                                WHERE order_id = %s
                                """,
                                (now, order_id),
                            )
                    orders_rejected += 1
                    fills_summary.append(
                        {
                            "order_id": order_id,
                            "fill_qty": fill_qty,
                            "fill_price_cents": fill_price_cents,
                            "status": "REJECTED",
                            "reason": "INSUFFICIENT_FUNDS",
                        }
                    )

                except InsufficientSharesError:
                    logger.warning("Insufficient shares for order order_id=%s", order_id)
                    with conn.transaction():
                        with conn.cursor() as cur:
                            cur.execute(
                                """
                                UPDATE fills SET portfolio_error = %s WHERE fill_id = %s
                                """,
                                ("INSUFFICIENT_SHARES", fill_id),
                            )
                            cur.execute(
                                """
                                UPDATE orders
                                SET status = 'REJECTED',
                                    reject_reason = 'INSUFFICIENT_SHARES',
                                    updated_at = %s
                                WHERE order_id = %s
                                """,
                                (now, order_id),
                            )
                    orders_rejected += 1
                    fills_summary.append(
                        {
                            "order_id": order_id,
                            "fill_qty": fill_qty,
                            "fill_price_cents": fill_price_cents,
                            "status": "REJECTED",
                            "reason": "INSUFFICIENT_SHARES",
                        }
                    )

                except PortfolioClientError as e:
                    logger.error("Portfolio service error for order order_id=%s: %s", order_id, str(e))
                    with conn.transaction():
                        with conn.cursor() as cur:
                            cur.execute(
                                """
                                UPDATE fills SET portfolio_error = %s WHERE fill_id = %s
                                """,
                                (str(e), fill_id),
                            )
                            # For v1, reject order to avoid stuck state
                            cur.execute(
                                """
                                UPDATE orders
                                SET status = 'REJECTED',
                                    reject_reason = 'PORTFOLIO_ERROR',
                                    updated_at = %s
                                WHERE order_id = %s
                                """,
                                (now, order_id),
                            )
                    orders_rejected += 1

        except Exception as e:
            logger.error("Unexpected error processing fill for order order_id=%s: %s", order_id, str(e))
            # Transaction will auto-rollback on exception
            continue

    # Record tick as processed (only if not already processed)
    if not is_duplicate:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO tick_dedup (user_id, ticker, tick_key, processed_at)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (user_id, ticker, tick_key) DO NOTHING
                """,
                (user_id, ticker, tick_key, _utcnow()),
            )
        conn.commit()
    else:
        # For duplicate ticks, we still processed orders, so commit any changes
        conn.commit()

    return {
        "processed": True,
        "ticker": ticker,
        "tick_ts": candle_ts.isoformat(),
        "orders_checked": orders_checked,
        "orders_filled": orders_filled,
        "orders_rejected": orders_rejected,
        "fills": fills_summary,
    }

