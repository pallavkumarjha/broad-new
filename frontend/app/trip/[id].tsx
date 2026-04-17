import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { api } from '../../src/lib/api';
import { colors, type, space } from '../../src/theme/tokens';
import { Eyebrow, Rule, SpecRow, Button, Meta, Card } from '../../src/components/ui';
import { MapView } from '../../src/components/MapView';

export default function TripDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [trip, setTrip] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try { const { data } = await api.get(`/trips/${id}`); setTrip(data); } catch {}
    })();
  }, [id]);

  if (!trip) {
    return <SafeAreaView style={styles.container}><View style={styles.loading}><ActivityIndicator color={colors.light.ink} /></View></SafeAreaView>;
  }

  const allPoints = [trip.start, ...(trip.waypoints || []), trip.end];

  const startTrip = async () => {
    setBusy(true);
    try {
      await api.patch(`/trips/${id}`, { status: 'active' });
      router.replace(`/ride/${id}`);
    } catch (e: any) { Alert.alert('Could not start', e?.message || ''); }
    finally { setBusy(false); }
  };

  const deleteTrip = async () => {
    Alert.alert('Delete trip?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await api.delete(`/trips/${id}`); router.back(); } catch {}
      }},
    ]);
  };

  return (
    <SafeAreaView style={styles.container} testID="trip-detail-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="trip-back-btn"><Feather name="arrow-left" size={22} color={colors.light.ink} /></TouchableOpacity>
        <Eyebrow>PRE-RIDE BRIEFING</Eyebrow>
        <TouchableOpacity onPress={deleteTrip} testID="trip-delete-btn"><Feather name="trash-2" size={20} color={colors.light.inkMuted} /></TouchableOpacity>
      </View>
      <Rule />
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
        <View style={styles.titleBlock}>
          <Eyebrow>{(trip.planned_date || '').toUpperCase()}</Eyebrow>
          <Text style={[type.display, { color: colors.light.ink, marginTop: space.xs }]}>{trip.name}</Text>
          <Meta style={{ marginTop: space.sm }}>
            {(trip.start?.name || '').toUpperCase()} → {(trip.end?.name || '').toUpperCase()}
          </Meta>
        </View>
        <View style={{ alignItems: 'center', backgroundColor: colors.light.surface, paddingVertical: space.md }}>
          <MapView points={allPoints} width={360} height={200} />
        </View>

        <View style={styles.section}>
          <Eyebrow>ROUTE STATS</Eyebrow>
          <Card style={{ marginTop: space.sm }}>
            <SpecRow label="DISTANCE" value={`${trip.distance_km} KM`} />
            <SpecRow label="ELEVATION" value={`${trip.elevation_m} M`} />
            <SpecRow label="STOPS" value={`${(trip.waypoints?.length || 0) + 2}`} />
            <SpecRow label="STATUS" value={(trip.status || '').toUpperCase()} last />
          </Card>
        </View>

        <View style={styles.section}>
          <Eyebrow>WAYPOINTS — {(trip.waypoints?.length || 0) + 2}</Eyebrow>
          <View style={{ marginTop: space.sm }}>
            {allPoints.map((p: any, i: number) => (
              <View key={i} style={styles.wpRow}>
                <View style={[styles.dot, i === 0 || i === allPoints.length - 1 ? { backgroundColor: colors.light.ink } : null]} />
                <View style={{ flex: 1 }}>
                  <Text style={[type.body, { color: colors.light.ink, fontFamily: 'Fraunces_500Medium' }]}>{p.name}</Text>
                  <Meta style={{ marginTop: 2 }}>{p.lat.toFixed(3)}°N {p.lng.toFixed(3)}°E</Meta>
                </View>
              </View>
            ))}
          </View>
        </View>

        {trip.crew?.length > 0 && (
          <View style={styles.section}>
            <Eyebrow>CREW — {trip.crew.length}</Eyebrow>
            <View style={{ marginTop: space.sm }}>
              {trip.crew.map((c: string, i: number) => (
                <View key={i} style={styles.crewRow}>
                  <View style={styles.avatar}><Text style={[type.meta, { color: colors.light.ink }]}>{c.charAt(0).toUpperCase()}</Text></View>
                  <Text style={[type.body, { color: colors.light.ink }]}>{c}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {trip.notes ? (
          <View style={styles.section}>
            <Eyebrow>NOTES</Eyebrow>
            <Text style={[type.body, { color: colors.light.ink, marginTop: space.sm }]}>{trip.notes}</Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.cta}>
        {trip.status === 'planned' && <Button label="START TRIP" onPress={startTrip} loading={busy} testID="trip-start-btn" />}
        {trip.status === 'active' && <Button label="OPEN INSTRUMENT PANEL" onPress={() => router.push(`/ride/${id}`)} testID="trip-open-ride-btn" />}
        {trip.status === 'completed' && <Button label="VIEW SUMMARY" variant="ghost" onPress={() => router.push(`/complete/${id}`)} testID="trip-view-summary-btn" />}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.light.bg },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: space.lg, paddingVertical: space.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleBlock: { paddingHorizontal: space.lg, paddingVertical: space.lg },
  section: { paddingHorizontal: space.lg, paddingTop: space.xl },
  wpRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: colors.light.rule },
  dot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1, borderColor: colors.light.ink, backgroundColor: colors.light.bg },
  crewRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: colors.light.rule },
  avatar: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: colors.light.ink, alignItems: 'center', justifyContent: 'center' },
  cta: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: space.lg, backgroundColor: colors.light.bg, borderTopWidth: 1, borderTopColor: colors.light.rule },
});
