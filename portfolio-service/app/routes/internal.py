from fastapi import APIRouter, Depends, HTTPException

from app.auth import require_internal_key
from app.db import get_conn
from app.models import (
    ApplyExecutionRequest,
    ApplyExecutionResponse,
    ReserveCashRequest,
    ReserveCashResponse,
    ReleaseCashRequest,
    ReleaseCashResponse,
    InitAccountRequest,
    InitAccountResponse,
)
from app.services.portfolio import ConflictError, apply_execution, reserve_cash, release_cash, init_account


router = APIRouter()


@router.post("/internal/apply-execution", response_model=ApplyExecutionResponse)
def internal_apply_execution(req: ApplyExecutionRequest, _: None = Depends(require_internal_key)):
    conn = get_conn()
    try:
        payload = req.model_dump()
        result = apply_execution(conn, payload)
        return result
    except ConflictError as e:
        raise HTTPException(status_code=409, detail={"error": e.code, "message": e.message})
    finally:
        conn.close()


@router.post("/internal/reserve-cash", response_model=ReserveCashResponse)
def internal_reserve_cash(req: ReserveCashRequest, _: None = Depends(require_internal_key)):
    conn = get_conn()
    try:
        result = reserve_cash(conn, req.model_dump())
        return result
    except ConflictError as e:
        raise HTTPException(status_code=409, detail={"error": e.code, "message": e.message})
    finally:
        conn.close()


@router.post("/internal/release-cash", response_model=ReleaseCashResponse)
def internal_release_cash(req: ReleaseCashRequest, _: None = Depends(require_internal_key)):
    conn = get_conn()
    try:
        result = release_cash(conn, req.model_dump())
        return result
    except ConflictError as e:
        raise HTTPException(status_code=409, detail={"error": e.code, "message": e.message})
    finally:
        conn.close()


@router.post("/internal/init-account", response_model=InitAccountResponse)
def internal_init_account(req: InitAccountRequest, _: None = Depends(require_internal_key)):
    """
    Initialize a portfolio account for a user.
    Idempotent: if account already exists, returns existing account.
    Called by auth-service after user registration.
    """
    conn = get_conn()
    try:
        created, summary = init_account(conn, req.user_id)
        return InitAccountResponse(created=created, summary=summary)
    finally:
        conn.close()


