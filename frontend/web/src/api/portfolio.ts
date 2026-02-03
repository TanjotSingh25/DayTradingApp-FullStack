/**
 * Portfolio Service API Client
 * Typed client for portfolio endpoints
 */

import { PORTFOLIO_HTTP_BASE } from '../config/env';

// Types
export interface AccountSummary {
  user_id: string;
  cash_available_cents: number;
  cash_reserved_cents: number;
  cash_total_cents: number;
  market_value_cents: number | null;
  equity_cents: number | null;
  updated_at: string;
}

export interface Position {
  ticker: string;
  qty: number;
  avg_cost_cents: number;
  realized_pnl_cents: number;
  created_at: string;
  updated_at: string;
}

export interface PositionsResponse {
  positions: Position[];
  count: number;
}

export type LedgerType = 'DEPOSIT' | 'WITHDRAWAL' | 'BUY' | 'SELL' | 'FEE' | 'ADJUSTMENT' | 'RESERVE' | 'RELEASE';

export interface LedgerEntry {
  id: string;
  ts: string;
  type: LedgerType;
  ticker: string | null;
  qty: number | null;
  price_cents: number | null;
  amount_cents: number;
  fee_cents: number;
  cash_available_after_cents: number;
  cash_reserved_after_cents: number;
  position_qty_after: number | null;
  position_avg_cost_after_cents: number | null;
  external_ref: string | null;
  note: string | null;
}

export interface LedgerResponse {
  entries: LedgerEntry[];
  next_cursor?: string | null;
}

export interface DepositRequest {
  amount_cents: number;
  note?: string;
}

export interface WithdrawRequest {
  amount_cents: number;
  note?: string;
}

export interface FundingResponse {
  summary: AccountSummary;
  ledger_entry_id: string;
}

export interface LedgerParams {
  limit?: number;
  type?: LedgerType;
  from?: string; // ISO date string
  to?: string; // ISO date string
  cursor?: string;
}

// Helper to create auth headers
function getAuthHeaders(token: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

// Helper to handle errors
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `Request failed: ${response.status} ${response.statusText}`;
    try {
      const errorJson = JSON.parse(errorText);
      if (errorJson.detail?.message) {
        errorMessage = errorJson.detail.message;
      } else if (errorJson.error) {
        errorMessage = errorJson.error;
      } else if (errorJson.detail) {
        errorMessage = typeof errorJson.detail === 'string' ? errorJson.detail : JSON.stringify(errorJson.detail);
      }
    } catch {
      if (errorText) {
        errorMessage = errorText;
      }
    }
    throw new Error(errorMessage);
  }
  return response.json();
}

// API Functions

export async function fetchSummary(token: string): Promise<AccountSummary> {
  const response = await fetch(`${PORTFOLIO_HTTP_BASE}/api/v1/account/summary`, {
    headers: getAuthHeaders(token),
  });
  return handleResponse<AccountSummary>(response);
}

export async function deposit(token: string, payload: DepositRequest): Promise<FundingResponse> {
  const response = await fetch(`${PORTFOLIO_HTTP_BASE}/api/v1/account/deposit`, {
    method: 'POST',
    headers: getAuthHeaders(token),
    body: JSON.stringify(payload),
  });
  return handleResponse<FundingResponse>(response);
}

export async function withdraw(token: string, payload: WithdrawRequest): Promise<FundingResponse> {
  const response = await fetch(`${PORTFOLIO_HTTP_BASE}/api/v1/account/withdraw`, {
    method: 'POST',
    headers: getAuthHeaders(token),
    body: JSON.stringify(payload),
  });
  return handleResponse<FundingResponse>(response);
}

export async function fetchPositions(token: string): Promise<PositionsResponse> {
  const response = await fetch(`${PORTFOLIO_HTTP_BASE}/api/v1/positions`, {
    headers: getAuthHeaders(token),
  });
  return handleResponse<PositionsResponse>(response);
}

export async function fetchLedger(token: string, params: LedgerParams = {}): Promise<LedgerResponse> {
  const searchParams = new URLSearchParams();
  if (params.limit !== undefined) {
    searchParams.set('limit', params.limit.toString());
  }
  if (params.type) {
    searchParams.set('type', params.type);
  }
  if (params.from) {
    searchParams.set('from', params.from);
  }
  if (params.to) {
    searchParams.set('to', params.to);
  }
  if (params.cursor) {
    searchParams.set('cursor', params.cursor);
  }

  const url = `${PORTFOLIO_HTTP_BASE}/api/v1/ledger${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
  const response = await fetch(url, {
    headers: getAuthHeaders(token),
  });
  return handleResponse<LedgerResponse>(response);
}

// Legacy export for backward compatibility
export { fetchSummary as fetchAccountSummary };
