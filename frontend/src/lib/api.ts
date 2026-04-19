import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

export const TOKEN_KEY = 'broad_token';
export const REFRESH_TOKEN_KEY = 'broad_refresh_token';

// Cross-platform secure storage (web fallback to localStorage)
async function setItem(key: string, value: string) {
  if (Platform.OS === 'web') {
    try { localStorage.setItem(key, value); } catch {}
  } else {
    await SecureStore.setItemAsync(key, value);
  }
}
async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  return await SecureStore.getItemAsync(key);
}
async function deleteItem(key: string) {
  if (Platform.OS === 'web') {
    try { localStorage.removeItem(key); } catch {}
  } else {
    await SecureStore.deleteItemAsync(key);
  }
}

export const storage = { setItem, getItem, deleteItem };

export const api = axios.create({
  baseURL: `${BASE}/api`,
  timeout: 20000,
});

api.interceptors.request.use(async (config) => {
  const token = await getItem(TOKEN_KEY);
  if (token) {
    config.headers = config.headers || {};
    (config.headers as any).Authorization = `Bearer ${token}`;
  }
  return config;
});

// ---- Refresh-token interceptor ----
// When a request 401s, try once to exchange the refresh token for a new access
// token and retry. Prevents forced logouts when access expires mid-session.
// Coalesces concurrent refreshes so only one /auth/refresh call fires at a time.
let _refreshInFlight: Promise<string | null> | null = null;

async function _refreshAccessToken(): Promise<string | null> {
  if (_refreshInFlight) return _refreshInFlight;
  _refreshInFlight = (async () => {
    const refreshToken = await getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) return null;
    try {
      const res = await axios.post(`${BASE}/api/auth/refresh`, { refresh_token: refreshToken }, { timeout: 10000 });
      const newAccess = res.data?.token;
      const newRefresh = res.data?.refresh_token;
      if (newAccess) await setItem(TOKEN_KEY, newAccess);
      if (newRefresh) await setItem(REFRESH_TOKEN_KEY, newRefresh);
      return newAccess || null;
    } catch {
      // Refresh failed — caller will see the original 401 and sign the user out.
      await deleteItem(TOKEN_KEY);
      await deleteItem(REFRESH_TOKEN_KEY);
      return null;
    } finally {
      _refreshInFlight = null;
    }
  })();
  return _refreshInFlight;
}

api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error?.config;
    const status = error?.response?.status;
    // Only retry once, only on 401, and never on the refresh call itself
    if (
      status === 401 &&
      original &&
      !original._retry &&
      !String(original.url || '').includes('/auth/refresh') &&
      !String(original.url || '').includes('/auth/login') &&
      !String(original.url || '').includes('/auth/register')
    ) {
      original._retry = true;
      const newAccess = await _refreshAccessToken();
      if (newAccess) {
        original.headers = original.headers || {};
        original.headers.Authorization = `Bearer ${newAccess}`;
        return api(original);
      }
    }
    throw error;
  }
);

export function formatErr(detail: any): string {
  if (detail == null) return 'Something went wrong.';
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map((e: any) => (e && typeof e.msg === 'string' ? e.msg : JSON.stringify(e))).join(' ');
  }
  if (detail && typeof detail.msg === 'string') return detail.msg;
  return String(detail);
}
