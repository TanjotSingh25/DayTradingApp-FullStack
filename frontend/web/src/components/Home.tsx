import { useMemo, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import "./Home.css";
import { useSymbolSearch } from "../hooks/useSymbolSearch";
import { useAllSymbols } from "../hooks/useAllSymbols";

export default function Home() {
  const { isAuthenticated, user, logout } = useAuth();
  const navigate = useNavigate();
  const POPULAR = useMemo(() => ["AAPL", "MSFT", "NVDA", "TSLA", "GOOGL"], []);

  // Pre-fetch all symbols when Home component mounts
  const { allSymbols } = useAllSymbols();

  const [activePopular, setActivePopular] = useState<string>(POPULAR[0]);
  const {
    query,
    setQuery,
    results,
    isLoading: isSearching,
  } = useSymbolSearch({
    limit: 20,
    debounceMs: 150,
    minChars: 1,
    allSymbols: allSymbols, // Pass pre-fetched symbols for instant filtering
  });

  const goToSymbol = (symbol: string) => {
    const s = symbol.trim();
    if (!s) return;
    navigate(`/symbol/${encodeURIComponent(s)}`);
  };

  const handleGetStarted = () => {
    if (isAuthenticated) {
      navigate("/dashboard");
    } else {
      navigate("/login");
    }
  };

  const handleLogoClick = () => {
    navigate("/");
  };

  return (
    <div className="home-container">
      <div className="home-header">
        <div className="home-nav">
          <h1
            className="home-logo"
            onClick={handleLogoClick}
            style={{ cursor: "pointer" }}
          >
            Day Trading Simulator
          </h1>
          <div className="home-nav-buttons">
            {isAuthenticated ? (
              <>
                <span className="welcome-text">
                  Welcome, {user?.name || user?.username}!
                </span>
                <button
                  onClick={() => navigate("/dashboard")}
                  className="nav-button"
                >
                  Settings
                </button>
                <button
                  onClick={() => navigate("/portfolio")}
                  className="nav-button"
                >
                  Portfolio
                </button>
                <button
                  onClick={() => {
                    logout();
                    navigate("/");
                  }}
                  className="nav-button logout-btn"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => navigate("/login")}
                  className="nav-button primary"
                >
                  Login
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="home-content">
        <div className="home-picker">
          <h2 className="home-picker-title">Search a stock</h2>

          <div className="home-search-box">
            <input
              className="home-search-input"
              value={query}
              placeholder="Type a symbol… (e.g., AAPL.US)"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && results.length > 0) {
                  goToSymbol(results[0]);
                  setQuery("");
                }
              }}
            />
            {isSearching && <div className="home-search-hint">Searching…</div>}

            {query.trim().length > 0 && results.length > 0 && (
              <div className="home-search-dropdown">
                {results.slice(0, 12).map((sym) => (
                  <button
                    key={sym}
                    className="home-search-option"
                    onClick={() => {
                      goToSymbol(sym);
                      setQuery("");
                    }}
                    type="button"
                  >
                    {sym}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="home-popular">
            <div className="home-popular-label">Popular</div>
            <div className="home-popular-tabs">
              {POPULAR.map((sym) => (
                <button
                  key={sym}
                  className={
                    sym === activePopular ? "home-tab active" : "home-tab"
                  }
                  onClick={() => {
                    setActivePopular(sym);
                    goToSymbol(sym);
                  }}
                  type="button"
                >
                  {sym}
                </button>
              ))}
            </div>
          </div>

          {!isAuthenticated && (
            <div className="home-cta-row">
              <button onClick={handleGetStarted} className="cta-button">
                Get Started
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
