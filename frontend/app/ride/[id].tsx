import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, StatusBar, Platform, Animated, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { Accelerometer } from 'expo-sensors';
import { api } from '../../src/lib/api';
import { useConvoySocket } from '../../src/lib/useConvoySocket';
import { useSettings } from '../../src/contexts/SettingsContext';
import { useAuth } from '../../src/contexts/AuthContext';
import { colors, type, space, fonts } from '../../src/theme/tokens';
import { Eyebrow, Meta } from '../../src/components/ui';
import { MapView, type LiveMarker } from '../../src/components/MapView';
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
  const [progress, setProgress] = useState(0); // 0..1 along route — derived from GPS distance vs trip total
  const [speed, setSpeed] = useState(0);
  const [displaySpeed, setDisplaySpeed] = useState(0);
  const [topSpeed, setTopSpeed] = useState(0);
  const [elapsed, setElapsed] = useState(0); // seconds
  const [gpsActive, setGpsActive] = useState(false);
  const [realPos, setRealPos] = useState<{ lat: number; lng: number } | null>(null);
  const [heading, setHeading] = useState(0);
  const [accuracyM, setAccuracyM] = useState<number | null>(null);
  // Re-render once a second so stale-marker computation (based on
  // updated_at vs Date.now()) actually picks up missing ticks even when
  // no fresh WS message has arrived to trigger a render.
  const [, setTick] = useState(0);
  const startedAt = useRef(Date.now());
  const locSub = useRef<any>(null);
  const accelSub = useRef<any>(null);
  const lastAccel = useRef({ x: 0, y: 0, z: 0 });
  const crashHandled = useRef(false);
  const speedAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  // Refs so triggerSos (defined via useCallback below) always has fresh values
  // even when called from long-lived effects (crash detection, auto-SOS timer).
  const liveMarkerRef = useRef<{ lat: number; lng: number }>({ lat: 0, lng: 0 });
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

  // triggerSos is defined here (before the early return) so the crash-detection
  // effect always captures a valid, stable reference. It reads liveMarkerRef and
  // speedRef which are kept up-to-date via refs rather than stale closures.
  const triggerSos = useCallback(async () => {
    try {
      const pos = liveMarkerRef.current;
      const { data } = await api.post('/sos', {
        trip_id: id,
        lat: pos.lat,
        lng: pos.lng,
        speed_kmh: speedRef.current,
        heading_deg: 0,
      });
      router.replace(`/sos/${data.id}`);
    } catch (e: any) {
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
      } catch {}
    })();
  }, [id]);

  // Elapsed-time tick. Speed + progress now sourced from GPS only.
  useEffect(() => {
    const t = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt.current) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, []);

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
    lastSampleRef.current = { ...next, ts: Date.now() };
  }, []);

  // Real GPS (native) or browser geolocation (web) — graceful fallback.
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
              () => {},
              { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
            );
            locSub.current = { remove: () => navigator.geolocation.clearWatch(watchId) };
          }
        } else {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === 'granted') {
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
        }
      } catch {}
    })();
    return () => { cancelled = true; try { locSub.current?.remove?.(); } catch {} };
  }, [ingestSample]);

  // Crash detection (accelerometer magnitude > 3.5g peak)
  useEffect(() => {
    if (!settings.crashDetect) return;
    try { Accelerometer.setUpdateInterval(200); } catch {}
    const sub = Accelerometer.addListener(({ x, y, z }) => {
      const prev = lastAccel.current;
      const delta = Math.sqrt((x - prev.x) ** 2 + (y - prev.y) ** 2 + (z - prev.z) ** 2);
      lastAccel.current = { x, y, z };
      if (delta > 3.5 && !crashHandled.current) {
        crashHandled.current = true;
        Alert.alert(
          'Possible crash detected',
          'Are you okay? SOS will auto-trigger in 10s.',
          [
            { text: "I'm fine", onPress: () => { setTimeout(() => { crashHandled.current = false; }, 5000); } },
            { text: 'Send SOS now', style: 'destructive', onPress: () => triggerSos() },
          ],
          { cancelable: false }
        );
        setTimeout(() => {
          if (crashHandled.current) triggerSos();
        }, 10000);
      }
    });
    accelSub.current = sub;
    return () => { try { sub.remove(); } catch {} };
  }, [settings.crashDetect]);

  // Convoy WebSocket — auto-reconnects on drops with exponential backoff.
  // `members` mirrors the latest server `state` payload; `sendPos` is a no-op
  // when the socket is closed, so the next reconnect picks up the fresh sample.
  const onTripEnded = useCallback(() => {
    router.replace(`/complete/${id}`);
  }, [id, router]);
  const { members: convoyMembers, state: convoyState, sendPos } = useConvoySocket(
    id,
    { onTripEnded },
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
      stale,
    });
  }

  // Liver marker for SOS/payload purposes — always our own position.
  const liveMarker = realPos || allPoints[0] || { lat: 0, lng: 0 };
  liveMarkerRef.current = liveMarker;

  const fmtTime = (s: number) => {
    const h = Math.floor(s / 3600).toString().padStart(2, '0');
    const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
    const ss = (s % 60).toString().padStart(2, '0');
    return `${h}:${m}:${ss}`;
  };

  const distanceCovered = (trip.distance_km * progress).toFixed(1);

  const endTrip = async () => {
    try {
      await api.patch(`/trips/${id}`, {
        status: 'completed',
        actual_distance_km: parseFloat(distanceCovered),
        top_speed_kmh: topSpeed,
        duration_min: Math.round(elapsed / 60),
      });
      router.replace(`/complete/${id}`);
    } catch {}
  };

  return (
    <View style={styles.container} testID="live-ride-screen">
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} testID="ride-close-btn"><Feather name="x" size={22} color={colors.dark.ink} /></TouchableOpacity>
            <Eyebrow color={colors.dark.amber}>
              ● LIVE — {trip.name.toUpperCase()} {gpsActive ? '· GPS' : '· WAITING FOR FIX'}
              {convoyState.kind === 'reconnecting' ? ` · RECONNECTING…` : ''}
              {convoyState.kind === 'failed' ? ` · OFFLINE` : ''}
            </Eyebrow>
            <TouchableOpacity onPress={endTrip} testID="ride-end-btn"><Meta style={{ color: colors.dark.amber }}>END</Meta></TouchableOpacity>
          </View>
          {/* M2 — Ride progress hairline */}
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
          </View>

        <ScrollView contentContainerStyle={{ paddingBottom: space.xl }}>
          {/* Map — self + crew live markers, diffed by id inside the WebView. */}
          <View style={{ alignItems: 'center', paddingTop: space.sm }}>
            <MapView points={allPoints} dark width={screenWidth} height={300} markers={markers} />
          </View>

          {/* Speedometer */}
          <View style={styles.speedoBlock}>
            <Meta style={{ color: colors.dark.inkMuted }}>SPEED — KM/H</Meta>
            <Text testID="ride-speed-text" style={[type.instrument, { color: colors.dark.ink, marginTop: 4 }]}>{displaySpeed}</Text>
            <View style={styles.subRow}>
              <View><Meta style={{ color: colors.dark.inkMuted }}>TOP</Meta><Text style={[type.h2, { color: colors.dark.ink, marginTop: 2 }]}>{Math.round(topSpeed)}</Text></View>
              <View><Meta style={{ color: colors.dark.inkMuted }}>ELAPSED</Meta><Text style={[type.h2, { color: colors.dark.ink, fontFamily: fonts.mono, marginTop: 2 }]}>{fmtTime(elapsed)}</Text></View>
              <View><Meta style={{ color: colors.dark.inkMuted }}>COVERED</Meta><Text style={[type.h2, { color: colors.dark.ink, marginTop: 2 }]}>{distanceCovered}<Text style={[type.meta, { color: colors.dark.inkMuted }]}> KM</Text></Text></View>
            </View>
          </View>

          {/* Convoy roster — live from WebSocket. Self is excluded since it's
              already represented by the speedometer above; this list is "the
              other riders". Stale = no fresh fix in 30s, marker greys out. */}
          <View style={styles.darkBlock}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Eyebrow color={colors.dark.inkMuted}>CONVOY — {convoyMembers.filter((m: any) => m.user_id !== myId).length}</Eyebrow>
            </View>
            {convoyMembers.filter((m: any) => m.user_id !== myId).map((m: any) => {
              const updatedTs = m.updated_at ? Date.parse(m.updated_at) : 0;
              const stale = updatedTs > 0 && now - updatedTs > STALE_AFTER_MS;
              const hasFix = m.lat != null && m.lng != null;
              const status = !hasFix ? 'NO FIX' : stale ? 'STALE' : 'LIVE';
              const dotColor = !hasFix || stale ? colors.dark.inkMuted : colors.dark.safe;
              return (
                <View key={m.user_id} style={styles.convoyRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={[styles.statusDot, { backgroundColor: dotColor }]} />
                    <Text style={[type.body, { color: colors.dark.ink }]}>{m.name}</Text>
                    <Meta style={{ color: colors.dark.inkMuted }}>· {status}</Meta>
                  </View>
                  <Meta style={{ color: colors.dark.ink }}>{Math.round(m.speed_kmh || 0)} KM/H</Meta>
                </View>
              );
            })}
            {convoyMembers.filter((m: any) => m.user_id !== myId).length === 0 && (
              <Text style={[type.meta, { color: colors.dark.inkMuted, paddingVertical: space.sm }]}>
                No other riders connected yet.
              </Text>
            )}
          </View>
        </ScrollView>

        {/* SOS button */}
        <View style={styles.sosWrap}>
          <SOSButton onTrigger={triggerSos} testID="live-sos-button" />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: colors.dark.rule },
  progressTrack: { height: 2, backgroundColor: 'rgba(217, 102, 6, 0.12)' },
  progressBar: { height: 2, backgroundColor: colors.dark.amber },
  speedoBlock: { padding: space.lg, alignItems: 'flex-start', borderBottomWidth: 1, borderBottomColor: colors.dark.rule },
  subRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginTop: space.lg, gap: space.lg },
  darkBlock: { padding: space.lg },
  convoyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: colors.dark.rule },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  sosWrap: { padding: space.lg, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: colors.dark.rule },
});
