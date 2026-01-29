## Portfolio Service (Wallet + Positions + Ledger)

FastAPI + PostgreSQL service that is the source of truth for:
- **Wallet** (cash available/reserved, in cents)
- **Positions** (qty + avg cost + realized P&L, in cents)
- **Ledger** (append-only audit trail)

### Run (Docker Compose)

This repo’s `docker-compose.yml` includes `portfolio-service` on port **8002**.

Required env vars (already set in compose):
- `DATABASE_URL=postgresql://postgres:postgres@postgres:5432/trading`
- `AUTH_SERVICE_URL=http://auth-service:8080`
- `JWT_SECRET=supersecretkey` (HS256 fallback verify)
- `INTERNAL_API_KEY=some-secret` (required for `/internal/*`)
- `CORS_ORIGINS=http://localhost:3000,http://localhost:5173`

Start:

```bash
docker compose up --build portfolio-service
```

Docs:
- OpenAPI UI: `http://localhost:8002/docs`

### External API (browser-facing)

Base path: `/api/v1`

Health:
- `GET /health`

Account:
- `GET /api/v1/account/summary`
- `POST /api/v1/account/deposit`
- `POST /api/v1/account/withdraw`

Positions:
- `GET /api/v1/positions`
- `GET /api/v1/positions/{ticker}`

Ledger:
- `GET /api/v1/ledger?limit=100&cursor=...&type=BUY&from=2025-01-01&to=2025-02-01`

All external endpoints require:
- `Authorization: Bearer <JWT>`

### Internal API (service-to-service)

Protected via header:
- `X-Internal-Api-Key: <INTERNAL_API_KEY>`

Endpoints:
- `POST /internal/apply-execution` (idempotent by `execution_id`)
- `POST /internal/reserve-cash` (idempotent by `reservation_id`)
- `POST /internal/release-cash` (idempotent by `reservation_id`)

### Curl examples (Postman-ready)

Set:

```bash
export TOKEN="YOUR_JWT"
export INTERNAL_KEY="some-secret"
```

Deposit:

```bash
curl -sS -X POST "http://localhost:8002/api/v1/account/deposit" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"amount_cents":500000,"note":"initial funding"}'
```

Withdraw:

```bash
curl -sS -X POST "http://localhost:8002/api/v1/account/withdraw" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"amount_cents":10000,"note":"cash out"}'
```

Positions:

```bash
curl -sS "http://localhost:8002/api/v1/positions" \
  -H "Authorization: Bearer $TOKEN"
```

Apply execution (BUY):

```bash
curl -sS -X POST "http://localhost:8002/internal/apply-execution" \
  -H "X-Internal-Api-Key: $INTERNAL_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "execution_id":"exec-1",
    "order_id":"order-1",
    "user_id":"user-123",
    "ticker":"AAPL",
    "side":"BUY",
    "fill_qty":5,
    "fill_price_cents":23107,
    "fee_cents":0,
    "ts":"2026-01-01T12:00:00Z"
  }'
```

Idempotency check (call again with same payload — no double apply):
```bash
curl -sS -X POST "http://localhost:8002/internal/apply-execution" \
  -H "X-Internal-Api-Key: $INTERNAL_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "execution_id":"exec-1",
    "order_id":"order-1",
    "user_id":"user-123",
    "ticker":"AAPL",
    "side":"BUY",
    "fill_qty":5,
    "fill_price_cents":23107,
    "fee_cents":0,
    "ts":"2026-01-01T12:00:00Z"
  }'
```

### Notes
- All money fields are **integer cents** (`BIGINT`).
- All write operations run in a **single DB transaction** with `FOR UPDATE` row locks.
- Ledger entries store **after-state balances** for audit/debugging.


