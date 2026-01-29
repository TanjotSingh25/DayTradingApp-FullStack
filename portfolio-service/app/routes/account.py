from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_user_id
from app.db import get_conn
from app.models import AccountSummary, DepositRequest, WithdrawRequest, FundingResponse
from app.services.portfolio import ConflictError, deposit, withdraw, get_summary


router = APIRouter()


@router.get("/account/summary", response_model=AccountSummary)
def account_summary(user_id: str = Depends(get_user_id)):
    conn = get_conn()
    try:
        return get_summary(conn, user_id)
    finally:
        conn.close()


@router.post("/account/deposit", response_model=FundingResponse)
def account_deposit(req: DepositRequest, user_id: str = Depends(get_user_id)):
    conn = get_conn()
    try:
        summary, ledger_id = deposit(conn, user_id, req.amount_cents, req.note)
        return {"summary": summary, "ledger_entry_id": ledger_id}
    finally:
        conn.close()


@router.post("/account/withdraw", response_model=FundingResponse)
def account_withdraw(req: WithdrawRequest, user_id: str = Depends(get_user_id)):
    conn = get_conn()
    try:
        summary, ledger_id = withdraw(conn, user_id, req.amount_cents, req.note)
        return {"summary": summary, "ledger_entry_id": ledger_id}
    except ConflictError as e:
        raise HTTPException(status_code=409, detail={"error": e.code, "message": e.message})
    finally:
        conn.close()


