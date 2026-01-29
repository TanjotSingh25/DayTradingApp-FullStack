/**
 * Market Data Service API Client
 * Typed client for REST and WebSocket endpoints
 */

import { MARKET_DATA_HTTP_BASE, MARKET_DATA_WS_BASE } from '../config/env';

// Types
export interface Candle {
  ticker: string;
  tf_min: number;
  ts: string; // ISO datetime string
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  openint: number;
}

export interface CandleResponse {
  data: Candle[];
  count: number;
}

export interface SymbolsResponse {
  symbols: string[];
  count: number;
}

export interface HealthResponse {
  status: string;
  database?: string;
}

export interface WsStatusMessage {
  type: 'STATUS';
  message: string;
  ticker: string;
  tf_min: number;
  step_seconds: number;
  total_candles: number;
}

export interface WsCandleMessage {
  type: 'CANDLE';
  seq: number;
  candle: Candle;
}

export type WsMessage = WsStatusMessage | WsCandleMessage;

// API Functions
export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch(`${MARKET_DATA_HTTP_BASE}/health`);
  if (!response.ok) {
    throw new Error(`Health check failed: ${response.statusText}`);
  }
  return response.json();
}

export async function fetchSymbols(
  limit: number = 100,
  prefix?: string
): Promise<SymbolsResponse> {
  const params = new URLSearchParams();
  params.set('limit', limit.toString());
  if (prefix) {
    params.set('prefix', prefix);
  }
  
  const response = await fetch(`${MARKET_DATA_HTTP_BASE}/symbols?${params}`);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch symbols: ${response.status} ${errorText}`);
  }
  return response.json();
}

export interface FetchCandlesParams {
  ticker: string;
  tf_min?: number;
  limit?: number;
  order?: 'asc' | 'desc';
}

export async function fetchCandles(
  params: FetchCandlesParams
): Promise<CandleResponse> {
  const urlParams = new URLSearchParams();
  urlParams.set('ticker', params.ticker);
  if (params.tf_min !== undefined) {
    urlParams.set('tf_min', params.tf_min.toString());
  }
  if (params.limit !== undefined) {
    urlParams.set('limit', params.limit.toString());
  }
  if (params.order) {
    urlParams.set('order', params.order);
  }
  
  const response = await fetch(`${MARKET_DATA_HTTP_BASE}/candles?${urlParams}`);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch candles: ${response.status} ${errorText}`);
  }
  return response.json();
}

export interface ReplayWsParams {
  ticker: string;
  tf_min?: number;
  step_seconds?: number;
}

export function buildReplayWsUrl(params: ReplayWsParams): string {
  const urlParams = new URLSearchParams();
  urlParams.set('ticker', params.ticker);
  if (params.tf_min !== undefined) {
    urlParams.set('tf_min', params.tf_min.toString());
  }
  if (params.step_seconds !== undefined) {
    urlParams.set('step_seconds', params.step_seconds.toString());
  }
  
  return `${MARKET_DATA_WS_BASE}/ws/replay?${urlParams}`;
}

