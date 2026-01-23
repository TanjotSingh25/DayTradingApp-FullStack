import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { userService, type UserPreferences } from '../services/userService';
import './UserPreferences.css';

export default function UserPreferences() {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [newSymbol, setNewSymbol] = useState('');

  const [formData, setFormData] = useState({
    default_order_qty: 100,
    confirm_market_orders: true,
    ui_preferences: {
      dark_mode: false,
      layout: 'default',
    },
    risk_preferences: {
      soft_limit_warning: true,
      max_position_size: 10000,
    },
  });

  useEffect(() => {
    if (user?.username) {
      loadPreferences();
    } else {
      setLoading(false);
    }
  }, [user?.username]);

  const loadPreferences = async () => {
    if (!user?.username) return;
    
    try {
      setLoading(true);
      setError('');
      const data = await userService.getPreferences(user.username);
      
      // Normalize the data to ensure all fields exist with defaults
      const normalizedData: UserPreferences = {
        username: data.username || user.username,
        default_order_qty: data.default_order_qty ?? 100,
        favorite_symbols: Array.isArray(data.favorite_symbols) ? data.favorite_symbols : [],
        confirm_market_orders: data.confirm_market_orders ?? true,
        ui_preferences: {
          dark_mode: data.ui_preferences?.dark_mode ?? false,
          layout: data.ui_preferences?.layout ?? 'default',
        },
        risk_preferences: {
          soft_limit_warning: data.risk_preferences?.soft_limit_warning ?? true,
          max_position_size: data.risk_preferences?.max_position_size ?? 10000,
        },
        updated_at: data.updated_at,
      };
      
      setPreferences(normalizedData);
      setFormData({
        default_order_qty: normalizedData.default_order_qty,
        confirm_market_orders: normalizedData.confirm_market_orders,
        ui_preferences: { ...normalizedData.ui_preferences },
        risk_preferences: { ...normalizedData.risk_preferences },
      });
    } catch (err) {
      console.error('Error loading preferences:', err);
      setError(err instanceof Error ? err.message : 'Failed to load preferences');
      // Set preferences to null so we show the error state
      setPreferences(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.username) return;

    try {
      setError('');
      setSuccess('');
      await userService.updatePreferences(user.username, formData);
      setSuccess('Preferences updated successfully!');
      setEditing(false);
      await loadPreferences();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update preferences');
    }
  };

  const handleAddFavorite = async () => {
    if (!user?.username || !newSymbol.trim()) return;

    try {
      setError('');
      setLoading(true);
      await userService.addFavoriteSymbol(user.username, newSymbol.trim());
      setNewSymbol('');
      await loadPreferences();
    } catch (err) {
      console.error('Error adding favorite symbol:', err);
      setError(err instanceof Error ? err.message : 'Failed to add favorite symbol');
      setLoading(false);
    }
  };

  const handleRemoveFavorite = async (symbol: string) => {
    if (!user?.username) return;

    try {
      setError('');
      setLoading(true);
      await userService.removeFavoriteSymbol(user.username, symbol);
      await loadPreferences();
    } catch (err) {
      console.error('Error removing favorite symbol:', err);
      setError(err instanceof Error ? err.message : 'Failed to remove favorite symbol');
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="user-preferences">
        <div className="preferences-loading">Loading preferences...</div>
      </div>
    );
  }

  if (!user?.username) {
    return (
      <div className="user-preferences">
        <div className="preferences-error">Please log in to view preferences</div>
      </div>
    );
  }

  if (error && !preferences) {
    return (
      <div className="user-preferences">
        <div className="preferences-error">
          <p>{error}</p>
          <button onClick={loadPreferences} className="retry-button">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!preferences && !error) {
    return (
      <div className="user-preferences">
        <div className="preferences-loading">Loading preferences...</div>
      </div>
    );
  }

  // Use default preferences if none exist (from API response)
  // Also ensure all nested objects exist to prevent crashes
  const displayPreferences: UserPreferences = preferences ? {
    username: preferences.username || user?.username || '',
    default_order_qty: preferences.default_order_qty ?? 100,
    favorite_symbols: Array.isArray(preferences.favorite_symbols) ? preferences.favorite_symbols : [],
    confirm_market_orders: preferences.confirm_market_orders ?? true,
    ui_preferences: {
      dark_mode: preferences.ui_preferences?.dark_mode ?? false,
      layout: preferences.ui_preferences?.layout ?? 'default',
    },
    risk_preferences: {
      soft_limit_warning: preferences.risk_preferences?.soft_limit_warning ?? true,
      max_position_size: preferences.risk_preferences?.max_position_size ?? 10000,
    },
    updated_at: preferences.updated_at,
  } : {
    username: user?.username || '',
    default_order_qty: 100,
    favorite_symbols: [],
    confirm_market_orders: true,
    ui_preferences: {
      dark_mode: false,
      layout: 'default',
    },
    risk_preferences: {
      soft_limit_warning: true,
      max_position_size: 10000,
    },
  };

  return (
    <div className="user-preferences">
      <div className="preferences-header">
        <h2>Trading Preferences</h2>
        {!editing && (
          <button onClick={() => setEditing(true)} className="edit-button">
            Edit Preferences
          </button>
        )}
      </div>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      {editing ? (
        <form onSubmit={handleSubmit} className="preferences-form">
          <div className="form-section">
            <h3>Trading Settings</h3>
            <div className="form-group">
              <label>Default Order Quantity</label>
              <input
                type="number"
                min="1"
                value={formData.default_order_qty}
                onChange={(e) => setFormData({ ...formData, default_order_qty: parseInt(e.target.value) || 0 })}
                required
              />
            </div>

            <div className="form-group checkbox-group">
              <label>
                <input
                  type="checkbox"
                  checked={formData.confirm_market_orders}
                  onChange={(e) => setFormData({ ...formData, confirm_market_orders: e.target.checked })}
                />
                Confirm market orders before execution
              </label>
            </div>
          </div>

          <div className="form-section">
            <h3>UI Preferences</h3>
            <div className="form-group checkbox-group">
              <label>
                <input
                  type="checkbox"
                  checked={formData.ui_preferences.dark_mode}
                  onChange={(e) => setFormData({
                    ...formData,
                    ui_preferences: { ...formData.ui_preferences, dark_mode: e.target.checked }
                  })}
                />
                Dark mode
              </label>
            </div>
            <div className="form-group">
              <label>Layout</label>
              <select
                value={formData.ui_preferences.layout}
                onChange={(e) => setFormData({
                  ...formData,
                  ui_preferences: { ...formData.ui_preferences, layout: e.target.value }
                })}
              >
                <option value="default">Default</option>
                <option value="compact">Compact</option>
                <option value="spacious">Spacious</option>
              </select>
            </div>
          </div>

          <div className="form-section">
            <h3>Risk Preferences</h3>
            <div className="form-group checkbox-group">
              <label>
                <input
                  type="checkbox"
                  checked={formData.risk_preferences.soft_limit_warning}
                  onChange={(e) => setFormData({
                    ...formData,
                    risk_preferences: { ...formData.risk_preferences, soft_limit_warning: e.target.checked }
                  })}
                />
                Show soft limit warnings
              </label>
            </div>
            <div className="form-group">
              <label>Max Position Size</label>
              <input
                type="number"
                min="0"
                value={formData.risk_preferences.max_position_size}
                onChange={(e) => setFormData({
                  ...formData,
                  risk_preferences: { ...formData.risk_preferences, max_position_size: parseInt(e.target.value) || 0 }
                })}
                required
              />
            </div>
          </div>

          <div className="form-actions">
            <button type="submit" className="save-button">Save Changes</button>
            <button type="button" onClick={() => {
              setEditing(false);
              if (preferences) {
                // Use safe access with defaults
                setFormData({
                  default_order_qty: preferences.default_order_qty ?? 100,
                  confirm_market_orders: preferences.confirm_market_orders ?? true,
                  ui_preferences: {
                    dark_mode: preferences.ui_preferences?.dark_mode ?? false,
                    layout: preferences.ui_preferences?.layout ?? 'default',
                  },
                  risk_preferences: {
                    soft_limit_warning: preferences.risk_preferences?.soft_limit_warning ?? true,
                    max_position_size: preferences.risk_preferences?.max_position_size ?? 10000,
                  },
                });
              } else {
                // Reset to defaults if no preferences exist
                setFormData({
                  default_order_qty: 100,
                  confirm_market_orders: true,
                  ui_preferences: {
                    dark_mode: false,
                    layout: 'default',
                  },
                  risk_preferences: {
                    soft_limit_warning: true,
                    max_position_size: 10000,
                  },
                });
              }
            }} className="cancel-button">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="preferences-details">
          <div className="preferences-section">
            <h3>Trading Settings</h3>
            <div className="preference-field">
              <label>Default Order Quantity</label>
              <div className="field-value">{displayPreferences.default_order_qty}</div>
            </div>
            <div className="preference-field">
              <label>Confirm Market Orders</label>
              <div className="field-value">{displayPreferences.confirm_market_orders ? 'Yes' : 'No'}</div>
            </div>
          </div>

          <div className="preferences-section">
            <h3>UI Preferences</h3>
            <div className="preference-field">
              <label>Dark Mode</label>
              <div className="field-value">{displayPreferences.ui_preferences.dark_mode ? 'Enabled' : 'Disabled'}</div>
            </div>
            <div className="preference-field">
              <label>Layout</label>
              <div className="field-value">{displayPreferences.ui_preferences.layout}</div>
            </div>
          </div>

          <div className="preferences-section">
            <h3>Risk Preferences</h3>
            <div className="preference-field">
              <label>Soft Limit Warning</label>
              <div className="field-value">{displayPreferences.risk_preferences.soft_limit_warning ? 'Enabled' : 'Disabled'}</div>
            </div>
            <div className="preference-field">
              <label>Max Position Size</label>
              <div className="field-value">${displayPreferences.risk_preferences.max_position_size.toLocaleString()}</div>
            </div>
          </div>

          <div className="preferences-section">
            <h3>Favorite Symbols</h3>
            <div className="favorites-list">
              {displayPreferences.favorite_symbols && displayPreferences.favorite_symbols.length > 0 ? (
                displayPreferences.favorite_symbols.map((symbol) => (
                  <div key={symbol} className="favorite-item">
                    <span>{symbol}</span>
                    <button
                      onClick={() => handleRemoveFavorite(symbol)}
                      className="remove-favorite"
                      title="Remove favorite"
                    >
                      ×
                    </button>
                  </div>
                ))
              ) : (
                <p className="no-favorites">No favorite symbols yet</p>
              )}
            </div>
            <div className="add-favorite">
              <input
                type="text"
                placeholder="Enter symbol (e.g., AAPL)"
                value={newSymbol}
                onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
                onKeyPress={(e) => e.key === 'Enter' && handleAddFavorite()}
                maxLength={10}
              />
              <button onClick={handleAddFavorite} className="add-button">
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

