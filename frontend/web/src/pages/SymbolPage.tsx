import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import CandlestickChart from "../components/MarketChart/CandlestickChart";
import VolumeChart from "../components/MarketChart/VolumeChart";
import OrderTicket from "../components/OrderTicket";
import OrdersPanel from "../components/OrdersPanel";
import { useMarketReplay } from "../hooks/useMarketReplay";
import {
  DEFAULT_REPLAY_STEP_SECONDS,
  DEFAULT_TIMEFRAME_MINUTES,
  SHOW_VOLUME_BY_DEFAULT,
} from "../components/MarketChart/chartConfig";
import { postMarketTick } from "../api/orders";
import { getToken } from "../utils/token";
import { formatCentsToDollars } from "../utils/currency";
import "./SymbolPage.css";

export default function SymbolPage() {
  const navigate = useNavigate();
  const params = useParams();
  const [showVolume, setShowVolume] = useState<boolean>(SHOW_VOLUME_BY_DEFAULT);
  const [simulationRunning, setSimulationRunning] = useState<boolean>(true);
  const [replaySpeed, setReplaySpeed] = useState<number>(
    DEFAULT_REPLAY_STEP_SECONDS,
  );
  const [orderRefreshTrigger, setOrderRefreshTrigger] = useState(0);

  const ticker = useMemo(() => {
    const raw = params.ticker ?? "";
    return raw.trim();
  }, [params.ticker]);

  const { candles } = useMarketReplay({
    ticker: ticker || null,
    stepSeconds: replaySpeed,
  });

  // Current price from latest candle
  const currentPrice = useMemo(() => {
    if (candles.length === 0) return null;
    return candles[candles.length - 1].close;
  }, [candles]);

  // Dedup + in-flight control for /market/tick forwarding
  const lastTickKeyRef = useRef<string | null>(null);
  const inFlightRef = useRef<boolean>(false);
  const queuedCandleRef = useRef<(typeof candles)[number] | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const activeTickerRef = useRef<string>("");
  const activeTfMinRef = useRef<number>(DEFAULT_TIMEFRAME_MINUTES);
  const mountedRef = useRef<boolean>(true);
  const tickErrorCountRef = useRef<number>(0);

  const resetTickForwarding = useCallback(() => {
    lastTickKeyRef.current = null;
    inFlightRef.current = false;
    queuedCandleRef.current = null;
    tickErrorCountRef.current = 0;
    if (abortRef.current) {
      abortRef.current.abort();
    }
    abortRef.current = null;
  }, []);

  // Reset per-ticker (page-based session)
  useEffect(() => {
    if (ticker !== activeTickerRef.current) {
      activeTickerRef.current = ticker;
      activeTfMinRef.current = DEFAULT_TIMEFRAME_MINUTES;
      resetTickForwarding();
    }
  }, [ticker, resetTickForwarding]);

  // Reset on speed change
  useEffect(() => {
    resetTickForwarding();
  }, [replaySpeed, resetTickForwarding]);

  // Mounted ref to prevent calls after unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      resetTickForwarding();
    };
  }, [resetTickForwarding]);

  const sendTick = useCallback(
    async (candle: (typeof candles)[number], force: boolean = false) => {
      // Guard: don't send if unmounted
      if (!mountedRef.current) return;

      const token = getToken();
      if (!token) return; // chart should still work without auth

      const tf_min = activeTfMinRef.current;
      const tickKey = `${tf_min}:${candle.ts}`;

      // Strict dedupe: skip if we already sent this exact tick (unless forced)
      if (!force && lastTickKeyRef.current === tickKey) {
        return;
      }

      // Prevent concurrent requests: queue latest tick
      if (inFlightRef.current) {
        queuedCandleRef.current = candle;
        return;
      }

      lastTickKeyRef.current = tickKey;
      inFlightRef.current = true;

      // Abort any previous in-flight request (extra safety)
      if (abortRef.current) {
        abortRef.current.abort();
      }
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const result = await postMarketTick(
          token,
          {
            ticker: ticker.toUpperCase(),
            tf_min,
            candle: {
              ts: candle.ts,
              open: candle.open,
              high: candle.high,
              low: candle.low,
              close: candle.close,
              volume: candle.volume,
            },
          },
          controller.signal,
        );

        // Handle duplicate tick response gracefully (non-fatal)
        if (
          result._isDuplicate ||
          (result.processed === false && result.reason === "DUPLICATE_TICK")
        ) {
          // Silently ignore duplicates - this is expected behavior
          tickErrorCountRef.current = 0;
          return;
        }

        // Success - reset error count
        tickErrorCountRef.current = 0;
        
        // If orders were filled, refresh the orders panel
        if (result.processed && result.orders_filled > 0) {
          console.log(`Tick processed: ${result.orders_filled} order(s) filled`);
          // Refresh orders panel to show updated status
          setOrderRefreshTrigger((prev) => prev + 1);
        }
      } catch (e) {
        // Don't break chart rendering if order tick fails
        if ((e as any)?.name === "AbortError") {
          return; // Request was aborted, ignore
        }

        tickErrorCountRef.current += 1;
        console.warn("Order tick forwarding failed:", e);

        // Only show warning after multiple consecutive failures to avoid noise
        // This warning indicates that the Order Service /market/tick endpoint is failing
        // to process candles. This means:
        // - Chart continues updating normally (WebSocket replay unaffected)
        // - Orders may not fill until the issue resolves (backend may catch up later)
        // - This is non-critical: user can still trade, but fills may be delayed
        if (tickErrorCountRef.current >= 2) {
          const errorMessage = e instanceof Error ? e.message : String(e);
          // Check if it's a duplicate error (should be handled silently)
          if (
            !errorMessage.includes("DUPLICATE") &&
            !errorMessage.includes("duplicate")
          ) {
            // Intentionally no UI warning banner (prevents layout/scroll shifts).
          }
        }
      } finally {
        if (!mountedRef.current) return; // Component unmounted, don't process queue

        inFlightRef.current = false;

        // If we queued a newer candle while this request was in-flight, send it next
        const queued = queuedCandleRef.current;
        queuedCandleRef.current = null;
        if (queued && simulationRunning && mountedRef.current) {
          // fire-and-forget; queued candle will be deduped by lastTickKey if same
          void sendTick(queued);
        }
      }
    },
    [ticker, simulationRunning, candles],
  );

  // Forward ticks: once per candle while simulation is running
  useEffect(() => {
    if (!simulationRunning) return;
    if (!ticker) return;
    if (candles.length === 0) return;
    if (!mountedRef.current) return;

    const latest = candles[candles.length - 1];
    void sendTick(latest);
  }, [candles, sendTick, simulationRunning, ticker]);

  const handleOrderPlaced = () => {
    setOrderRefreshTrigger((prev) => prev + 1);
    
    // Immediately evaluate the new order by sending the latest candle
    // This ensures MARKET orders fill right away instead of waiting for next candle
    // Use force=true to bypass deduplication since we want to re-evaluate with the new order
    if (simulationRunning && candles.length > 0 && mountedRef.current) {
      const latest = candles[candles.length - 1];
      // Use a small delay to ensure order is committed to DB, then send tick
      setTimeout(() => {
        if (mountedRef.current && simulationRunning) {
          void sendTick(latest, true); // force=true to re-evaluate
        }
      }, 500);
    }
  };

  const handleSpeedChange = (newSpeed: number) => {
    setReplaySpeed(newSpeed);
    // Disconnect and reconnect will happen automatically via useMarketReplay
    resetTickForwarding();
  };

  return (
    <div className="symbol-page">
      <div className="symbol-page-header">
        <button
          className="symbol-back"
          onClick={() => navigate("/")}
          type="button"
        >
          ← Back
        </button>
        <div className="symbol-title">
          <div className="symbol-name">{ticker || "Unknown Symbol"}</div>
          <div className="symbol-meta">
            tf: {DEFAULT_TIMEFRAME_MINUTES}m • step: {replaySpeed}s
          </div>
          {currentPrice !== null && (
            <div className="symbol-current-price">
              {formatCentsToDollars(Math.round(currentPrice * 100))}
            </div>
          )}
        </div>
        <div className="symbol-header-right">
          <label className="symbol-speed-control">
            Speed:
            <select
              value={replaySpeed}
              onChange={(e) => handleSpeedChange(Number(e.target.value))}
              className="symbol-speed-select"
            >
              <option value={2}>Fast (2s)</option>
              <option value={5}>Normal (5s)</option>
              <option value={10}>Slow (10s)</option>
              <option value={15}>Very Slow (15s)</option>
            </select>
          </label>
          <button
            type="button"
            className="symbol-volume-toggle"
            onClick={() => setSimulationRunning((v) => !v)}
          >
            {simulationRunning ? "Stop Orders" : "Start Orders"}
          </button>
          <button
            type="button"
            className="symbol-volume-toggle"
            onClick={() => setShowVolume((v) => !v)}
          >
            {showVolume ? "Hide Volume" : "Show Volume"}
          </button>
        </div>
      </div>

      <div className="symbol-content-grid">
        <div className="symbol-chart-section">
          <div className="symbol-chart">
            {candles.length > 0 ? (
              <CandlestickChart candles={candles} height={440} />
            ) : (
              <div className="symbol-placeholder">Waiting for candles…</div>
            )}
          </div>

          {showVolume && candles.length > 0 && (
            <div className="symbol-volume">
              <VolumeChart candles={candles} />
            </div>
          )}
        </div>

        <div className="symbol-trading-section">
          <OrderTicket
            ticker={ticker}
            currentPrice={currentPrice}
            onOrderPlaced={handleOrderPlaced}
          />
          <OrdersPanel ticker={ticker} refreshTrigger={orderRefreshTrigger} />
        </div>
      </div>
    </div>
  );
}
