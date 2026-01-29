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
  // Fallback for other environments
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

