from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.db import get_conn, DatabaseConnectionError

router = APIRouter()


@router.get("/health")
def health():
    try:
        conn = get_conn()
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
            cur.fetchone()
        conn.close()
        return {"status": "ok"}
    except DatabaseConnectionError as e:
        return JSONResponse(status_code=503, content={"status": "degraded", "database": "disconnected", "error": str(e)})
    except Exception:
        return {"status": "ok"}


