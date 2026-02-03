# Order Service (Trading Engine)

Order/Execution Service for the Day Trading Simulator. Handles order placement, execution, and fills based on market ticks (candles).

## Overview

The Order Service implements a tick-driven execution model:
- Frontend sends candles (ticks) as they arrive during replay
- Service processes open orders and determines fills based on candle prices
- Executions are applied atomically via Portfolio Service internal API
- Supports MARKET and LIMIT orders (BUY/SELL)

## Architecture

- **Tick-Driven Execution**: Frontend calls `/api/v1/market/tick` with each candle
- **Deterministic Fills**: MARKET fills at candle.close, LIMIT fills at limit price when crossed
- **Portfolio Integration**: Calls Portfolio Service `/internal/apply-execution` for atomic updates
- **Idempotency**: `client_order_id` prevents duplicate orders, `tick_dedup` prevents double-processing

## API Endpoints

### Health
- `GET /health` - Health check

### Orders
- `POST /api/v1/orders` - Place a new order
- `GET /api/v1/orders` - List orders (filters: status, ticker, limit, cursor)
- `GET /api/v1/orders/{order_id}` - Get order details
- `POST /api/v1/orders/{order_id}/cancel` - Cancel an open order
- `GET /api/v1/orders/{order_id}/fills` - Get fills for an order

### Market
- `POST /api/v1/market/tick` - Process a candle tick (drives executions)

All endpoints require `Authorization: Bearer <JWT>` header.

## Order Types

### MARKET Orders
- Fill immediately at candle.close price
- No limit price required

### LIMIT Orders
- BUY limit: fills when `candle.low <= limit_price` (fills at limit_price)
- SELL limit: fills when `candle.high >= limit_price` (fills at limit_price)
- Requires `limit_price_dollars` in request

## Order Statuses

- `OPEN` - Order is active and waiting to fill
- `FILLED` - Order fully executed
- `PARTIALLY_FILLED` - Order partially executed (v1 fills entire qty, so this is rare)
- `CANCELLED` - Order cancelled by user
- `REJECTED` - Order rejected (insufficient funds/shares, portfolio error)

## Testing with Postman/curl

### 1. Login and Get JWT

```bash
curl -X POST http://localhost:8080/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"pass123"}'

# Response: {"token":"...", "username":"testuser"}
# Save the token for subsequent requests
```

### 2. Deposit Funds (Portfolio Service)

```bash
TOKEN="your-jwt-token-here"

curl -X POST http://localhost:8002/api/v1/account/deposit \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount_cents": 1000000,
    "note": "initial funding"
  }'
```

### 3. Place a MARKET BUY Order

```bash
curl -X POST http://localhost:8003/api/v1/orders \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "ticker": "AAPL",
    "side": "BUY",
    "type": "MARKET",
    "qty": 10
  }'

# Response includes order_id - save it
```

### 4. Place a LIMIT BUY Order

```bash
curl -X POST http://localhost:8003/api/v1/orders \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "ticker": "AAPL",
    "side": "BUY",
    "type": "LIMIT",
    "qty": 5,
    "limit_price_dollars": 230.00
  }'
```

### 5. Process a Market Tick (Candle)

```bash
curl -X POST http://localhost:8003/api/v1/market/tick \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "ticker": "AAPL",
    "tf_min": 5,
    "candle": {
      "ts": "2025-01-29T15:30:00Z",
      "open": 231.07,
      "high": 232.19,
      "low": 230.84,
      "close": 231.18,
      "volume": 2122371
    }
  }'

# Response shows orders_checked, orders_filled, fills array
```

### 6. Check Order Status

```bash
ORDER_ID="your-order-id-here"

curl http://localhost:8003/api/v1/orders/$ORDER_ID \
  -H "Authorization: Bearer $TOKEN"
```

### 7. List Filled Orders

```bash
curl "http://localhost:8003/api/v1/orders?status=FILLED" \
  -H "Authorization: Bearer $TOKEN"
```

### 8. Get Fills for an Order

```bash
curl http://localhost:8003/api/v1/orders/$ORDER_ID/fills \
  -H "Authorization: Bearer $TOKEN"
```

### 9. Cancel an Order

```bash
curl -X POST http://localhost:8003/api/v1/orders/$ORDER_ID/cancel \
  -H "Authorization: Bearer $TOKEN"
```

## Example Flow

1. **User deposits $10,000** → Portfolio shows `cash_available_cents: 1000000`

2. **User places MARKET BUY for 10 shares of AAPL**
   ```json
   {
     "ticker": "AAPL",
     "side": "BUY",
     "type": "MARKET",
     "qty": 10
   }
   ```
   → Order created with `status: "OPEN"`

3. **Frontend receives candle with close=$231.18** → Calls `/api/v1/market/tick`

4. **Order fills at $231.18**
   - Fill record created
   - Portfolio Service called: `apply-execution` with `fill_price_cents: 23118`
   - Portfolio updates: cash decreases by $2,311.80, position increases by 10 shares
   - Order status → `FILLED`

5. **User checks portfolio** → Sees 10 shares of AAPL, cash reduced

## Error Handling

### Insufficient Funds
- When BUY order tries to fill but user lacks cash
- Order status → `REJECTED`, `reject_reason: "INSUFFICIENT_FUNDS"`

### Insufficient Shares
- When SELL order tries to fill but user lacks position
- Order status → `REJECTED`, `reject_reason: "INSUFFICIENT_SHARES"`

### Duplicate Tick
- If same tick is sent twice, returns `processed: false, reason: "DUPLICATE_TICK"`
- Prevents double-filling

### Duplicate Order
- If `client_order_id` is reused, returns existing order (idempotent)

## Environment Variables

- `DATABASE_URL` - PostgreSQL connection string
- `AUTH_SERVICE_URL` - Auth service URL (default: `http://auth-service:8080`)
- `JWT_SECRET` - JWT secret for local verification (optional)
- `PORTFOLIO_INTERNAL_BASE` - Portfolio service internal API base URL
- `PORTFOLIO_INTERNAL_KEY` - Internal API key for portfolio service
- `CORS_ORIGINS` - Comma-separated CORS origins
- `SERVICE_PORT` - Service port (default: 8003)

## Database Schema

### orders
- Stores order details, status, fill progress
- Indexed by `(user_id, status, created_at)` and `(user_id, ticker, status)`

### fills
- Stores execution records (one per fill)
- Links to orders via `order_id`
- Contains `external_execution_id` for portfolio idempotency

### tick_dedup
- Prevents double-processing of same tick
- Primary key: `(user_id, ticker, tick_key)`

## Docker

```bash
# Build
docker-compose build order-service

# Start
docker-compose up order-service

# View logs
docker-compose logs -f order-service
```

## OpenAPI Docs

Once running, visit:
- `http://localhost:8003/docs` - Swagger UI
- `http://localhost:8003/redoc` - ReDoc

