import React, { useEffect, useRef } from 'react';
import { Alert, AppState } from 'react-native';
import { useRouter } from 'expo-router';
import { api, storage, TOKEN_KEY } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

// Live SOS convoy WebSocket base URL.
//
// Resolution order:
//   1. EXPO_PUBLIC_WS_URL — explicit override. Used in production where the
//      REST proxy at broad-homepage.vercel.app can't tunnel WS upgrades and
//      we have to hit the Railway host directly.
//   2. EXPO_PUBLIC_BACKEND_URL — local-dev fallback. The FastAPI process
//      serving REST also serves WS, so reuse the same host.
//
// Without the fallback every dev build that only set BACKEND_URL got silent
// SOS failure: push reached devices, but the in-app live alert was disabled
// because there was no WS. That's how SOS alerts started missing other
// riders even though the trip room was happily fanning out the message.
const WS_BASE = (() => {
  const explicit = process.env.EXPO_PUBLIC_WS_URL;
  const backend = process.env.EXPO_PUBLIC_BACKEND_URL;
  const base = explicit || backend;
  if (!base) return null;
  return base.replace(/^http/, 'ws');
})();

const MAX_RECONNECTS = 3;

type SocketMap = Record<string, WebSocket>;

export function GlobalSosListener() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const socketsRef = useRef<SocketMap>({});
  const seenSosRef = useRef<Set<string>>(new Set());
  const retriesRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!WS_BASE) return; // push-only mode — short-circuit

    const closeAll = () => {
      for (const ws of Object.values(socketsRef.current)) {
        try { ws.close(); } catch {}
      }
      socketsRef.current = {};
      retriesRef.current = {};
    };

    if (loading || !user) {
      closeAll();
      return;
    }

    let cancelled = false;

    const syncActiveTripSockets = async () => {
      try {
        const token = await storage.getItem(TOKEN_KEY);
        if (!token || cancelled) return;
        const { data } = await api.get('/trips', { params: { status: 'active' } });
        if (cancelled) return;

        const activeTripIds = new Set<string>((data || []).map((t: any) => t.id).filter(Boolean));

        for (const [tripId, ws] of Object.entries(socketsRef.current)) {
          if (!activeTripIds.has(tripId)) {
            try { ws.close(); } catch {}
            delete socketsRef.current[tripId];
            delete retriesRef.current[tripId];
          }
        }

        for (const tripId of activeTripIds) {
          if (socketsRef.current[tripId]) continue;
          if ((retriesRef.current[tripId] ?? 0) >= MAX_RECONNECTS) continue;
          try {
            const ws = new WebSocket(`${WS_BASE}/api/ws/convoy/${tripId}?token=${encodeURIComponent(token)}`);
            ws.onopen = () => { retriesRef.current[tripId] = 0; };
            ws.onmessage = (e) => {
              try {
                const d = JSON.parse(e.data);
                if (d.type !== 'sos' || !d.sos_id) return;
                if (d.sender_user_id && d.sender_user_id === user.id) return;
                if (seenSosRef.current.has(d.sos_id)) return;
                seenSosRef.current.add(d.sos_id);
                Alert.alert(
                  'SOS Alert',
                  `${d.sender} has triggered an SOS. They may need help.`,
                  [
                    { text: 'Dismiss', style: 'cancel' },
                    { text: 'View SOS', onPress: () => router.push(`/sos/respond/${d.sos_id}` as any) },
                  ],
                  { cancelable: false }
                );
              } catch {}
            };
            ws.onclose = () => {
              if (socketsRef.current[tripId] === ws) delete socketsRef.current[tripId];
              retriesRef.current[tripId] = (retriesRef.current[tripId] ?? 0) + 1;
              if (cancelled || retriesRef.current[tripId] >= MAX_RECONNECTS) return;
              const backoff = 1000 * Math.pow(2, retriesRef.current[tripId]); // 2s, 4s, 8s
              setTimeout(() => { syncActiveTripSockets(); }, backoff);
            };
            socketsRef.current[tripId] = ws;
          } catch {}
        }
      } catch {}
    };

    syncActiveTripSockets();
    const interval = setInterval(syncActiveTripSockets, 30000);
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        retriesRef.current = {}; // reset budget on foreground
        syncActiveTripSockets();
      }
    });

    return () => {
      cancelled = true;
      clearInterval(interval);
      appStateSub.remove();
      closeAll();
    };
  }, [loading, router, user]);

  return null;
}
