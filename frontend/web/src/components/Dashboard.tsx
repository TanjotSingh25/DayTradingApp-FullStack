import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import UserProfile from "./UserProfile";
import UserPreferences from "./UserPreferences";
import "./Dashboard.css";

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<
    "wallet" | "profile" | "preferences"
  >("wallet");

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div className="header-left">
          <button onClick={() => navigate("/")} className="home-button">
            ← Home
          </button>
          <h1>Day Trading Simulator</h1>
        </div>
        <div className="user-info">
          <span>Welcome, {user?.name || user?.username}!</span>
          <button onClick={handleLogout} className="logout-button">
            Logout
          </button>
        </div>
      </div>
      <div className="dashboard-nav">
        <button
          className={activeTab === "wallet" ? "nav-tab active" : "nav-tab"}
          onClick={() => setActiveTab("wallet")}
        >
          Wallet
        </button>
        <button
          className={activeTab === "preferences" ? "nav-tab active" : "nav-tab"}
          onClick={() => setActiveTab("preferences")}
        >
          Preferences
        </button>
        <button
          className={activeTab === "profile" ? "nav-tab active" : "nav-tab"}
          onClick={() => setActiveTab("profile")}
        >
          Profile
        </button>
      </div>
      <div className="dashboard-content">
        {activeTab === "wallet" && (
          <div className="welcome-card">
            <h2>Wallet</h2>
            <p>
              This is where your wallet and trading features will be
              implemented.
            </p>
            <p>Coming soon:</p>
            <ul>
              <li>Account balance</li>
              <li>Real-time market data</li>
              <li>Order placement</li>
              <li>Portfolio management</li>
              <li>Risk analytics</li>
            </ul>
          </div>
        )}
        {activeTab === "profile" && <UserProfile />}
        {activeTab === "preferences" && <UserPreferences />}
      </div>
    </div>
  );
}
