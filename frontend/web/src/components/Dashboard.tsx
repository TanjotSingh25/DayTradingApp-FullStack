import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import './Dashboard.css';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1>Day Trading Simulator</h1>
        <div className="user-info">
          <span>Welcome, {user?.name || user?.username}!</span>
          <button onClick={handleLogout} className="logout-button">
            Logout
          </button>
        </div>
      </div>
      <div className="dashboard-content">
        <div className="welcome-card">
          <h2>Welcome to Your Trading Dashboard</h2>
          <p>This is where your trading features will be implemented.</p>
          <p>Coming soon:</p>
          <ul>
            <li>Real-time market data</li>
            <li>Order placement</li>
            <li>Portfolio management</li>
            <li>Risk analytics</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

