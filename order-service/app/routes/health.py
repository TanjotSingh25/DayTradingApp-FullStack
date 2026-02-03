from fastapi import APIRouter
from app.models import HealthResponse
from app.db import get_conn, DatabaseConnectionError

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
def health():
    """Health check endpoint."""
    try:
        conn = get_conn()
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
            cur.fetchone()
        conn.close()
        return {"status": "ok"}
    except DatabaseConnectionError:
        return {"status": "degraded"}

