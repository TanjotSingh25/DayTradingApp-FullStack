import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { authService } from '../services/authService';
import type { UserInfo } from '../services/authService';

interface AuthContextType {
  isAuthenticated: boolean;
  user: UserInfo | null;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, name: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      if (authService.isAuthenticated()) {
        const username = authService.getUsername();
        if (username) {
          try {
            const userInfo = await authService.getUserInfo(username);
            setUser(userInfo);
            setIsAuthenticated(true);
          } catch (error) {
            console.error('Failed to fetch user info:', error);
            authService.logout();
          }
        }
      }
      setLoading(false);
    };

    initAuth();
  }, []);

  const login = async (username: string, password: string) => {
    await authService.login({ username, password });
    const userInfo = await authService.getUserInfo(username);
    setUser(userInfo);
    setIsAuthenticated(true);
  };

  const register = async (username: string, password: string, name: string) => {
    await authService.register({ username, password, name });
    await login(username, password);
  };

  const logout = () => {
    authService.logout();
    setUser(null);
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        user,
        login,
        register,
        logout,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

