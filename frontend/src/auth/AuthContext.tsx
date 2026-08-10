import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { api, getStoredUser, getToken, setStoredUser, setToken } from '../api/client';
import type { LoginResponse, Role } from '../api/types';

interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  departmentId: number | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  hasRole: (...roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const stored = getStoredUser();
    if (!stored) return null;
    return { ...stored, role: stored.role as AuthUser['role'] };
  });
  const [token, setTokenState] = useState<string | null>(getToken());

  const login = async (email: string, password: string) => {
    const result = await api.post<LoginResponse>('/auth/login', { email, password });
    setToken(result.token);
    setStoredUser(result.user);
    setTokenState(result.token);
    setUser(result.user);
  };

  const logout = () => {
    api.post('/auth/logout').catch(() => undefined);
    setToken(null);
    setStoredUser(null);
    setTokenState(null);
    setUser(null);
  };

  const hasRole = (...roles: Role[]) => (user ? roles.includes(user.role) : false);

  const value = useMemo(() => ({ user, token, login, logout, hasRole }), [user, token, login, logout, hasRole]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
