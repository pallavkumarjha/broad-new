import React, { useEffect, useRef } from 'react';
import { Alert, AppState } from 'react-native';
import { useRouter } from 'expo-router';
import { api, storage, TOKEN_KEY } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

type SocketMap = Record<string, WebSocket>;

export function GlobalSosListener() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const socketsRef = useRef<SocketMap>({});
  const seenSosRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const closeAll = () => {
      for (const ws of Object.values(socketsRef.current)) {
        try { ws.close(); } catch {}
      }
      socketsRef.current = {};
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
          }
        }

        const base = process.env.EXPO_PUBLIC_BACKEND_URL || '';
        const wsBase = base.replace(/^http/, 'ws');

        for (const tripId of activeTripIds) {
          if (socketsRef.current[tripId]) continue;
          try {
            const ws = new WebSocket(`${wsBase}/api/ws/convoy/${tripId}?token=${encodeURIComponent(token)}`);
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
              if (!cancelled) setTimeout(() => { syncActiveTripSockets(); }, 1000);
            };
            socketsRef.current[tripId] = ws;
          } catch {}
        }
      } catch {}
    };

    syncActiveTripSockets();
    const interval = setInterval(syncActiveTripSockets, 30000);
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') syncActiveTripSockets();
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
