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
    "profile" | "preferences"
  >("profile");

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
          <h1>Account Settings</h1>
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
          className={activeTab === "profile" ? "nav-tab active" : "nav-tab"}
          onClick={() => setActiveTab("profile")}
        >
          Profile
        </button>
        <button
          className={activeTab === "preferences" ? "nav-tab active" : "nav-tab"}
          onClick={() => setActiveTab("preferences")}
        >
          Preferences
        </button>
      </div>
      <div className="dashboard-content">
        {activeTab === "profile" && <UserProfile />}
        {activeTab === "preferences" && <UserPreferences />}
      </div>
    </div>
  );
}
