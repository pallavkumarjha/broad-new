import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, StatusBar, Platform, Animated, useWindowDimensions, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { Accelerometer } from 'expo-sensors';
import { api } from '../../src/lib/api';
import { useConvoySocket } from '../../src/lib/useConvoySocket';
import {
  startBackgroundTracking,
  stopBackgroundTracking,
  isBackgroundTrackingActive,
} from '../../src/lib/backgroundLocation';
import { useSettings } from '../../src/contexts/SettingsContext';
import { useAuth } from '../../src/contexts/AuthContext';
import { colors, type, space, fonts } from '../../src/theme/tokens';
import { Eyebrow, Meta } from '../../src/components/ui';
import { MapView, type LiveMarker, type FollowMode } from '../../src/components/MapView';
import { SOSButton } from '../../src/components/SOSButton';

/** Bearing between two lat/lng points in degrees (0 = north, clockwise). Used to
 * rotate the rider's marker so the crew can see which direction they're heading
 * when the GPS itself doesn't report bearing (common at low speeds). */
function bearingDeg(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const Δλ = toRad(b.lng - a.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Great-circle distance between two lat/lng points in metres. Used to
 * accumulate trip distance from successive GPS samples. Haversine — accurate
 * to ~0.5% which is well under the GPS error itself, no point reaching for
 * Vincenty here. */
function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000; // earth radius in metres
  const toRad = (d: number) => (d * Math.PI) / 180;
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const Δφ = toRad(b.lat - a.lat);
  const Δλ = toRad(b.lng - a.lng);
  const h = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** A position is "stale" if no update arrived in this many ms. We gray it on
 * the map and in the roster to signal the rider may have lost signal. */
const STALE_AFTER_MS = 30_000;

// Live Ride — DARK MODE instrument panel.
// All telemetry sourced from real GPS. No mock simulation.
export default function LiveRide() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { settings } = useSettings();
  const { user: currentUser } = useAuth();
  const [trip, setTrip] = useState<any>(null);
  const [distanceM, setDistanceM] = useState(0); // accumulated GPS distance in metres
  const [progress, setProgress] = useState(0); // 0..1 — distanceM / planned distance, capped at 1
  const [speed, setSpeed] = useState(0);
  const [displaySpeed, setDisplaySpeed] = useState(0);
  const [topSpeed, setTopSpeed] = useState(0);
  const [elapsed, setElapsed] = useState(0); // seconds
  const [gpsActive, setGpsActive] = useState(false);
  const [realPos, setRealPos] = useState<{ lat: number; lng: number } | null>(null);
  const [heading, setHeading] = useState(0);
  const [accuracyM, setAccuracyM] = useState<number | null>(null);
  // Camera follow strategy. Defaults to 'self' so a fresh ride centres on
  // the rider's own dot. Auto-flips to 'free' if the rider drags the map
  // (handled inside the WebView, surfaced via `onFollowModeChange`).
  const [followMode, setFollowMode] = useState<FollowMode>('self');
  // Pan-to-marker target. We bump a nonce-style state pair each time a
  // pan request arrives so MapView fires its `panToMarkerId` effect even
  // when the rider taps the same row twice in a row. The id is what the
  // map looks up; the nonce is what useEffect actually compares.
  const [panToId, setPanToId] = useState<string | null>(null);
  const panNonceRef = useRef(0);
  // Crew roster collapsed by default in the redesign — saves ~200px below
  // the map. Avatar stack and rider count stay visible; tap reveals the
  // full list with per-rider speed + pan-to-marker affordance.
  const [crewExpanded, setCrewExpanded] = useState(false);
  // Re-render once a second so stale-marker computation (based on
  // updated_at vs Date.now()) actually picks up missing ticks even when
  // no fresh WS message has arrived to trigger a render.
  const [, setTick] = useState(0);
  // Source of truth for "when did this ride start". Initialised to mount-time
  // as a placeholder, then overwritten with `trip.started_at` from the DB once
  // the trip loads. Without this, opening the ride screen 30 minutes into a
  // ride showed a fresh 00:00 elapsed clock instead of the real elapsed time.
  const startedAt = useRef<number>(Date.now());
  const locSub = useRef<any>(null);
  const accelSub = useRef<any>(null);
  const lastAccel = useRef({ x: 0, y: 0, z: 0 });
  const crashHandled = useRef(false);
  const speedAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  // Refs so triggerSos (defined via useCallback below) always has fresh values
  // even when called from long-lived effects (crash detection, auto-SOS timer).
  const speedRef = useRef(0);
  const headingRef = useRef(0);
  // Last GPS sample we used to derive a bearing — Expo's `coords.heading` is
  // unreliable at low speed and on Android emulators, so we compute our own.
  const lastSampleRef = useRef<{ lat: number; lng: number; ts: number } | null>(null);

  // Keep speedRef + headingRef in sync so triggerSos / WS broadcast always have
  // the latest reading without re-binding callbacks.
  useEffect(() => { speedRef.current = speed; }, [speed]);
  useEffect(() => { headingRef.current = heading; }, [heading]);

  // Drive the stale-marker timer. Cheap (one setState per second) and only
  // needed while the ride screen is mounted.
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Refs that the SOS payload reads. Updated below via refs (not deps) so the
  // callback identity stays stable for the crash-detection effect's listener.
  const realPosRef = useRef<{ lat: number; lng: number } | null>(null);
  useEffect(() => { realPosRef.current = realPos; }, [realPos]);
  // Last-known position fallback for SOS. Updated whenever a fresh GPS
  // sample lands; preserved across signal loss so a rider in a tunnel can
  // still trigger SOS with their last good location instead of being blocked
  // by "waiting for GPS". The note string we send tells responders how stale
  // the fix is so they know whether to trust the pin.
  const lastKnownPosRef = useRef<{ lat: number; lng: number; ts: number } | null>(null);
  useEffect(() => {
    if (realPos) {
      lastKnownPosRef.current = { lat: realPos.lat, lng: realPos.lng, ts: Date.now() };
    }
  }, [realPos]);
  // Guard against double-tap / multiple paths into triggerSos (long-press
  // button + crash auto-fire + crash "Send SOS now"). Without this we used
  // to create two SOS events for one incident.
  const sosInflight = useRef(false);

  // Trigger an SOS.
  //
  // Position selection (in priority order):
  //   1. Fresh `realPos` — current GPS fix, best case.
  //   2. `lastKnownPos` — most recent fix we ever had this session. Note
  //      string flags how stale it is so responders see "STALE: 47s ago".
  //   3. Nothing → refuse, prompt the rider to wait. We never fall back to
  //      trip start coordinates — sending S&R to the wrong location is a
  //      worse failure than asking the rider to wait two seconds.
  const triggerSos = useCallback(async () => {
    if (sosInflight.current) return;
    let pos: { lat: number; lng: number } | null = realPosRef.current;
    let note = '';
    if (!pos && lastKnownPosRef.current) {
      const ageS = Math.round((Date.now() - lastKnownPosRef.current.ts) / 1000);
      pos = { lat: lastKnownPosRef.current.lat, lng: lastKnownPosRef.current.lng };
      // Emergency contacts and crew see this string in the SOS detail view.
      // Keep it short — `note` field caps at 500 chars on the server.
      note = `Last known position: ${ageS}s old`;
    }
    if (!pos) {
      Alert.alert(
        'Waiting for GPS',
        "No location fix yet — not even a stale one. Wait a few seconds for the GPS to lock and try again.",
      );
      return;
    }
    sosInflight.current = true;
    try {
      const { data } = await api.post('/sos', {
        trip_id: id,
        lat: pos.lat,
        lng: pos.lng,
        speed_kmh: speedRef.current,
        // Use the heading we computed from successive GPS samples. Was hard-
        // coded to 0, which made every SOS map pin look like the rider was
        // facing north regardless of actual travel direction.
        heading_deg: headingRef.current,
        ...(note ? { note } : {}),
      });
      router.replace(`/sos/${data.id}`);
    } catch (e: any) {
      // Reset on failure so the rider can retry. Success path navigates away
      // and the screen unmounts, so the flag never needs to flip back.
      sosInflight.current = false;
      Alert.alert('SOS failed to send', e?.response?.data?.detail || e?.message || 'Network error');
    }
  }, [id, router]);

  // Tween the rendered speed toward incoming telemetry so the readout lerps
  // instead of jumping — 72px numerals read calmer when they ease.
  useEffect(() => {
    const id = speedAnim.addListener(({ value }) => {
      setDisplaySpeed(Math.round(value));
    });
    return () => speedAnim.removeListener(id);
  }, [speedAnim]);

  useEffect(() => {
    Animated.timing(speedAnim, {
      toValue: speed,
      duration: 420,
      useNativeDriver: false,
    }).start();
  }, [speed, speedAnim]);

  // Progress hairline — tween amber bar width across top of ride screen
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 600,
      useNativeDriver: false,
    }).start();
  }, [progress, progressAnim]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/trips/${id}`);
        setTrip(data);
        // Anchor the elapsed clock to when the ride actually started, not when
        // this screen mounted. If the rider re-opens the ride 30 min in, the
        // clock should read 0:30:xx, not 0:00:01. `started_at` is an ISO string
        // set by the backend when the organiser hits START TRIP; if it's
        // missing for any reason, leave the mount-time fallback in place.
        if (data?.started_at) {
          const ts = Date.parse(data.started_at);
          if (!Number.isNaN(ts)) {
            startedAt.current = ts;
            // Push one immediate tick so the displayed elapsed jumps to the
            // real value without waiting up to a second for the interval.
            setElapsed(Math.floor((Date.now() - ts) / 1000));
          }
        }
      } catch {}
    })();
  }, [id]);

  // Road-following polyline. Hits the backend cache so this is normally a
  // single quick fetch per ride. Failures are silent — MapView falls back to
  // the straight-line polyline between waypoints when `routeCoords` is empty.
  const [routeCoords, setRouteCoords] = useState<[number, number][] | undefined>(undefined);
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get(`/trips/${id}/route-geometry`);
        if (!cancelled && Array.isArray(data?.coords) && data.coords.length >= 2) {
          setRouteCoords(data.coords);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [id]);

  // Elapsed-time tick. Speed + progress now sourced from GPS only.
  useEffect(() => {
    const t = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt.current) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // Trip's planned total distance (km). Captured in a ref so `ingestSample`
  // can compute progress without including `trip` in its deps and bouncing
  // the location subscription on every trip refetch.
  const plannedKmRef = useRef(0);
  useEffect(() => { plannedKmRef.current = trip?.distance_km || 0; }, [trip?.distance_km]);

  // Common handler: ingest one GPS sample, push it through to state + refs.
  // Centralised so web (navigator.geolocation) and native (expo-location)
  // share identical filtering, heading derivation, and stat tracking.
  const ingestSample = useCallback((sample: {
    lat: number; lng: number; speed?: number | null; heading?: number | null; accuracy?: number | null;
  }) => {
    const next = { lat: sample.lat, lng: sample.lng };
    setGpsActive(true);
    setRealPos(next);

    // Speed: device reports m/s, we display km/h. Negative = "unknown".
    const rawSpeed = sample.speed ?? -1;
    if (rawSpeed >= 0) {
      const sp = Math.round(rawSpeed * 3.6);
      setSpeed(Math.max(0, sp));
      setTopSpeed(ts => Math.max(ts, sp));
    }

    // Accuracy: only used to gate whether we trust the fix. Don't broadcast
    // anything worse than 50m — the server will reject >100m anyway and
    // we'd rather not burn bandwidth on samples that get tossed.
    if (typeof sample.accuracy === 'number' && sample.accuracy >= 0) {
      setAccuracyM(sample.accuracy);
    }

    // Heading: prefer device heading when available + the rider is moving
    // fast enough for it to be meaningful; otherwise derive from delta vs
    // the last sample (Haversine bearing). Stationary riders keep their
    // last known heading instead of jittering to 0.
    const devHeading = typeof sample.heading === 'number' && sample.heading >= 0 ? sample.heading : null;
    const moving = rawSpeed >= 1.5; // ~5 km/h — slower than this and bearing is noise
    const last = lastSampleRef.current;
    let h = headingRef.current;
    if (devHeading != null && moving) {
      h = devHeading;
    } else if (last && moving) {
      const dist = Math.hypot(next.lat - last.lat, next.lng - last.lng);
      // Skip jitter: positions within ~1m of each other tell us nothing.
      if (dist > 0.00001) h = bearingDeg(last, next);
    }
    setHeading(h);

    // Distance accumulator. Adds the haversine delta from the previous fix
    // when we believe both fixes — the rider must be moving (filters GPS
    // noise while stationary) and the segment must be ≤500m (filters cell-
    // tower fallback teleports). Without this gate, a phone left on a desk
    // would tick up distance from accuracy drift; without the cap a rider
    // would jump 50km when the phone briefly dropped to coarse location.
    if (last && moving) {
      const segM = haversineMeters(last, next);
      if (segM > 0 && segM < 500) {
        setDistanceM(d => {
          const total = d + segM;
          const planned = plannedKmRef.current * 1000;
          if (planned > 0) setProgress(Math.min(1, total / planned));
          return total;
        });
      }
    }

    lastSampleRef.current = { ...next, ts: Date.now() };
  }, []);

  // Real GPS (native) or browser geolocation (web) — graceful fallback.
  // Permission denial is surfaced loudly: a silent failure here looks like
  // the whole ride feature is broken (no speed, no map dot, no SOS coords)
  // when actually one tap could fix it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (Platform.OS === 'web') {
          if ('geolocation' in navigator) {
            const watchId = navigator.geolocation.watchPosition(
              (pos) => {
                if (cancelled) return;
                ingestSample({
                  lat: pos.coords.latitude,
                  lng: pos.coords.longitude,
                  speed: pos.coords.speed,
                  heading: pos.coords.heading,
                  accuracy: pos.coords.accuracy,
                });
              },
              (err) => {
                if (cancelled) return;
                if (err && err.code === 1 /* PERMISSION_DENIED */) {
                  Alert.alert(
                    'Location blocked',
                    'Allow location access in your browser settings so the app can show your position and SOS coordinates.',
                  );
                }
              },
              { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
            );
            locSub.current = { remove: () => navigator.geolocation.clearWatch(watchId) };
          }
        } else {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== 'granted') {
            if (!cancelled) {
              Alert.alert(
                'Location permission needed',
                'Open Settings → Apps → Broad → Permissions → Location and pick "Allow only while using the app" so your crew can see you on the map.',
              );
            }
            return;
          }
          locSub.current = await Location.watchPositionAsync(
            { accuracy: Location.Accuracy.High, timeInterval: 2000, distanceInterval: 5 },
            (pos) => {
              if (cancelled) return;
              ingestSample({
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                speed: pos.coords.speed,
                heading: pos.coords.heading,
                accuracy: pos.coords.accuracy,
              });
            }
          );
        }
      } catch {}
    })();
    return () => { cancelled = true; try { locSub.current?.remove?.(); } catch {} };
  }, [ingestSample]);

  // Crash detection. Compares the magnitude of consecutive accelerometer
  // samples (Δ in g-units between two ~200ms reads) against a threshold.
  //
  // CRASH_DELTA_G = 4.0
  //   Empirically: hard pothole hits at 80km/h read ~2.0–3.0, an actual
  //   off-from-bike event reads 5+. 3.5 was triggering on speed bumps.
  //   Tighten until field testing tells us otherwise.
  //
  // AUTO_SOS_MS = 10_000
  //   Soft countdown so the rider can cancel before SOS fires. We expose
  //   this via Alert; in a follow-up we'll add an in-screen visual countdown.
  const CRASH_DELTA_G = 4.0;
  const AUTO_SOS_MS = 10_000;
  // Refs for the auto-SOS timer so all three exit paths (I'm fine, Send SOS now,
  // unmount) cancel it. Without this, "Send SOS now" used to fire AND the timer
  // also fired 10s later, producing two SOS events for one incident.
  const autoSosTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reArmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Countdown UI state. When non-null, the in-screen overlay renders showing
  // remaining seconds + "I'm fine" / "Send SOS now" buttons. Replaces the
  // system Alert so the rider can actually see the timer counting down — the
  // old Alert just had a static message and gave no feedback that time was
  // ticking until SOS auto-fired.
  const [crashCountdown, setCrashCountdown] = useState<number | null>(null);
  const clearCrashTimers = useCallback(() => {
    if (autoSosTimerRef.current) { clearTimeout(autoSosTimerRef.current); autoSosTimerRef.current = null; }
    if (reArmTimerRef.current) { clearTimeout(reArmTimerRef.current); reArmTimerRef.current = null; }
    if (countdownTickRef.current) { clearInterval(countdownTickRef.current); countdownTickRef.current = null; }
    setCrashCountdown(null);
  }, []);

  // "I'm fine" — dismisses the overlay, cancels auto-SOS, re-arms crash
  // detection after a 5s grace window.
  const dismissCrash = useCallback(() => {
    clearCrashTimers();
    reArmTimerRef.current = setTimeout(() => {
      crashHandled.current = false;
      reArmTimerRef.current = null;
    }, 5000);
  }, [clearCrashTimers]);

  // "Send SOS now" — fires immediately, cancels timer to avoid double-fire.
  const confirmCrashSos = useCallback(() => {
    clearCrashTimers();
    triggerSos();
  }, [clearCrashTimers, triggerSos]);

  useEffect(() => {
    if (!settings.crashDetect) return;
    try { Accelerometer.setUpdateInterval(200); } catch {}
    const sub = Accelerometer.addListener(({ x, y, z }) => {
      const prev = lastAccel.current;
      const delta = Math.sqrt((x - prev.x) ** 2 + (y - prev.y) ** 2 + (z - prev.z) ** 2);
      lastAccel.current = { x, y, z };
      if (delta > CRASH_DELTA_G && !crashHandled.current) {
        crashHandled.current = true;
        // Open the in-screen countdown overlay. The visible timer ticks down
        // every second so the rider sees how long they have to react.
        setCrashCountdown(Math.round(AUTO_SOS_MS / 1000));
        countdownTickRef.current = setInterval(() => {
          setCrashCountdown((n) => (n == null || n <= 0 ? n : n - 1));
        }, 1000);
        autoSosTimerRef.current = setTimeout(() => {
          autoSosTimerRef.current = null;
          if (countdownTickRef.current) { clearInterval(countdownTickRef.current); countdownTickRef.current = null; }
          setCrashCountdown(null);
          if (crashHandled.current) triggerSos();
        }, AUTO_SOS_MS);
      }
    });
    accelSub.current = sub;
    return () => {
      try { sub.remove(); } catch {}
      // Cancel any pending auto-SOS / re-arm + tick so they don't fire after
      // the ride screen unmounts (eg. user navigates away during the 10s window).
      clearCrashTimers();
    };
  }, [settings.crashDetect, triggerSos, clearCrashTimers]);

  // Background-location toggle. Default off — riders opt in per ride because
  // it's a battery cost they should consciously accept (and because Android's
  // "Allow all the time" prompt is jarring without context).
  const [bgActive, setBgActive] = useState(false);
  useEffect(() => {
    let cancelled = false;
    isBackgroundTrackingActive().then(active => {
      if (!cancelled) setBgActive(active);
    });
    return () => { cancelled = true; };
  }, []);
  const toggleBackground = useCallback(async () => {
    if (bgActive) {
      await stopBackgroundTracking();
      setBgActive(false);
      return;
    }
    if (!id) return;
    const res = await startBackgroundTracking(id);
    if (res.ok) {
      setBgActive(true);
    } else if (res.reason === 'foreground_denied' || res.reason === 'background_denied') {
      Alert.alert(
        'Background location needed',
        'Open Settings → Apps → Broad → Permissions → Location, and pick "Allow all the time" so your crew can still see you when the screen is off.',
      );
    } else if (res.reason === 'unsupported') {
      Alert.alert('Not available on web', 'Background tracking requires the mobile app.');
    }
  }, [bgActive, id]);

  // Note: we deliberately do NOT stop background tracking on unmount.
  // - User toggling BG off explicitly is the foreground stop path.
  // - Server returning `trip_not_active` (trip ended / rider removed) makes
  //   the background task stop itself from inside `backgroundLocation.ts`.
  // - Routing within the app (ride → trip detail → home) shouldn't kill BG
  //   because the rider explicitly opted in for the whole ride duration.
  // The previous version stopped BG on every unmount, which meant any nav
  // away from the ride screen silently disabled the feature.

  // Convoy WebSocket — auto-reconnects on drops with exponential backoff.
  // `members` mirrors the latest server `state` payload; `sendPos` is a no-op
  // when the socket is closed, so the next reconnect picks up the fresh sample.
  const onTripEnded = useCallback(() => {
    router.replace(`/complete/${id}`);
  }, [id, router]);
  // Track SOS ids we've already alerted on. The same SOS may arrive through
  // both this socket and the global listener — without dedupe we'd raise
  // twice. Module-level Set isn't right because navigating away/back should
  // re-show alerts that fired during a previous session.
  const seenSosRef = useRef<Set<string>>(new Set());
  const onSos = useCallback((sos: { sender: string; sender_user_id: string; sos_id: string }) => {
    // Server already excludes the sender from its own broadcast to avoid the
    // sender alerting themselves, but belt and braces: filter again locally.
    if (sos.sender_user_id && currentUser?.id && sos.sender_user_id === currentUser.id) return;
    if (seenSosRef.current.has(sos.sos_id)) return;
    seenSosRef.current.add(sos.sos_id);
    Alert.alert(
      'SOS Alert',
      `${sos.sender} has triggered an SOS. They may need help.`,
      [
        { text: 'Dismiss', style: 'cancel' },
        { text: 'View SOS', onPress: () => router.push(`/sos/respond/${sos.sos_id}` as any) },
      ],
      { cancelable: false },
    );
  }, [currentUser?.id, router]);
  // Crew clients receive leg advances via the convoy WS (server fans out a
  // {type:"leg"} payload from POST /trips/{id}/advance-leg). Patch local trip
  // state so the leg label and NAVIGATE button update without a full refetch.
  const onLegChange = useCallback((idx: number) => {
    setTrip((prev: any) => (prev ? { ...prev, current_leg_index: idx } : prev));
  }, []);
  const { members: convoyMembers, state: convoyState, sendPos, retry: retryConvoy } = useConvoySocket(
    id,
    { onTripEnded, onSos, onLegChange },
  );

  // Broadcast own GPS position. Skip if no real fix yet — never send
  // interpolated/mock coords (would mislead the rest of the crew on the map).
  useEffect(() => {
    const t = setInterval(() => {
      if (!realPos) return;
      sendPos({
        lat: realPos.lat,
        lng: realPos.lng,
        speed_kmh: speed,
        heading_deg: heading,
        accuracy_m: accuracyM,
      });
    }, 3000);
    return () => clearInterval(t);
  }, [speed, heading, accuracyM, realPos, sendPos]);

  const { width: screenWidth } = useWindowDimensions();

  if (!trip) {
    return <View style={[styles.container, styles.center]}><ActivityIndicator color={colors.dark.amber} /></View>;
  }

  const allPoints = [trip.start, ...(trip.waypoints || []), trip.end].filter(Boolean);

  // Leg derivation. A trip is an ordered point list; each pair of adjacent
  // points is one leg. The organiser advances the pointer as they reach each
  // stop (POST /advance-leg), so the NAVIGATE button always opens the *next
  // segment*, not the entire trip. Crew clients receive the new index over
  // the convoy WS so the label and Maps URL update for everyone.
  const legPoints: Array<{ name: string; lat: number; lng: number }> = allPoints as any;
  const totalLegs = Math.max(0, legPoints.length - 1);
  const rawLegIndex = Number(trip.current_leg_index ?? 0);
  const currentLegIndex = Math.max(0, Math.min(rawLegIndex, totalLegs - 1));
  const legFrom = legPoints[currentLegIndex];
  const legTo = legPoints[currentLegIndex + 1];
  const isLastLeg = totalLegs <= 1 || currentLegIndex >= totalLegs - 1;

  const openInGoogleMaps = () => {
    if (!legFrom || !legTo) return;
    // Universal deep-link format. Works for Maps app on iOS/Android and falls
    // back to the web client when the app isn't installed. travelmode=driving
    // matches the rider use case; OSRM also drives the on-screen polyline.
    const url =
      `https://www.google.com/maps/dir/?api=1` +
      `&origin=${legFrom.lat},${legFrom.lng}` +
      `&destination=${legTo.lat},${legTo.lng}` +
      `&travelmode=driving`;
    Linking.openURL(url).catch(() => {
      Alert.alert("Couldn't open Maps", 'Google Maps is not available on this device.');
    });
  };

  const advanceLeg = async () => {
    if (!isOrganiser) return;
    try {
      const { data } = await api.post(`/trips/${id}/advance-leg`);
      setTrip(data);
    } catch (e: any) {
      Alert.alert(
        "Couldn't advance leg",
        e?.response?.data?.detail || e?.message || 'Network error. Try again.',
      );
    }
  };

  // Compute the marker list for the map. Self comes from local GPS state
  // (zero round-trip latency), crew comes from the WS state payload.
  // Falls back to trip start when neither has a fix so the map still shows
  // a sensible centroid instead of [0,0] in the Atlantic.
  const myId = currentUser?.id;
  const now = Date.now();
  const markers: LiveMarker[] = [];
  if (realPos) {
    markers.push({
      id: myId || '__self__',
      lat: realPos.lat,
      lng: realPos.lng,
      heading_deg: heading,
      name: currentUser?.name || 'You',
      // speed/updated_at flow into the WebView popup so a tap on self shows
      // the same telemetry as the speedometer + a "now" timestamp.
      speed_kmh: speed,
      updated_at: new Date().toISOString(),
      isSelf: true,
    });
  }
  for (const m of convoyMembers) {
    // Skip self in the WS payload — we render local self above so the map
    // shows zero-latency motion instead of the 3s WS tick.
    if (m.user_id === myId) continue;
    if (m.lat == null || m.lng == null) continue;
    const updatedTs = m.updated_at ? Date.parse(m.updated_at) : 0;
    const stale = updatedTs > 0 && now - updatedTs > STALE_AFTER_MS;
    markers.push({
      id: m.user_id,
      lat: m.lat,
      lng: m.lng,
      heading_deg: m.heading_deg ?? 0,
      name: m.name,
      speed_kmh: m.speed_kmh ?? 0,
      updated_at: m.updated_at,
      stale,
    });
  }

  const fmtTime = (s: number) => {
    const h = Math.floor(s / 3600).toString().padStart(2, '0');
    const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
    const ss = (s % 60).toString().padStart(2, '0');
    return `${h}:${m}:${ss}`;
  };

  // Actual kilometres travelled, derived from accumulated GPS deltas. Falls
  // back to (planned * progress) when GPS gave us nothing — better than
  // showing zero on a trip the rider clearly rode.
  const distanceCovered = (distanceM > 0 ? distanceM / 1000 : trip.distance_km * progress).toFixed(1);

  // Only the organiser can end (PATCH status=completed on the trip). Until
  // this gating landed the END button was rendered for everyone, so crew
  // members tapping it got 403 from the backend with no clear UI message —
  // looked like the app had hung. Now non-organisers see LEAVE instead.
  const isOrganiser = !!currentUser?.id && trip?.user_id === currentUser.id;

  const endTrip = async () => {
    if (!isOrganiser) {
      // Defensive: this path shouldn't be reachable since the END button is
      // gated to organisers, but if a future caller bypasses that we surface
      // a clear message rather than hitting the backend's 403.
      Alert.alert("Not allowed", "Only the organiser can end this ride. Use LEAVE to drop out.");
      return;
    }
    try {
      await api.patch(`/trips/${id}`, {
        status: 'completed',
        actual_distance_km: parseFloat(distanceCovered),
        top_speed_kmh: topSpeed,
        duration_min: Math.round(elapsed / 60),
      });
      // Stop background broadcast immediately — without this, the foreground
      // service keeps firing for one more cycle until the server returns
      // `trip_not_active`, which is a small but visible battery hit.
      await stopBackgroundTracking().catch(() => {});
      router.replace(`/complete/${id}`);
    } catch (e: any) {
      // Don't navigate away on failure — riders should be able to retry rather
      // than seeing the trip stuck on "active" because the patch silently 503'd.
      Alert.alert(
        "Couldn't end ride",
        e?.response?.data?.detail || e?.message || 'Network error. Try again.',
      );
    }
  };

  // Crew member version of "I'm done with this ride". Removes the rider from
  // the trip's crew_ids and routes them home — the trip itself stays active
  // for the remaining riders. Confirmation prompt to avoid a fat-finger drop
  // mid-ride.
  const leaveRide = () => {
    Alert.alert(
      'Leave this ride?',
      'You will stop sharing location with the crew. The organiser will be notified.',
      [
        { text: 'Stay', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.post(`/trips/${id}/leave`);
              await stopBackgroundTracking().catch(() => {});
              router.replace('/(tabs)');
            } catch (e: any) {
              Alert.alert(
                "Couldn't leave",
                e?.response?.data?.detail || e?.message || 'Network error. Try again.',
              );
            }
          },
        },
      ],
    );
  };

  // Crew excluding self — used three times below (avatar stack, count badge,
  // expanded roster). Compute once so the filter doesn't run per render path.
  const otherCrew = convoyMembers.filter((m: any) => m.user_id !== myId);

  // Status-rail dot colour for the WS connection state. The status rail is
  // the only place we surface convoy connection health now (the wordy
  // "RECONNECTING…/OFFLINE" header text is gone in the redesign), so the
  // failed branch here also doubles as the manual retry hit target.
  const wsDotColor =
    convoyState.kind === 'connected' ? colors.dark.safe :
    convoyState.kind === 'failed' ? colors.dark.sos :
    colors.dark.amber; // connecting / reconnecting / idle

  return (
    <View style={styles.container} testID="live-ride-screen">
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>

        {/* HEADER — slim live pill, close left, spacer right (NEXT/END now
            lives in the sticky action bar where it has a real hit target). */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} testID="ride-close-btn" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Feather name="x" size={20} color={colors.dark.ink} />
          </TouchableOpacity>
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Meta style={{ color: colors.dark.amber, marginLeft: 6 }}>
              LIVE · {trip.name.toUpperCase()}
            </Meta>
          </View>
          <View style={{ width: 20 }} />
        </View>

        {/* PROGRESS — 3px bar with leg ticks. Passed legs amber, current
            leg's tick is white-and-taller, future ticks dim. Hidden on
            single-leg trips where ticks would just bookend a flat bar. */}
        <View style={styles.progressTrack} testID="ride-progress-track">
          <Animated.View
            testID="ride-progress-bar"
            style={[
              styles.progressBar,
              {
                width: progressAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '100%'],
                }),
              },
            ]}
          />
          {totalLegs > 1 && legPoints.map((_, i) => {
            const left = (i / (legPoints.length - 1)) * 100;
            const passed = i <= currentLegIndex;
            const isNext = i === currentLegIndex + 1;
            return (
              <View
                key={i}
                style={[
                  styles.progressTick,
                  { left: `${left}%` },
                  passed && styles.progressTickPassed,
                  isNext && styles.progressTickCurrent,
                ]}
              />
            );
          })}
        </View>

        {/* STATUS RAIL — single mono row replacing three scattered eyebrows.
            BG dot doubles as the BG-broadcast toggle. WS dot, when failed,
            doubles as the manual convoy retry. */}
        <View style={styles.statusRail}>
          <View style={styles.statusItem}>
            <View style={[styles.statusRailDot, { backgroundColor: gpsActive ? colors.dark.safe : colors.dark.amber }]} />
            <Meta style={{ color: colors.dark.inkMuted, marginLeft: 5 }}>GPS</Meta>
          </View>
          <Meta style={{ color: colors.dark.rule }}>·</Meta>
          <TouchableOpacity
            onPress={convoyState.kind === 'failed' ? retryConvoy : undefined}
            testID={convoyState.kind === 'failed' ? 'ride-convoy-retry-btn' : undefined}
            disabled={convoyState.kind !== 'failed'}
            style={styles.statusItem}
            activeOpacity={0.7}
          >
            <View style={[styles.statusRailDot, { backgroundColor: wsDotColor }]} />
            <Meta style={{ color: colors.dark.inkMuted, marginLeft: 5 }}>
              {convoyState.kind === 'failed' ? 'WS · RETRY' : 'WS'}
            </Meta>
          </TouchableOpacity>
          <Meta style={{ color: colors.dark.rule }}>·</Meta>
          <TouchableOpacity onPress={toggleBackground} testID="ride-bg-toggle" style={styles.statusItem} activeOpacity={0.7}>
            <View style={[styles.statusRailDot, { backgroundColor: bgActive ? colors.dark.safe : colors.dark.inkMuted }]} />
            <Meta style={{ color: colors.dark.inkMuted, marginLeft: 5 }}>BG</Meta>
          </TouchableOpacity>
          {accuracyM != null && (
            <>
              <Meta style={{ color: colors.dark.rule }}>·</Meta>
              <Meta style={{ color: colors.dark.inkMuted }}>±{Math.round(accuracyM)}M</Meta>
            </>
          )}
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: space.lg }}>

          {/* HERO — leg eyebrow + speed numeral + TOP stat in one block.
              Replaces the old separate leg-block + speedo-block + their
              respective dividers. The numeral hugs the baseline; KM/H label
              floats top-right where the eye lands first. */}
          <View style={styles.hero}>
            {totalLegs > 1 && legFrom && legTo && (
              <View style={styles.legEyebrow}>
                <Meta style={{ color: colors.dark.amber }}>LEG {currentLegIndex + 1}/{totalLegs}</Meta>
                <Meta style={{ color: colors.dark.inkMuted, marginLeft: 8 }} numberOfLines={1}>
                  {(legFrom.name || 'START').toUpperCase()} → {(legTo.name || 'END').toUpperCase()}
                </Meta>
              </View>
            )}
            <Meta style={styles.speedUnit}>KM/H</Meta>
            <View style={styles.speedRow}>
              <Text testID="ride-speed-text" style={[type.instrument, styles.speedNum]}>{displaySpeed}</Text>
              <View style={styles.topStat}>
                <Meta style={{ color: colors.dark.inkMuted }}>TOP</Meta>
                <Text style={[type.h1, { color: colors.dark.ink, marginTop: 2 }]}>{Math.round(topSpeed)}</Text>
              </View>
            </View>
          </View>

          {/* MAP — self + crew live markers, diffed by id inside the WebView.
              `routeCoords` is the OSRM road-following polyline; falls back to
              straight-line waypoint connections when not yet loaded. The map
              is the rider's primary lookup tool — the redesign keeps it the
              same height and adds a NAVIGATE pill at bottom-left so launching
              Google Maps stays in the map's spatial context. */}
          <View style={styles.mapWrap}>
            <View style={{ width: screenWidth, height: 300 }}>
              <MapView
                points={allPoints}
                dark
                width={screenWidth}
                height={300}
                markers={markers}
                routeCoords={routeCoords}
                followMode={followMode}
                panToMarkerId={panToId}
                onMarkerPress={() => { /* Leaflet handles popup in-WebView; nothing else to do here */ }}
                onFollowModeChange={(mode) => setFollowMode(mode)}
              />
              {/* Follow-mode pill — overlaid top-right of the map. Cycles
                  self → centroid → free → self each tap. The pill mirrors
                  the WebView's internal state, including the auto-flip to
                  free that fires when the rider drags the map. */}
              <TouchableOpacity
                testID="ride-follow-mode-btn"
                onPress={() => {
                  const next: FollowMode =
                    followMode === 'self' ? 'centroid' :
                    followMode === 'centroid' ? 'free' : 'self';
                  setFollowMode(next);
                }}
                style={styles.followPill}
                activeOpacity={0.85}
              >
                <Feather
                  name={followMode === 'self' ? 'navigation' : followMode === 'centroid' ? 'users' : 'move'}
                  size={12}
                  color={followMode === 'free' ? colors.dark.inkMuted : colors.dark.amber}
                />
                <Meta
                  style={{
                    color: followMode === 'free' ? colors.dark.inkMuted : colors.dark.amber,
                    marginLeft: 6,
                  }}
                >
                  {followMode === 'self' ? 'FOLLOW · ME' : followMode === 'centroid' ? 'FOLLOW · CREW' : 'FREE PAN'}
                </Meta>
              </TouchableOpacity>
              {/* NAVIGATE pill — bottom-left of the map. Ghost-style amber
                  border (was a filled full-width amber button before the
                  redesign — the filled treatment competed with the speed
                  numeral and the action bar). Available to all crew, not
                  just the organiser, since anyone can want turn-by-turn. */}
              {legFrom && legTo && (
                <TouchableOpacity
                  onPress={openInGoogleMaps}
                  testID="ride-navigate-btn"
                  style={styles.navigatePill}
                  activeOpacity={0.85}
                >
                  <Feather name="navigation" size={12} color={colors.dark.amber} />
                  <Meta style={{ color: colors.dark.amber, marginLeft: 6 }}>NAVIGATE · GOOGLE MAPS</Meta>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* CREW RAIL — collapsed by default. Avatar stack of up to 3
              riders + an overflow chip; the count summary still shows
              everyone. Tap to expand into the full per-rider list with
              speed and pan-to-marker, which is identical to the previous
              roster section — just hidden behind a tap so the screen
              doesn't dump four+ rows below the fold. */}
          <TouchableOpacity
            onPress={() => setCrewExpanded(v => !v)}
            style={styles.crewRail}
            activeOpacity={0.7}
            testID="ride-crew-rail"
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={styles.avatars}>
                {otherCrew.slice(0, 3).map((m: any, i: number) => (
                  <View key={m.user_id} style={[styles.avatar, i > 0 && { marginLeft: -8 }]}>
                    <Text style={styles.avatarText}>{(m.name || '?').slice(0, 2).toUpperCase()}</Text>
                  </View>
                ))}
                {otherCrew.length > 3 && (
                  <View style={[styles.avatar, styles.avatarOverflow, { marginLeft: -8 }]}>
                    <Text style={styles.avatarText}>+{otherCrew.length - 3}</Text>
                  </View>
                )}
                {otherCrew.length === 0 && (
                  <View style={[styles.avatar, styles.avatarEmpty]}>
                    <Feather name="users" size={11} color={colors.dark.inkMuted} />
                  </View>
                )}
              </View>
              <Meta style={{ color: colors.dark.ink, marginLeft: space.md }}>
                CREW · <Text style={{ color: colors.dark.amber }}>{otherCrew.length} RIDING</Text>
              </Meta>
            </View>
            <Meta style={{ color: colors.dark.inkMuted }}>
              {crewExpanded ? 'COLLAPSE ▴' : 'EXPAND ▾'}
            </Meta>
          </TouchableOpacity>

          {crewExpanded && (
            <View style={styles.crewList}>
              {otherCrew.map((m: any) => {
                const updatedTs = m.updated_at ? Date.parse(m.updated_at) : 0;
                const stale = updatedTs > 0 && now - updatedTs > STALE_AFTER_MS;
                const hasFix = m.lat != null && m.lng != null;
                const status = !hasFix ? 'NO FIX' : stale ? 'STALE' : 'LIVE';
                const dotColor = !hasFix || stale ? colors.dark.inkMuted : colors.dark.safe;
                const canPan = hasFix;
                return (
                  <TouchableOpacity
                    key={m.user_id}
                    testID={`convoy-row-${m.user_id}`}
                    style={[styles.convoyRow, !canPan && { opacity: 0.55 }]}
                    activeOpacity={canPan ? 0.6 : 1}
                    disabled={!canPan}
                    onPress={() => {
                      // Tap row → fly map to that rider, open their popup.
                      // Switch follow off so the camera stays parked on them
                      // for a beat instead of snapping back to self next tick.
                      if (followMode !== 'free') setFollowMode('free');
                      panNonceRef.current += 1;
                      // Append a nonce so the same id tapped twice still
                      // re-fires the panToMarkerId effect inside MapView.
                      setPanToId(`${m.user_id}#${panNonceRef.current}`);
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={[styles.statusDot, { backgroundColor: dotColor }]} />
                      <Text style={[type.body, { color: colors.dark.ink }]}>{m.name}</Text>
                      <Meta style={{ color: colors.dark.inkMuted }}>· {status}</Meta>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Meta style={{ color: colors.dark.ink }}>{Math.round(m.speed_kmh || 0)} KM/H</Meta>
                      {canPan && <Feather name="map-pin" size={12} color={colors.dark.inkMuted} />}
                    </View>
                  </TouchableOpacity>
                );
              })}
              {otherCrew.length === 0 && (
                <Text style={[type.meta, { color: colors.dark.inkMuted, paddingVertical: space.sm }]}>
                  No other riders connected yet.
                </Text>
              )}
            </View>
          )}
        </ScrollView>

        {/* STICKY ACTION BAR — primary action always in thumb reach.
            Organiser sees ARRIVED · NEXT LEG until the final leg, then END
            RIDE. Crew see LEAVE RIDE. SOS hold-to-send pill stacks below;
            it stays a deliberate hold (not a tap) so a pocket-press can't
            mis-fire — kept the existing SOSButton component. */}
        <View style={styles.actionBar}>
          {isOrganiser ? (
            <TouchableOpacity
              onPress={isLastLeg ? endTrip : advanceLeg}
              testID={isLastLeg ? 'ride-end-btn' : 'ride-next-leg-btn'}
              style={styles.primaryBtn}
              activeOpacity={0.85}
            >
              <Meta style={styles.primaryBtnText}>
                {isLastLeg ? 'END RIDE' : 'ARRIVED · NEXT LEG'}
              </Meta>
              <Feather
                name={isLastLeg ? 'check-circle' : 'arrow-right'}
                size={14}
                color={colors.dark.bg}
                style={{ marginLeft: 8 }}
              />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={leaveRide}
              testID="ride-leave-btn"
              style={styles.ghostBtn}
              activeOpacity={0.85}
            >
              <Meta style={{ color: colors.dark.amber }}>LEAVE RIDE</Meta>
            </TouchableOpacity>
          )}
          <View style={{ height: space.sm }} />
          <SOSButton onTrigger={triggerSos} testID="live-sos-button" />
        </View>
      </SafeAreaView>

      {/* Crash-detection countdown overlay. Replaces the system Alert so the
          rider sees the timer ticking down. Two paths out: dismiss (re-arm
          after 5s grace) or fire SOS now. Auto-fires when countdown hits 0. */}
      {crashCountdown != null && (
        <View style={styles.crashOverlay} testID="crash-countdown-overlay" pointerEvents="auto">
          <View style={styles.crashCard}>
            <Eyebrow color={colors.dark.sos}>● POSSIBLE CRASH DETECTED</Eyebrow>
            <Text style={[type.h1, { color: colors.dark.ink, marginTop: space.md }]}>
              Are you okay?
            </Text>
            <Text style={[type.bodyLg, { color: colors.dark.inkMuted, marginTop: space.sm }]}>
              SOS auto-trigger in
            </Text>
            <Text
              testID="crash-countdown-text"
              style={[type.instrument, { color: colors.dark.sos, marginTop: 4, fontFamily: fonts.mono }]}
            >
              {crashCountdown}s
            </Text>
            <View style={styles.crashBtnRow}>
              <TouchableOpacity
                onPress={dismissCrash}
                style={[styles.crashBtn, styles.crashBtnGhost]}
                testID="crash-dismiss-btn"
              >
                <Text style={[type.body, { color: colors.dark.ink }]}>I'M FINE</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={confirmCrashSos}
                style={[styles.crashBtn, styles.crashBtnSos]}
                testID="crash-send-now-btn"
              >
                <Text style={[type.body, { color: '#FFFFFF' }]}>SEND SOS NOW</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  // Header — slim, single divider. Live pill is centered between the close
  // button (left) and a symmetric spacer (right) so the pill stays visually
  // anchored when the trip name is short.
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: space.sm + 2, borderBottomWidth: 1, borderBottomColor: colors.dark.rule },
  livePill: { flexDirection: 'row', alignItems: 'center', flex: 1, justifyContent: 'center' },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.dark.amber },

  // Progress bar — 3px (was 2). Track is amber 12% so the unfilled portion
  // still reads as "amber's domain" without competing with the filled bar.
  // Tick marks are absolutely positioned over the track at every leg
  // boundary; passed legs adopt amber, the next-up leg is white-and-taller,
  // future ticks stay on the rule color.
  progressTrack: { height: 3, backgroundColor: 'rgba(217, 102, 6, 0.12)', position: 'relative' },
  progressBar: { height: 3, backgroundColor: colors.dark.amber },
  progressTick: { position: 'absolute', top: -1, width: 1, height: 5, backgroundColor: colors.dark.rule, marginLeft: -0.5 },
  progressTickPassed: { backgroundColor: colors.dark.amber },
  progressTickCurrent: { backgroundColor: colors.dark.ink, height: 7, top: -2, width: 2, marginLeft: -1 },

  // Status rail — single row of dot+label items separated by middots. All
  // labels share the muted ink colour; the dot does the colour signaling.
  statusRail: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: space.lg, paddingVertical: space.sm,
    borderBottomWidth: 1, borderBottomColor: colors.dark.rule,
  },
  statusItem: { flexDirection: 'row', alignItems: 'center' },
  statusRailDot: { width: 6, height: 6, borderRadius: 3 },

  // Hero — leg eyebrow stacks above the speed numeral; the numeral hugs
  // the baseline of the row so the TOP stat (right) aligns to the same
  // baseline. KM/H label floats top-right of the block.
  hero: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.lg, borderBottomWidth: 1, borderBottomColor: colors.dark.rule, position: 'relative' },
  legEyebrow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  speedUnit: { position: 'absolute', top: space.md, right: space.lg, color: colors.dark.inkMuted },
  speedRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: space.sm },
  speedNum: { color: colors.dark.ink },
  topStat: { alignItems: 'flex-end', paddingBottom: space.sm },

  // Map wrap — full-bleed, the MapView fixes its own width/height. Bottom
  // border keeps the visual rhythm with the surrounding rule lines.
  mapWrap: { borderBottomWidth: 1, borderBottomColor: colors.dark.rule },

  // Navigate pill — bottom-left of the map. Ghost border matches the
  // follow pill on the opposite corner; the muted dark backdrop keeps it
  // readable on bright basemap tiles.
  navigatePill: {
    position: 'absolute', left: 12, bottom: 12,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: colors.dark.bg + 'd9',
    borderWidth: 1, borderColor: colors.dark.amber, borderRadius: 2,
  },

  // Crew rail — collapsed summary. Avatar stack overlaps via negative
  // marginLeft so the chips read as a group, not a list.
  crewRail: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: space.lg, paddingVertical: space.md,
    borderBottomWidth: 1, borderBottomColor: colors.dark.rule,
  },
  avatars: { flexDirection: 'row' },
  avatar: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: colors.dark.surface,
    borderWidth: 2, borderColor: colors.dark.bg,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 0.5, color: colors.dark.ink },
  avatarOverflow: { backgroundColor: colors.dark.rule },
  avatarEmpty: { borderStyle: 'dashed', borderColor: colors.dark.rule, borderWidth: 1 },
  // Expanded crew list — same row treatment as the previous roster, just
  // nested under the rail toggle.
  crewList: { paddingHorizontal: space.lg, paddingBottom: space.md },
  convoyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: colors.dark.rule },
  statusDot: { width: 8, height: 8, borderRadius: 4 },

  // Sticky action bar — anchored to the bottom safe area. Primary button
  // fills width; the SOS hold pill sits below with a small gap.
  actionBar: {
    paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm,
    borderTopWidth: 1, borderTopColor: colors.dark.rule,
    backgroundColor: colors.dark.bg,
  },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.dark.amber,
    paddingVertical: 14, paddingHorizontal: space.lg,
    borderRadius: 2,
  },
  primaryBtnText: { color: colors.dark.bg, letterSpacing: 1.8 },
  ghostBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, paddingHorizontal: space.lg,
    borderWidth: 1, borderColor: colors.dark.amber, borderRadius: 2,
  },

  // Follow-mode pill — overlaid top-right of the map. Border colour mirrors
  // text colour (amber when locked, muted when free) so the affordance
  // is readable against the dark Carto basemap.
  followPill: {
    position: 'absolute', top: 12, right: 12,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: colors.dark.bg + 'cc',
    borderWidth: 1, borderColor: colors.dark.rule, borderRadius: 2,
  },
  // Crash-detection countdown overlay. Full-screen semi-opaque scrim with a
  // centred dark card. zIndex high enough to clear the SOS button.
  crashOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: space.lg,
    zIndex: 100, elevation: 100,
  },
  crashCard: {
    width: '100%', maxWidth: 360,
    padding: space.xl,
    borderWidth: 1, borderColor: colors.dark.sos,
    backgroundColor: colors.dark.bg,
    borderRadius: 4,
    alignItems: 'flex-start',
  },
  crashBtnRow: {
    flexDirection: 'row', gap: space.md, marginTop: space.xl, width: '100%',
  },
  crashBtn: {
    flex: 1, paddingVertical: space.md,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 2,
  },
  crashBtnGhost: {
    borderWidth: 1, borderColor: colors.dark.rule,
    backgroundColor: 'transparent',
  },
  crashBtnSos: {
    backgroundColor: colors.dark.sos,
  },
});
