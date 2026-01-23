const API_BASE_URL = import.meta.env.VITE_USER_SERVICE_URL || 
  (import.meta.env.PROD ? '/api/user' : 'http://localhost:8081');

export interface UserProfile {
  username: string;
  display_name: string;
  email: string;
  timezone: string;
  country: string;
  created_at: string;
  updated_at?: string;
}

export interface UserPreferences {
  username: string;
  default_order_qty: number;
  favorite_symbols: string[];
  confirm_market_orders: boolean;
  ui_preferences: {
    dark_mode: boolean;
    layout: string;
  };
  risk_preferences: {
    soft_limit_warning: boolean;
    max_position_size: number;
  };
  updated_at?: string;
}

class UserService {
  private getAuthHeaders(): HeadersInit {
    const token = localStorage.getItem('token');
    return {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    };
  }

  async getProfile(username: string): Promise<UserProfile> {
    const response = await fetch(`${API_BASE_URL}/profile/${username}`, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || 'Failed to fetch user profile');
    }

    return response.json();
  }

  async updateProfile(username: string, profile: Partial<UserProfile>): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/profile/${username}`, {
      method: 'PUT',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(profile),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || 'Failed to update user profile');
    }
  }

  async getPreferences(username: string): Promise<UserPreferences> {
    const response = await fetch(`${API_BASE_URL}/preferences/${username}`, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || 'Failed to fetch user preferences');
    }

    return response.json();
  }

  async updatePreferences(username: string, preferences: Partial<UserPreferences>): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/preferences/${username}`, {
      method: 'PUT',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(preferences),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || 'Failed to update user preferences');
    }
  }

  async addFavoriteSymbol(username: string, symbol: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/preferences/${username}/favorites`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ symbol }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || 'Failed to add favorite symbol');
    }
  }

  async removeFavoriteSymbol(username: string, symbol: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/preferences/${username}/favorites/${symbol}`, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || 'Failed to remove favorite symbol');
    }
  }
}

export const userService = new UserService();

