import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import CandlestickChart from "../components/MarketChart/CandlestickChart";
import VolumeChart from "../components/MarketChart/VolumeChart";
import { useMarketReplay } from "../hooks/useMarketReplay";
import {
  DEFAULT_REPLAY_STEP_SECONDS,
  DEFAULT_TIMEFRAME_MINUTES,
  SHOW_VOLUME_BY_DEFAULT,
} from "../components/MarketChart/chartConfig";
import "./SymbolPage.css";

export default function SymbolPage() {
  const navigate = useNavigate();
  const params = useParams();
  const [showVolume, setShowVolume] = useState<boolean>(SHOW_VOLUME_BY_DEFAULT);

  const ticker = useMemo(() => {
    const raw = params.ticker ?? "";
    // react-router already decodes params; keep it safe and trimmed
    return raw.trim();
  }, [params.ticker]);

  const { candles } = useMarketReplay({
    ticker: ticker || null,
    stepSeconds: DEFAULT_REPLAY_STEP_SECONDS,
  });

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
            tf: {DEFAULT_TIMEFRAME_MINUTES}m • step:{" "}
            {DEFAULT_REPLAY_STEP_SECONDS}s
          </div>
        </div>
        <div className="symbol-header-right">
          <button
            type="button"
            className="symbol-volume-toggle"
            onClick={() => setShowVolume((v) => !v)}
          >
            {showVolume ? "Hide Volume" : "Show Volume"}
          </button>
        </div>
      </div>

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
  );
}
