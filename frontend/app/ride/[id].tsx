import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { api } from '../../src/lib/api';
import { colors, type, space, fonts } from '../../src/theme/tokens';
import { Eyebrow, Meta } from '../../src/components/ui';
import { TopoMap } from '../../src/components/TopoMap';
import { SOSButton } from '../../src/components/SOSButton';

// Live Ride — DARK MODE instrument panel.
// Mocks GPS movement along the route and ticks a speedometer.
export default function LiveRide() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [trip, setTrip] = useState<any>(null);
  const [convoy, setConvoy] = useState<any>({ members: [], spread_km: 0 });
  const [progress, setProgress] = useState(0); // 0..1 along route
  const [speed, setSpeed] = useState(62);
  const [topSpeed, setTopSpeed] = useState(0);
  const [elapsed, setElapsed] = useState(0); // seconds
  const startedAt = useRef(Date.now());

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/trips/${id}`);
        setTrip(data);
        const c = await api.get(`/trips/${id}/convoy`);
        setConvoy(c.data);
      } catch {}
    })();
  }, [id]);

  // Mock telemetry tick
  useEffect(() => {
    const t = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt.current) / 1000));
      setProgress(p => Math.min(1, p + 0.0015));
      setSpeed(s => {
        const ns = Math.max(0, Math.min(120, s + (Math.random() - 0.5) * 18));
        setTopSpeed(ts => Math.max(ts, ns));
        return Math.round(ns);
      });
    }, 1500);
    return () => clearInterval(t);
  }, []);

  if (!trip) {
    return <View style={[styles.container, styles.center]}><ActivityIndicator color={colors.dark.amber} /></View>;
  }

  const allPoints = [trip.start, ...(trip.waypoints || []), trip.end];
  // interpolate position
  const segs = allPoints.length - 1;
  const segLen = 1 / segs;
  const segIdx = Math.min(segs - 1, Math.floor(progress / segLen));
  const segT = (progress - segIdx * segLen) / segLen;
  const a = allPoints[segIdx], b = allPoints[segIdx + 1];
  const liveMarker = { lat: a.lat + (b.lat - a.lat) * segT, lng: a.lng + (b.lng - a.lng) * segT };

  const fmtTime = (s: number) => {
    const h = Math.floor(s / 3600).toString().padStart(2, '0');
    const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
    const ss = (s % 60).toString().padStart(2, '0');
    return `${h}:${m}:${ss}`;
  };

  const distanceCovered = (trip.distance_km * progress).toFixed(1);

  const triggerSos = async () => {
    try {
      const { data } = await api.post('/sos', {
        trip_id: id, lat: liveMarker.lat, lng: liveMarker.lng, speed_kmh: speed, heading_deg: 0,
      });
      router.replace(`/sos/${data.id}`);
    } catch (e: any) {
      Alert.alert('SOS failed to send', e?.message || 'Network error');
    }
  };

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
          <Eyebrow color={colors.dark.amber}>● LIVE — {trip.name.toUpperCase()}</Eyebrow>
          <TouchableOpacity onPress={endTrip} testID="ride-end-btn"><Meta style={{ color: colors.dark.amber }}>END</Meta></TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: space.xl }}>
          {/* Map */}
          <View style={{ alignItems: 'center', paddingTop: space.sm }}>
            <TopoMap points={allPoints} dark width={360} height={200} liveMarker={liveMarker} />
          </View>

          {/* Speedometer */}
          <View style={styles.speedoBlock}>
            <Meta style={{ color: colors.dark.inkMuted }}>SPEED — KM/H</Meta>
            <Text testID="ride-speed-text" style={[type.instrument, { color: colors.dark.ink, marginTop: 4 }]}>{speed}</Text>
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
  speedoBlock: { padding: space.lg, alignItems: 'flex-start', borderBottomWidth: 1, borderBottomColor: colors.dark.rule },
  subRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginTop: space.lg, gap: space.lg },
  darkBlock: { padding: space.lg },
  convoyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: colors.dark.rule },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  sosWrap: { padding: space.lg, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: colors.dark.rule },
});
