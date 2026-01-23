# Market Data Service

A FastAPI microservice that exposes REST endpoints to list tickers and query historical candles, and a WebSocket endpoint that replays candles at accelerated speed.

## Features

- **REST API**: List tickers and query historical candle data
- **WebSocket Replay**: Replay candles from candle 0 at accelerated speed (e.g., one 5-minute candle every 15 seconds)
- **Reset-per-symbol**: Switching ticker means new WebSocket connection and replay starts from the first candle
- **Testable**: Works with Postman (REST) and WebSocket tools

## Tech Stack

- Python 3.11+
- FastAPI + Uvicorn
- psycopg3 (synchronous)
- PostgreSQL/TimescaleDB

## Setup

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Environment Configuration

Copy `.env.example` to `.env` and configure your database connection:

```bash
cp .env.example .env
```

Edit `.env` and set your `DATABASE_URL`:

```
DATABASE_URL=postgresql://user:password@localhost:5432/dbname
```

### 3. Database Schema

Ensure your PostgreSQL database has a `candles` table with the following schema:

```sql
CREATE TABLE candles (
    ticker TEXT NOT NULL,
    tf_min SMALLINT NOT NULL,
    ts TIMESTAMP NOT NULL,
    open DOUBLE PRECISION NOT NULL,
    high DOUBLE PRECISION NOT NULL,
    low DOUBLE PRECISION NOT NULL,
    close DOUBLE PRECISION NOT NULL,
    volume DOUBLE PRECISION NOT NULL,
    openint BIGINT NOT NULL,
    PRIMARY KEY (ticker, tf_min, ts)
);
```

### 4. Run the Service

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The service will be available at `http://localhost:8000`

API documentation is available at `http://localhost:8000/docs`

## API Endpoints

### REST Endpoints

#### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "ok"
}
```

**Example (Postman):**
```
GET http://localhost:8000/health
```

#### GET /symbols

List available ticker symbols.

**Query Parameters:**
- `limit` (optional, default: 100, max: 5000): Maximum number of symbols to return
- `prefix` (optional): Filter symbols by prefix (case-insensitive)

**Response:**
```json
{
  "symbols": ["AAPL.US", "MSFT.US", "GOOGL.US"],
  "count": 3
}
```

**Example (Postman):**
```
GET http://localhost:8000/symbols?limit=20
GET http://localhost:8000/symbols?limit=50&prefix=AAPL
```

#### GET /candles

Get historical candles for a ticker.

**Query Parameters:**
- `ticker` (required): Ticker symbol
- `tf_min` (optional, default: 5): Timeframe in minutes
- `limit` (optional, default: 200, max: 5000): Maximum number of candles
- `order` (optional, default: "asc"): Sort order - "asc" or "desc"

**Response:**
```json
{
  "data": [
    {
      "ticker": "AAPL.US",
      "tf_min": 5,
      "ts": "2024-01-01T09:30:00",
      "open": 150.0,
      "high": 151.0,
      "low": 149.5,
      "close": 150.5,
      "volume": 1000000.0,
      "openint": 0
    }
  ],
  "count": 1
}
```

**Example (Postman):**
```
GET http://localhost:8000/candles?ticker=AAPL.US&tf_min=5&limit=200&order=asc
```

#### GET /candles/range

Get candles for a ticker within a time range.

**Query Parameters:**
- `ticker` (required): Ticker symbol
- `tf_min` (optional, default: 5): Timeframe in minutes
- `start` (required): Start timestamp in ISO format (e.g., "2024-01-01T09:30:00")
- `end` (required): End timestamp in ISO format (e.g., "2024-01-01T16:00:00")
- `limit` (optional, default: 5000, max: 5000): Maximum number of candles

**Example (Postman):**
```
GET http://localhost:8000/candles/range?ticker=AAPL.US&tf_min=5&start=2024-01-01T09:30:00&end=2024-01-01T16:00:00
```

### WebSocket Endpoint

#### WS /ws/replay

Replay candles at accelerated speed. Each connection starts from candle 0.

**Query Parameters:**
- `ticker` (required): Ticker symbol
- `tf_min` (optional, default: 5): Timeframe in minutes
- `step_seconds` (optional, default: 15, min: 1, max: 60): Seconds to wait between candles

**Message Types:**

1. **STATUS Message** (sent at start and completion):
```json
{
  "type": "STATUS",
  "message": "replay_starting",
  "ticker": "AAPL.US",
  "tf_min": 5,
  "step_seconds": 15,
  "total_candles": 100
}
```

2. **CANDLE Message** (sent for each candle):
```json
{
  "type": "CANDLE",
  "candle": {
    "ticker": "AAPL.US",
    "tf_min": 5,
    "ts": "2024-01-01T09:30:00",
    "open": 150.0,
    "high": 151.0,
    "low": 149.5,
    "close": 150.5,
    "volume": 1000000.0,
    "openint": 0
  },
  "seq": 0
}
```

**Example (wscat):**

Install wscat (Node.js tool):
```bash
npm install -g wscat
```

Connect to WebSocket:
```bash
wscat -c "ws://localhost:8000/ws/replay?ticker=AAPL.US&tf_min=5&step_seconds=2"
```

**Behavior:**
- On connect, the service loads all candles for the specified ticker and timeframe
- Sends a STATUS message with total_candles count
- Replays candles sequentially, sending one CANDLE message every `step_seconds`
- Each CANDLE message includes a `seq` field (0-based index)
- When finished, sends STATUS message with "replay_complete" and closes gracefully
- **Reset-per-symbol**: Each new WebSocket connection starts from candle 0. Switching tickers requires a new connection.

**Notes:**
- Replay is accelerated; each message represents one 5-minute candle (or whatever `tf_min` is set to)
- The `step_seconds` parameter controls how fast candles are replayed (e.g., 2 seconds = one 5-minute candle every 2 seconds)
- If no candles are found, a STATUS message is sent and the connection is closed with code 1008

## Error Handling

- **404 Not Found**: Returned when a ticker has no candles
- **400 Bad Request**: Returned for invalid request parameters
- **422 Unprocessable Entity**: Returned for validation errors
- **500 Internal Server Error**: Returned for database or server errors

Error responses follow this format:
```json
{
  "error": "Error message here"
}
```

## Configuration

Environment variables (see `.env.example`):

- `DATABASE_URL` (required): PostgreSQL connection string
- `DEFAULT_TF_MIN` (default: 5): Default timeframe in minutes
- `MAX_LIMIT` (default: 5000): Maximum limit for queries
- `WS_DEFAULT_STEP_SECONDS` (default: 15): Default seconds between candles in WebSocket replay
- `WS_MAX_STEP_SECONDS` (default: 60): Maximum seconds between candles
- `WS_MIN_STEP_SECONDS` (default: 1): Minimum seconds between candles

## Development

The service uses FastAPI's automatic documentation:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## License

MIT

