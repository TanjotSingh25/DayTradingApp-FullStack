/**
 * Order Service API Client
 * Complete client for order management and tick processing
 */

import { ORDER_HTTP_BASE } from '../config/env';

export type Candle = {
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

export type MarketTickPayload = {
  ticker: string;
  tf_min: number;
  candle: Candle;
};

export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'MARKET' | 'LIMIT';
export type OrderStatus = 'OPEN' | 'FILLED' | 'CANCELLED' | 'REJECTED' | 'PARTIALLY_FILLED';

export interface PlaceOrderRequest {
  ticker: string;
  side: OrderSide;
  type: OrderType;
  qty: number;
  limit_price_dollars?: number;
  client_order_id?: string;
}

export interface Order {
  order_id: string;
  user_id: string;
  ticker: string;
  side: OrderSide;
  type: OrderType;
  qty: number;
  limit_price_cents: number | null;
  status: OrderStatus;
  filled_qty: number;
  avg_fill_price_cents: number | null;
  created_at: string;
  updated_at: string;
  client_order_id: string | null;
  reject_reason: string | null;
}

export interface OrdersResponse {
  orders: Order[];
  count: number;
  next_cursor?: string | null;
}

export interface Fill {
  fill_id: string;
  order_id: string;
  ticker: string;
  side: OrderSide;
  fill_qty: number;
  fill_price_cents: number;
  fee_cents: number;
  ts: string;
  tick_ts: string | null;
  portfolio_applied: boolean;
  portfolio_error: string | null;
}

export interface FillsResponse {
  fills: Fill[];
  count: number;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text();
    let errorMessage = `Order service request failed: ${response.status} ${response.statusText}`;
    try {
      const errorJson = JSON.parse(text);
      if (errorJson.detail?.message) {
        errorMessage = errorJson.detail.message;
      } else if (errorJson.error) {
        errorMessage = errorJson.error;
      }
    } catch {
      if (text) {
        errorMessage = text;
      }
    }
    throw new Error(errorMessage);
  }
  return response.json();
}

function getAuthHeaders(token: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

// Market tick endpoint
export async function postMarketTick(
  token: string,
  payload: MarketTickPayload,
  signal?: AbortSignal
): Promise<any> {
  const response = await fetch(`${ORDER_HTTP_BASE}/api/v1/market/tick`, {
    method: 'POST',
    headers: getAuthHeaders(token),
    body: JSON.stringify(payload),
    signal,
  });
  
  const result = await handleResponse<any>(response);
  
  // Treat duplicate ticks as non-fatal (backend returns processed: false)
  if (result.processed === false && result.reason === 'DUPLICATE_TICK') {
    // Return success but mark as duplicate
    return { ...result, _isDuplicate: true };
  }
  
  return result;
}

// Order management endpoints
export async function placeOrder(token: string, request: PlaceOrderRequest): Promise<Order> {
  const response = await fetch(`${ORDER_HTTP_BASE}/api/v1/orders`, {
    method: 'POST',
    headers: getAuthHeaders(token),
    body: JSON.stringify(request),
  });
  return handleResponse<Order>(response);
}

export async function listOrders(
  token: string,
  params?: {
    status?: OrderStatus;
    ticker?: string;
    limit?: number;
    cursor?: string;
  }
): Promise<OrdersResponse> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set('status', params.status);
  if (params?.ticker) searchParams.set('ticker', params.ticker);
  if (params?.limit) searchParams.set('limit', params.limit.toString());
  if (params?.cursor) searchParams.set('cursor', params.cursor);

  const url = `${ORDER_HTTP_BASE}/api/v1/orders${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
  const response = await fetch(url, {
    headers: getAuthHeaders(token),
  });
  return handleResponse<OrdersResponse>(response);
}

export async function getOrder(token: string, orderId: string): Promise<Order> {
  const response = await fetch(`${ORDER_HTTP_BASE}/api/v1/orders/${orderId}`, {
    headers: getAuthHeaders(token),
  });
  return handleResponse<Order>(response);
}

export async function cancelOrder(token: string, orderId: string): Promise<{ order_id: string; status: OrderStatus; cancelled_at: string }> {
  const response = await fetch(`${ORDER_HTTP_BASE}/api/v1/orders/${orderId}/cancel`, {
    method: 'POST',
    headers: getAuthHeaders(token),
  });
  return handleResponse<{ order_id: string; status: OrderStatus; cancelled_at: string }>(response);
}

export async function getOrderFills(token: string, orderId: string): Promise<FillsResponse> {
  const response = await fetch(`${ORDER_HTTP_BASE}/api/v1/orders/${orderId}/fills`, {
    headers: getAuthHeaders(token),
  });
  return handleResponse<FillsResponse>(response);
}
