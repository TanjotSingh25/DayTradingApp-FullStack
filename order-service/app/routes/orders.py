"""Order management endpoints."""
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from datetime import datetime

from app.auth import UserIdDep
from app.db import get_conn
from app.models import (
    PlaceOrderRequest,
    OrderResponse,
    OrdersResponse,
    FillsResponse,
    CancelOrderResponse,
    ErrorResponse,
)
from app.services.order_engine import place_order, _dollars_to_cents
from psycopg.rows import dict_row

router = APIRouter()


@router.post("/orders", response_model=OrderResponse)
def create_order(req: PlaceOrderRequest, user_id: str = UserIdDep):
    """Place a new order."""
    conn = get_conn()
    try:
        # Validate LIMIT order has limit_price
        limit_price_cents = None
        if req.type == "LIMIT":
            if req.limit_price_dollars is None or req.limit_price_dollars <= 0:
                raise HTTPException(
                    status_code=400,
                    detail={"error": "INVALID_REQUEST", "message": "LIMIT orders require limit_price_dollars > 0"},
                )
            limit_price_cents = _dollars_to_cents(req.limit_price_dollars)

        order = place_order(
            conn=conn,
            user_id=user_id,
            ticker=req.ticker.upper().strip(),
            side=req.side,
            order_type=req.type,
            qty=req.qty,
            limit_price_cents=limit_price_cents,
            client_order_id=req.client_order_id,
        )

        return OrderResponse(**order)
    finally:
        conn.close()


@router.get("/orders", response_model=OrdersResponse)
def list_orders(
    user_id: str = UserIdDep,
    status: Optional[str] = Query(None, regex="^(OPEN|FILLED|CANCELLED|REJECTED|PARTIALLY_FILLED)$"),
    ticker: Optional[str] = None,
    limit: int = Query(50, ge=1, le=500),
    cursor: Optional[str] = None,
):
    """List orders for the authenticated user."""
    conn = get_conn()
    try:
        with conn.cursor(row_factory=dict_row) as cur:
            conditions = ["user_id = %s"]
            params = [user_id]

            if status:
                conditions.append("status = %s")
                params.append(status)

            if ticker:
                conditions.append("ticker = %s")
                params.append(ticker.upper().strip())

            if cursor:
                # Simple cursor: use order_id (for v1)
                conditions.append("order_id > %s")
                params.append(cursor)

            where_clause = " AND ".join(conditions)
            query = f"""
                SELECT * FROM orders
                WHERE {where_clause}
                ORDER BY created_at DESC
                LIMIT %s
            """
            params.append(limit + 1)  # Fetch one extra to check for more

            cur.execute(query, params)
            orders = cur.fetchall()

            next_cursor = None
            if len(orders) > limit:
                orders = orders[:limit]
                next_cursor = orders[-1]["order_id"]

            return OrdersResponse(
                orders=[OrderResponse(**order) for order in orders],
                count=len(orders),
                next_cursor=next_cursor,
            )
    finally:
        conn.close()


@router.get("/orders/{order_id}", response_model=OrderResponse)
def get_order(order_id: str, user_id: str = UserIdDep):
    """Get order details."""
    conn = get_conn()
    try:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                "SELECT * FROM orders WHERE order_id = %s AND user_id = %s",
                (order_id, user_id),
            )
            order = cur.fetchone()
            if not order:
                raise HTTPException(status_code=404, detail={"error": "NOT_FOUND", "message": "Order not found"})
            return OrderResponse(**order)
    finally:
        conn.close()


@router.post("/orders/{order_id}/cancel", response_model=CancelOrderResponse)
def cancel_order(order_id: str, user_id: str = UserIdDep):
    """Cancel an open order."""
    conn = get_conn()
    try:
        with conn.transaction():
            with conn.cursor(row_factory=dict_row) as cur:
                # Check order exists and belongs to user
                cur.execute(
                    "SELECT * FROM orders WHERE order_id = %s AND user_id = %s FOR UPDATE",
                    (order_id, user_id),
                )
                order = cur.fetchone()
                if not order:
                    raise HTTPException(status_code=404, detail={"error": "NOT_FOUND", "message": "Order not found"})

                if order["status"] != "OPEN":
                    raise HTTPException(
                        status_code=400,
                        detail={"error": "INVALID_STATE", "message": f"Order is {order['status']}, cannot cancel"},
                    )

                # Update status
                now = datetime.now()
                cur.execute(
                    "UPDATE orders SET status = 'CANCELLED', updated_at = %s WHERE order_id = %s",
                    (now, order_id),
                )

                return CancelOrderResponse(
                    order_id=order_id,
                    status="CANCELLED",
                    cancelled_at=now,
                )
    finally:
        conn.close()


@router.get("/orders/{order_id}/fills", response_model=FillsResponse)
def get_order_fills(order_id: str, user_id: str = UserIdDep):
    """Get fills (executions) for an order."""
    conn = get_conn()
    try:
        with conn.cursor(row_factory=dict_row) as cur:
            # Verify order belongs to user
            cur.execute("SELECT 1 FROM orders WHERE order_id = %s AND user_id = %s", (order_id, user_id))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail={"error": "NOT_FOUND", "message": "Order not found"})

            cur.execute(
                """
                SELECT * FROM fills
                WHERE order_id = %s
                ORDER BY ts DESC
                """,
                (order_id,),
            )
            fills = cur.fetchall()

            from app.models import FillResponse

            return FillsResponse(
                fills=[FillResponse(**fill) for fill in fills],
                count=len(fills),
            )
    finally:
        conn.close()

