/**
 * Environment configuration for Market Data Service
 * Supports Vite (import.meta.env) with VITE_ prefix
 */

// Get environment variables with fallback defaults
const getEnvVar = (key: string, defaultValue: string): string => {
  // Vite uses import.meta.env
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return import.meta.env[key] || defaultValue;
  }
  // CRA/Node-style env (best-effort)
  const anyGlobal = globalThis as any;
  if (anyGlobal?.process?.env && typeof anyGlobal.process.env[key] === 'string') {
    return anyGlobal.process.env[key] as string;
  }
  // Fallback for other environments
  return defaultValue;
};

const getEnvVarCompat = (viteKey: string, craKey: string, defaultValue: string): string => {
  const viteVal = getEnvVar(viteKey, '');
  if (viteVal) return viteVal;
  const craVal = getEnvVar(craKey, '');
  if (craVal) return craVal;
  return defaultValue;
};

export const MARKET_DATA_HTTP_BASE = getEnvVar(
  'VITE_MARKET_DATA_HTTP_BASE',
  'http://localhost:8000'
);

export const MARKET_DATA_WS_BASE = getEnvVar(
  'VITE_MARKET_DATA_WS_BASE',
  'ws://localhost:8000'
);

export const PORTFOLIO_HTTP_BASE = getEnvVarCompat(
  'VITE_PORTFOLIO_HTTP_BASE',
  'REACT_APP_PORTFOLIO_HTTP_BASE',
  'http://localhost:8002'
);

export const ORDER_HTTP_BASE = getEnvVarCompat(
  'VITE_ORDER_HTTP_BASE',
  'REACT_APP_ORDER_HTTP_BASE',
  'http://localhost:8003'
);

