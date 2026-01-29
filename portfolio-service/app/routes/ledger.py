from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.auth import get_user_id
from app.db import get_conn
from app.models import LedgerResponse
from app.services.portfolio import list_ledger


router = APIRouter()


@router.get("/ledger", response_model=LedgerResponse)
def ledger(
    limit: int = Query(default=100, ge=1, le=500),
    cursor: Optional[str] = Query(default=None),
    type: Optional[str] = Query(default=None),
    from_: Optional[str] = Query(default=None, alias="from"),
    to: Optional[str] = Query(default=None),
    user_id: str = Depends(get_user_id),
):
    from_ts = datetime.fromisoformat(from_.replace("Z", "+00:00")) if from_ else None
    to_ts = datetime.fromisoformat(to.replace("Z", "+00:00")) if to else None

    conn = get_conn()
    try:
        rows, next_cursor = list_ledger(
            conn,
            user_id,
            limit=limit,
            cursor=cursor,
            type_=type,
            from_ts=from_ts,
            to_ts=to_ts,
        )
        return {"entries": rows, "next_cursor": next_cursor}
    finally:
        conn.close()


