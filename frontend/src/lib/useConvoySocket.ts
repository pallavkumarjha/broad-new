import { useEffect, useRef, useState, useCallback } from 'react';
import { storage, TOKEN_KEY } from './api';

/** Member as broadcast by the server's `state` payload. Mirrors the shape in
 * backend/server.py ConvoyHub.broadcast_state — keep these in sync. */
export type ConvoyMember = {
  user_id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  speed_kmh: number;
  heading_deg?: number;
  accuracy_m?: number | null;
  online: boolean;
  updated_at: string;
};

export type PosPayload = {
  lat: number;
  lng: number;
  speed_kmh: number;
  heading_deg?: number;
  accuracy_m?: number | null;
};

type SocketState =
  | { kind: 'idle' }
  | { kind: 'connecting' }
  | { kind: 'connected' }
  | { kind: 'reconnecting'; attempt: number; nextRetryMs: number }
  | { kind: 'failed'; reason: string }; // terminal — won't auto-retry (auth/permission)

/** Close codes the server uses for refusals that should NOT be retried.
 * Anything else (network drops, server restarts, code 1006) we retry. */
const TERMINAL_CODES = new Set([4401, 4403, 4404, 4409, 4410, 4411]);

/** Exponential backoff: 1s, 2s, 4s, 8s, 16s, then 30s cap. ±20% jitter so
 * a fleet of phones reconnecting after a server bounce don't all retry at
 * exactly the same second. */
function backoffMs(attempt: number): number {
  const base = Math.min(30_000, 1000 * 2 ** attempt);
  const jitter = base * (Math.random() * 0.4 - 0.2);
  return Math.max(500, Math.round(base + jitter));
}

/** Subscribe to a trip's convoy WebSocket with auto-reconnect.
 *
 * Lifecycle:
 * - Mount → connect (`connecting`)
 * - Server accepts → `connected`, members start populating
 * - Drop (network blip, server restart) → `reconnecting` with exp-backoff
 * - Server rejects with 4401/4403/4404/4409/4410/4411 → `failed`, no retry
 * - Unmount → close cleanly, never reconnect
 *
 * Why a custom hook: the ride screen used to inline a one-shot WebSocket
 * with no retry. Riders going through a tunnel or switching cell towers
 * would silently lose the convoy and not realise until they noticed nobody
 * was moving on the map. That's a nasty failure mode for a safety feature. */
export function useConvoySocket(tripId: string | undefined, opts?: { onTripEnded?: () => void }) {
  const [members, setMembers] = useState<ConvoyMember[]>([]);
  const [state, setState] = useState<SocketState>({ kind: 'idle' });
  const wsRef = useRef<WebSocket | null>(null);
  const onTripEndedRef = useRef(opts?.onTripEnded);
  // Stash the handler in a ref so changing the closure on the consumer
  // side doesn't tear down and rebuild the socket every render.
  useEffect(() => { onTripEndedRef.current = opts?.onTripEnded; }, [opts?.onTripEnded]);

  useEffect(() => {
    if (!tripId) return;
    let cancelled = false;
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    async function connect() {
      if (cancelled) return;
      const token = await storage.getItem(TOKEN_KEY);
      const wsBase = process.env.EXPO_PUBLIC_WS_URL?.replace(/^http/, 'ws');
      if (!token || !wsBase) {
        // No transport configured — caller is in REST-only mode. Surface a
        // terminal state so callers can fall back gracefully.
        setState({ kind: 'failed', reason: 'no-transport' });
        return;
      }
      const url = `${wsBase}/api/ws/convoy/${tripId}?token=${encodeURIComponent(token)}`;
      setState(attempt === 0 ? { kind: 'connecting' } : { kind: 'reconnecting', attempt, nextRetryMs: 0 });

      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch {
        scheduleRetry();
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) return;
        attempt = 0; // reset backoff on successful handshake
        setState({ kind: 'connected' });
      };

      ws.onmessage = (e) => {
        if (cancelled) return;
        try {
          const d = JSON.parse(e.data);
          if (d.type === 'state') {
            setMembers(d.members || []);
          } else if (d.type === 'trip_ended') {
            onTripEndedRef.current?.();
          }
        } catch {}
      };

      ws.onerror = () => {
        // RN WebSocket fires error → close in sequence; we let onclose drive
        // retry so we don't double-retry.
      };

      ws.onclose = (e) => {
        if (cancelled) return;
        wsRef.current = null;
        if (TERMINAL_CODES.has(e.code)) {
          setState({ kind: 'failed', reason: `close-${e.code}` });
          return;
        }
        scheduleRetry();
      };
    }

    function scheduleRetry() {
      if (cancelled) return;
      const delay = backoffMs(attempt);
      attempt += 1;
      setState({ kind: 'reconnecting', attempt, nextRetryMs: delay });
      retryTimer = setTimeout(() => {
        retryTimer = null;
        connect();
      }, delay);
    }

    connect();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws) {
        try {
          // 1000 = normal closure. Server-side `force_disconnect` uses 4xxx;
          // we never originate those.
          ws.close(1000);
        } catch {}
      }
    };
  }, [tripId]);

  /** Send a pos update if the socket is open. No-op otherwise — the next
   * tick after reconnect will deliver the freshest sample. */
  const sendPos = useCallback((p: PosPayload) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== 1) return false;
    try {
      ws.send(JSON.stringify({ type: 'pos', ...p }));
      return true;
    } catch {
      return false;
    }
  }, []);

  return { members, state, sendPos };
}
