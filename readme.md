## 📈 Day Trading Simulator – Microservices Architecture

This project is a day trading simulator built with a microservices architecture. The goal is to simulate real-world stock trading experiences, allowing users to:

-   **Create and manage user accounts**
-   **Add virtual money to their accounts**
-   **View real-time or near real-time stock data (e.g., delayed by a few minutes or hours)**
-   **Simulate buying and selling of stocks just like in actual trading platforms**

The system is designed with scalability and modularity in mind using **Docker**, **Nginx**, **MongoDB**, **React**, and **TypeScript**. Real stock market data will be fetched using reliable public APIs (supporting both real-time and historical data).

## 🚀 Quick Start

### Prerequisites
- Docker and Docker Compose installed
- Node.js 20+ (for local frontend development)

### Running with Docker Compose

1. **Start all services:**
   ```bash
   docker-compose up --build
   ```

2. **Access the application:**
   - Frontend: http://localhost:3000
   - Auth Service API: http://localhost:8080

3. **Stop all services:**
   ```bash
   docker-compose down
   ```

### Local Development

#### Frontend Development
```bash
cd frontend/web
npm install
npm run dev
```
The frontend will be available at http://localhost:5173 (Vite default port)

#### Authentication Service
The authentication service runs in Docker. To rebuild after changes:
```bash
docker-compose up --build auth-service
```

### 🔧 Current Services

1. **Frontend (React + TypeScript)**
   - Modern React application with TypeScript
   - Login and registration pages
   - Protected routes with JWT authentication
   - Responsive UI with modern design

2. **Authentication Service (Golang)**
   - User registration and login
   - JWT-based session management
   - MongoDB for user data storage
   - RESTful API endpoints

3. **MongoDB**
   - Database for authentication service

### 🔧 Planned Microservices

1. **User Account Service**
   Manages user profiles, account balances, and transaction history.

2. **Stock Market Data Service**
   Fetches real or delayed stock price data from an external API and caches it for use.

3. **Trade Execution Service**
   Simulates the buying and selling of stocks, updates balances, and manages virtual portfolios.

4. **Portfolio Management Service**
   Displays a user's current holdings, stock performance, and virtual portfolio value.

5. **Risk Engine**
   Validates orders and enforces trading limits.

6. **Analytics Service**
   Provides PnL calculations and trading statistics.

## 📁 Project Structure

```
day-trading-simulator/
├── frontend/
│   └── web/              # React + TypeScript frontend
│       ├── src/
│       │   ├── components/   # React components
│       │   ├── contexts/     # React contexts (Auth)
│       │   └── services/     # API services
│       ├── Dockerfile
│       └── nginx.conf
├── AuthenticationService/    # Golang auth service
├── docker-compose.yml
└── readme.md
```

## 🔐 Authentication API Endpoints

- `POST /register` - Register a new user (requires: username, password, name)
- `POST /login` - Login user (returns: token, username)
- `GET /authinfo/{username}` - Get user info (requires JWT)
- `PUT /authinfo/update` - Update user info (requires JWT)

## 🛠️ Tech Stack

- **Frontend:** React 19, TypeScript, Vite, React Router
- **Backend:** Golang, MongoDB
- **DevOps:** Docker, Docker Compose, Nginx
- **Architecture:** Microservices, RESTful APIs

For more details, see `day_trading_simulator_roadmap.txt`.
