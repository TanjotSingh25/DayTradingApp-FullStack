/**
 * Hook for managing market data replay
 * WebSocket-only streaming (no REST bootstrap)
 * - tf is fixed to 5 minutes (backend default)
 * - stepSeconds defaults from chart config (can be overridden via options)
 * - auto-starts when ticker changes
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { buildReplayWsUrl } from "../api/marketData";
import type { Candle, WsMessage } from "../api/marketData";
import { DEFAULT_REPLAY_STEP_SECONDS } from "../components/MarketChart/chartConfig";

interface UseMarketReplayOptions {
  ticker: string | null;
  stepSeconds?: number;
}

interface UseMarketReplayReturn {
  candles: Candle[];
  status: string;
  error: string | null;
  disconnect: () => void;
}

const MAX_CANDLES = 500; // Rolling window size

export function useMarketReplay({
  ticker,
  stepSeconds = DEFAULT_REPLAY_STEP_SECONDS,
}: UseMarketReplayOptions): UseMarketReplayReturn {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const lastTickerRef = useRef<string | null>(null);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  // Auto-connect on ticker change (reset-per-symbol)
  useEffect(() => {
    // Always close existing WS on ticker change/unset
    disconnect();
    setCandles([]);
    setError(null);
    setStatus("");

    if (!ticker) {
      lastTickerRef.current = null;
      return;
    }

    lastTickerRef.current = ticker;
    setStatus("Connecting...");

    const wsUrl = buildReplayWsUrl({
      ticker,
      // backend default tf_min is 5; keep it implicit
      step_seconds: stepSeconds,
    });

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("Connected");
    };

    ws.onmessage = (event) => {
      try {
        const message: WsMessage = JSON.parse(event.data);

        if (message.type === "STATUS") {
          setStatus(message.message);
          if (message.message === "replay_complete") {
            disconnect();
          }
          return;
        }

        if (message.type === "CANDLE") {
          const newCandle = message.candle;
          setCandles((prev) => {
            const existingIndex = prev.findIndex((c) => c.ts === newCandle.ts);
            if (existingIndex >= 0) {
              const updated = [...prev];
              updated[existingIndex] = newCandle;
              return updated;
            }
            const updated = [...prev, newCandle];
            return updated.slice(-MAX_CANDLES);
          });
        }
      } catch {
        setError("Failed to parse WebSocket message");
      }
    };

    ws.onerror = () => {
      setError("WebSocket connection error");
    };

    ws.onclose = (event) => {
      // If user switched tickers, ignore noise.
      if (lastTickerRef.current !== ticker) return;
      if (event.code !== 1000 && event.code !== 1001) {
        setStatus(`Disconnected: ${event.reason || "unknown"}`);
      } else {
        setStatus("Disconnected");
      }
      wsRef.current = null;
    };

    return () => {
      ws.close();
    };
  }, [ticker, stepSeconds, disconnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    candles,
    status,
    error,
    disconnect,
  };
}
