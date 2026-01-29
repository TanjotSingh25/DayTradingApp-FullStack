from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.db import get_conn, run_schema_init, DatabaseConnectionError
from app.routes.health import router as health_router
from app.routes.account import router as account_router
from app.routes.positions import router as positions_router
from app.routes.ledger import router as ledger_router
from app.routes.internal import router as internal_router


logging.basicConfig(level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO))


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Init schema on startup (idempotent)
    try:
        conn = get_conn()
        run_schema_init(conn)
        conn.close()
    except Exception as e:
        logging.getLogger("portfolio").error("Schema init failed: %s", str(e))
    yield


app = FastAPI(title="Portfolio Service", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(DatabaseConnectionError)
async def db_conn_handler(request, exc: DatabaseConnectionError):
    return JSONResponse(
        status_code=503,
        content={"error": "SERVICE_UNAVAILABLE", "message": str(exc)},
    )


app.include_router(health_router)
app.include_router(account_router, prefix="/api/v1")
app.include_router(positions_router, prefix="/api/v1")
app.include_router(ledger_router, prefix="/api/v1")
app.include_router(internal_router)  # internal is not under /api/v1 by spec


