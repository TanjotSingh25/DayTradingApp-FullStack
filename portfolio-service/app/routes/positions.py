from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_user_id
from app.db import get_conn
from app.models import Position, PositionsResponse
from app.services.portfolio import NotFoundError, get_position, list_positions


router = APIRouter()


@router.get("/positions", response_model=PositionsResponse)
def positions(user_id: str = Depends(get_user_id)):
    conn = get_conn()
    try:
        rows = list_positions(conn, user_id)
        return {"positions": rows, "count": len(rows)}
    finally:
        conn.close()


@router.get("/positions/{ticker}", response_model=Position)
def position_by_ticker(ticker: str, user_id: str = Depends(get_user_id)):
    conn = get_conn()
    try:
        return get_position(conn, user_id, ticker)
    except NotFoundError:
        raise HTTPException(status_code=404, detail={"error": "NOT_FOUND", "message": "Position not found"})
    finally:
        conn.close()


