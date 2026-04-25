import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, StatusBar, Platform, Animated, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { Accelerometer } from 'expo-sensors';
import { api, storage, TOKEN_KEY } from '../../src/lib/api';
import { useSettings } from '../../src/contexts/SettingsContext';
import { colors, type, space, fonts } from '../../src/theme/tokens';
import { Eyebrow, Meta } from '../../src/components/ui';
import { MapView } from '../../src/components/MapView';
import { SOSButton } from '../../src/components/SOSButton';

// Live Ride — DARK MODE instrument panel.
// Mocks GPS movement along the route and ticks a speedometer.
export default function LiveRide() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { settings } = useSettings();
  const [trip, setTrip] = useState<any>(null);
  const [convoy, setConvoy] = useState<any>({ members: [], spread_km: 0 });
  const [progress, setProgress] = useState(0); // 0..1 along route
  const [speed, setSpeed] = useState(62);
  const [displaySpeed, setDisplaySpeed] = useState(62);
  const [topSpeed, setTopSpeed] = useState(0);
  const [elapsed, setElapsed] = useState(0); // seconds
  const [gpsActive, setGpsActive] = useState(false);
  const [realPos, setRealPos] = useState<{ lat: number; lng: number } | null>(null);
  const startedAt = useRef(Date.now());
  const wsRef = useRef<WebSocket | null>(null);
  const locSub = useRef<any>(null);
  const accelSub = useRef<any>(null);
  const lastAccel = useRef({ x: 0, y: 0, z: 0 });
  const crashHandled = useRef(false);
  const speedAnim = useRef(new Animated.Value(62)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  // Refs so triggerSos (defined via useCallback below) always has fresh values
  // even when called from long-lived effects (crash detection, auto-SOS timer).
  const liveMarkerRef = useRef<{ lat: number; lng: number }>({ lat: 0, lng: 0 });
  const speedRef = useRef(62);
  // Tracks whether GPS is actually delivering valid speed values. When false the
  // mock tick keeps running so the instrument panel stays alive.
  const gpsSpeedActiveRef = useRef(false);

  // Keep speedRef in sync so triggerSos always has the latest reading.
  useEffect(() => { speedRef.current = speed; }, [speed]);

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

  // Mock telemetry tick. Progress simulation stops once real GPS kicks in.
  // Speed simulation keeps running until the device actually reports a valid
  // speed value — many phones return -1 / null for coords.speed even when
  // location is active (especially at low speeds or indoors).
  useEffect(() => {
    const t = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt.current) / 1000));
      if (!gpsActive) {
        setProgress(p => Math.min(1, p + 0.0015));
      }
      if (!gpsSpeedActiveRef.current) {
        setSpeed(s => {
          const ns = Math.max(0, Math.min(120, s + (Math.random() - 0.5) * 18));
          setTopSpeed(ts => Math.max(ts, ns));
          return Math.round(ns);
        });
      }
    }, 1500);
    return () => clearInterval(t);
  }, [gpsActive]);

  // Real GPS (native) or browser geolocation (web) — graceful fallback
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (Platform.OS === 'web') {
          if ('geolocation' in navigator) {
            const watchId = navigator.geolocation.watchPosition(
              (pos) => {
                if (cancelled) return;
                setGpsActive(true);
                setRealPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                // coords.speed is null on many browsers — only use it when valid.
                const raw = pos.coords.speed ?? -1;
                if (raw >= 0) {
                  const sp = Math.round(raw * 3.6);
                  gpsSpeedActiveRef.current = true;
                  setSpeed(sp);
                  setTopSpeed(ts => Math.max(ts, sp));
                }
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
                setGpsActive(true);
                setRealPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                // On iOS coords.speed is -1 when unknown; on Android it can be
                // null. Only switch off the mock once we get a valid reading.
                const raw = pos.coords.speed ?? -1;
                if (raw >= 0) {
                  const sp = Math.round(raw * 3.6);
                  gpsSpeedActiveRef.current = true;
                  setSpeed(Math.max(0, sp));
                  setTopSpeed(ts => Math.max(ts, sp));
                }
              }
            );
          }
        }
      } catch {}
    })();
    return () => { cancelled = true; try { locSub.current?.remove?.(); } catch {} };
  }, []);

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

  // WebSocket — real-time convoy position broadcast.
  // Gated on EXPO_PUBLIC_WS_URL because the prod REST proxy (Vercel) cannot
  // tunnel WS upgrades. When unset, ride screen falls back to /trips/{id}/convoy
  // (the GET below) for periodic convoy state.
  useEffect(() => {
    let alive = true;
    (async () => {
      const token = await storage.getItem(TOKEN_KEY);
      if (!token || !id) return;
      const wsBase = process.env.EXPO_PUBLIC_WS_URL?.replace(/^http/, 'ws');
      if (!wsBase) return; // push-only / REST-only mode
      const url = `${wsBase}/api/ws/convoy/${id}?token=${encodeURIComponent(token)}`;
      try {
        const ws = new WebSocket(url);
        wsRef.current = ws;
        ws.onmessage = (e) => {
          try {
            const d = JSON.parse(e.data);
            if (d.type === 'state' && alive) {
              setConvoy((c: any) => ({ ...c, members: d.members.map((m: any) => ({
                name: m.name, lat: m.lat, lng: m.lng, speed_kmh: m.speed_kmh, position: 'live', online: m.online,
                fuel_pct: Math.round(40 + (m.name.charCodeAt(0) * 13) % 60), battery_pct: 80,
              })) }));
            }
          } catch {}
        };
      } catch {}
    })();
    return () => { alive = false; try { wsRef.current?.close(); } catch {} };
  }, [id]);

  // Broadcast own position periodically
  useEffect(() => {
    const t = setInterval(() => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== 1) return;
      const pos = realPos || (() => {
        if (!trip) return null;
        const all = [trip.start, ...(trip.waypoints || []), trip.end];
        const segs = all.length - 1;
        const segLen = 1 / segs;
        const i = Math.min(segs - 1, Math.floor(progress / segLen));
        const t2 = (progress - i * segLen) / segLen;
        return { lat: all[i].lat + (all[i + 1].lat - all[i].lat) * t2, lng: all[i].lng + (all[i + 1].lng - all[i].lng) * t2 };
      })();
      if (!pos) return;
      try { ws.send(JSON.stringify({ type: 'pos', lat: pos.lat, lng: pos.lng, speed_kmh: speed })); } catch {}
    }, 3000);
    return () => clearInterval(t);
  }, [trip, progress, speed, realPos]);

  // Fallback convoy fetch once (so we still see something if nobody else is online)
  useEffect(() => {
    (async () => {
      if (!id) return;
      try { const c = await api.get(`/trips/${id}/convoy`); setConvoy(c.data); } catch {}
    })();
  }, [id]);

  const { width: screenWidth } = useWindowDimensions();

  if (!trip) {
    return <View style={[styles.container, styles.center]}><ActivityIndicator color={colors.dark.amber} /></View>;
  }

  const allPoints = [trip.start, ...(trip.waypoints || []), trip.end].filter(Boolean);
  // interpolate position (fallback) or use real GPS
  const segs = Math.max(1, allPoints.length - 1);
  const segLen = 1 / segs;
  const segIdx = Math.min(segs - 1, Math.floor(progress / segLen));
  const segT = (progress - segIdx * segLen) / segLen;
  const a = allPoints[segIdx] ?? { lat: 0, lng: 0 };
  const b = allPoints[segIdx + 1] ?? a;
  const liveMarker = realPos || { lat: a.lat + (b.lat - a.lat) * segT, lng: a.lng + (b.lng - a.lng) * segT };
  // Keep ref in sync so triggerSos always has the latest position without
  // needing to be in the effect deps array.
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
            <Eyebrow color={colors.dark.amber}>● LIVE — {trip.name.toUpperCase()} {gpsActive ? '· GPS' : '· SIM'}</Eyebrow>
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
          {/* Map */}
          <View style={{ alignItems: 'center', paddingTop: space.sm }}>
            <MapView points={allPoints} dark width={screenWidth} height={300} liveMarker={liveMarker} />
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

          {/* Convoy spread */}
          <View style={styles.darkBlock}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Eyebrow color={colors.dark.inkMuted}>CONVOY — {convoy.members.length}</Eyebrow>
              <Meta style={{ color: colors.dark.amber }}>SPREAD {convoy.spread_km} KM</Meta>
            </View>
            {convoy.members.map((m: any, i: number) => (
              <View key={i} style={styles.convoyRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={[styles.statusDot, { backgroundColor: m.online ? colors.dark.safe : colors.dark.inkMuted }]} />
                  <Text style={[type.body, { color: colors.dark.ink }]}>{m.name}</Text>
                  <Meta style={{ color: colors.dark.inkMuted }}>· {m.position.toUpperCase()}</Meta>
                </View>
                <Meta style={{ color: colors.dark.ink }}>{m.speed_kmh} KM/H · ⛽ {m.fuel_pct}%</Meta>
              </View>
            ))}
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
