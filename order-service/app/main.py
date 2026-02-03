"""Order Service main application."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.db import init_schema, DatabaseConnectionError
from app.routes import health, orders, market

# Initialize schema on startup
try:
    init_schema()
except Exception as e:
    import logging
    logger = logging.getLogger("order.main")
    logger.warning(f"Schema init warning: {e}")

app = FastAPI(title="Order Service", version="1.0.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Exception handlers
@app.exception_handler(DatabaseConnectionError)
async def database_connection_handler(request, exc: DatabaseConnectionError):
    return JSONResponse(
        status_code=503,
        content={
            "error": "Service Unavailable",
            "message": str(exc),
            "type": "database_connection_error",
        },
    )


# Routes
app.include_router(health.router, tags=["health"])
app.include_router(orders.router, prefix="/api/v1", tags=["orders"])
app.include_router(market.router, prefix="/api/v1", tags=["market"])


@app.get("/")
def root():
    return {"service": "order-service", "version": "1.0.0"}

