import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, storage, TOKEN_KEY, formatErr } from '../lib/api';

export type User = {
  id: string;
  email: string;
  name: string;
  bike: { make?: string; model?: string; registration?: string; odometer_km?: number };
  emergency_contacts: { name: string; phone: string; relation?: string }[];
  stats: { total_km: number; trips_completed: number; highest_point_m: number };
  created_at: string;
};

type AuthState = {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const token = await storage.getItem(TOKEN_KEY);
    if (!token) { setUser(null); setLoading(false); return; }
    try {
      const { data } = await api.get('/auth/me');
      setUser(data);
    } catch {
      await storage.deleteItem(TOKEN_KEY);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const signIn = async (email: string, password: string) => {
    try {
      const { data } = await api.post('/auth/login', { email, password });
      await storage.setItem(TOKEN_KEY, data.token);
      setUser(data.user);
    } catch (e: any) {
      throw new Error(formatErr(e?.response?.data?.detail) || e?.message || 'Login failed');
    }
  };

  const signUp = async (email: string, password: string, name: string) => {
    try {
      const { data } = await api.post('/auth/register', { email, password, name });
      await storage.setItem(TOKEN_KEY, data.token);
      setUser(data.user);
    } catch (e: any) {
      throw new Error(formatErr(e?.response?.data?.detail) || e?.message || 'Sign up failed');
    }
  };

  const signOut = async () => {
    await storage.deleteItem(TOKEN_KEY);
    setUser(null);
  };

  return (
    <Ctx.Provider value={{ user, loading, signIn, signUp, signOut, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}
