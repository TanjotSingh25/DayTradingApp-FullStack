# User Service

Python Flask microservice for managing user profiles and preferences.

## Features

- **User Profiles**: Non-sensitive identity metadata (display name, email, timezone, country)
- **User Preferences**: Trading preferences, UI settings, risk preferences, favorite symbols
- **JWT Authentication**: All endpoints require valid JWT tokens from the Authentication Service

## Authentication

All endpoints (except `/health`) require JWT authentication. Include the token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

Users can only access their own data - the username in the token must match the username in the route parameter.

## API Endpoints

### Health Check
- `GET /health` - Service health check

### User Profile

- `GET /profile/<username>` - Get user profile (requires auth, username must match token)
- `PUT /profile/<username>` - Update user profile (requires auth, username must match token)
- `POST /profile/internal` - Internal endpoint for service-to-service calls (requires X-Service-Key header)
  - Automatically called by auth service during user registration

**Profile Fields:**
- `username` (required, unique)
- `display_name`
- `email`
- `timezone` (default: UTC)
- `country`
- `created_at` (auto-generated)
- `updated_at` (auto-generated)

### User Preferences

- `GET /preferences/<username>` - Get user preferences (requires auth, returns defaults if none exist)
- `PUT /preferences/<username>` - Update user preferences (requires auth, username must match token)
- `POST /preferences/<username>/favorites` - Add symbol to favorites (requires auth, username must match token)
- `DELETE /preferences/<username>/favorites/<symbol>` - Remove symbol from favorites (requires auth, username must match token)

**Preferences Structure:**
```json
{
  "username": "string",
  "default_order_qty": 100,
  "favorite_symbols": ["AAPL", "TSLA"],
  "confirm_market_orders": true,
  "ui_preferences": {
    "dark_mode": false,
    "layout": "default"
  },
  "risk_preferences": {
    "soft_limit_warning": true,
    "max_position_size": 10000
  },
  "updated_at": "timestamp"
}
```

## Environment Variables

- `MONGO_URI` - MongoDB connection string (default: `mongodb://mongodb:27017`)
- `DB_NAME` - Database name (default: `userdb`)
- `PORT` - Service port (default: `8081`)
- `JWT_SECRET` - JWT secret key (must match Authentication Service secret, default: `supersecretkey`)
- `SERVICE_SECRET` - Service-to-service authentication key (default: `service-secret-key`)

## Running with Docker

```bash
docker-compose up user-service
```

## Running Locally

```bash
pip install -r requirements.txt
python userservices.py
```

## Database Collections

- `user_profiles` - User profile data
- `user_preferences` - User preferences data

Both collections use `username` as the unique identifier.

