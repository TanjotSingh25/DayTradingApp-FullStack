import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import './Home.css';

export default function Home() {
  const { isAuthenticated, user, logout } = useAuth();
  const navigate = useNavigate();

  const handleGetStarted = () => {
    if (isAuthenticated) {
      navigate('/dashboard');
    } else {
      navigate('/login');
    }
  };

  const handleLogoClick = () => {
    navigate('/');
  };

  return (
    <div className="home-container">
      <div className="home-header">
        <div className="home-nav">
          <h1 className="home-logo" onClick={handleLogoClick} style={{ cursor: 'pointer' }}>
            Day Trading Simulator
          </h1>
          <div className="home-nav-buttons">
            {isAuthenticated ? (
              <>
                <span className="welcome-text">Welcome, {user?.name || user?.username}!</span>
                <button onClick={() => navigate('/dashboard')} className="nav-button">
                  Dashboard
                </button>
                <button onClick={() => {
                  logout();
                  navigate('/');
                }} className="nav-button logout-btn">
                  Logout
                </button>
              </>
            ) : (
              <button onClick={() => navigate('/login')} className="nav-button primary">
                Login
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="home-hero">
        <div className="hero-content">
          <h2>Practice Day Trading with Real Market Data</h2>
          <p>Simulate real trading scenarios without risking real money</p>
          {!isAuthenticated && (
            <button onClick={handleGetStarted} className="cta-button">
              Get Started
            </button>
          )}
        </div>
      </div>

      <div className="home-content">
        <div className="market-section">
          <h3>Market Overview</h3>
          <div className="market-placeholder">
            <p>Real-time market data will be displayed here</p>
            <p className="coming-soon">Coming soon: Live prices, charts, and market trends</p>
          </div>
        </div>

        <div className="features-section">
          <h3>Features</h3>
          <div className="features-grid">
            <div className="feature-card">
              <h4>Real-time Market Data</h4>
              <p>Access live stock prices and market information</p>
            </div>
            <div className="feature-card">
              <h4>Virtual Trading</h4>
              <p>Practice buying and selling stocks with virtual money</p>
            </div>
            <div className="feature-card">
              <h4>Portfolio Tracking</h4>
              <p>Monitor your positions and track your performance</p>
            </div>
            <div className="feature-card">
              <h4>Risk Management</h4>
              <p>Learn to manage risk with built-in risk controls</p>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

