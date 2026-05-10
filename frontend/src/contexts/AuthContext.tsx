import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { api, storage, TOKEN_KEY, REFRESH_TOKEN_KEY, describeError } from '../lib/api';

export type RiderType = 'solo' | 'crew' | 'commuter' | 'mixed';

export type User = {
  id: string;
  email: string;
  name: string;
  bike: { make?: string; model?: string; registration?: string; odometer_km?: number };
  emergency_contacts: { name: string; phone: string; relation?: string }[];
  stats: { total_km: number; trips_completed: number; highest_point_m: number };
  home_city?: string | null;
  rider_type?: RiderType | null;
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

/** Register this device's Expo push token with the backend (best-effort, never throws). */
async function _registerPushToken(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    // Lazily import so the web bundle is never broken by this native-only module.
    const Notifications = await import('expo-notifications');
    const { status } = await Notifications.getPermissionsAsync();
    let finalStatus = status;
    if (status !== 'granted') {
      const { status: s } = await Notifications.requestPermissionsAsync();
      finalStatus = s;
    }
    if (finalStatus !== 'granted') return;
    
    // EAS Project ID is required for push notifications in SDK 50+
    const projectId = Constants.expoConfig?.extra?.eas?.projectId || 
                     Constants.expoConfig?.owner; 
    
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    // Backend uses $addToSet — safe to call on every app launch.
    await api.post('/users/me/push-token', { token: tokenData.data });
  } catch (err) {
    // Silently swallow — push is opt-in, never block auth flow
    console.warn('Push registration failed:', err);
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const token = await storage.getItem(TOKEN_KEY);
    if (!token) { setUser(null); setLoading(false); return; }
    try {
      const { data } = await api.get('/auth/me');
      setUser(data);
      _registerPushToken();
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
      if (data.refresh_token) await storage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);
      setUser(data.user);
      _registerPushToken();
    } catch (e: any) {
      throw new Error(describeError(e, 'Login failed'));
    }
  };

  const signUp = async (email: string, password: string, name: string) => {
    try {
      const { data } = await api.post('/auth/register', { email, password, name });
      await storage.setItem(TOKEN_KEY, data.token);
      if (data.refresh_token) await storage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);
      setUser(data.user);
      _registerPushToken();
    } catch (e: any) {
      throw new Error(describeError(e, 'Sign up failed'));
    }
  };

  const signOut = async () => {
    // Best-effort server-side revocation so a stolen refresh token dies immediately
    try {
      const refreshToken = await storage.getItem(REFRESH_TOKEN_KEY);
      if (refreshToken) await api.post('/auth/logout', { refresh_token: refreshToken });
      
      // Also unregister this device's push token so we stop sending pushes to it
      if (Platform.OS !== 'web') {
        const Notifications = await import('expo-notifications');
        const projectId = Constants.expoConfig?.extra?.eas?.projectId || Constants.expoConfig?.owner;
        const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
        await api.delete('/users/me/push-token', { data: { token: tokenData.data } });
      }
    } catch {}
    await storage.deleteItem(TOKEN_KEY);
    await storage.deleteItem(REFRESH_TOKEN_KEY);
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
