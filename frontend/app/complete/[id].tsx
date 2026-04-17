import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api } from '../../src/lib/api';
import { colors, type, space } from '../../src/theme/tokens';
import { Eyebrow, Rule, SpecRow, Button, Card } from '../../src/components/ui';
import { MapView } from '../../src/components/MapView';
import { COMPLETE_NOTES, pickFromSeed } from '../../src/lib/content';

export default function Complete() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [trip, setTrip] = useState<any>(null);

  useEffect(() => {
    (async () => {
      try { const { data } = await api.get(`/trips/${id}`); setTrip(data); } catch {}
    })();
  }, [id]);

  if (!trip) return <View style={[styles.container, styles.center]}><ActivityIndicator color={colors.light.ink} /></View>;
  const allPoints = [trip.start, ...(trip.waypoints || []), trip.end];

  return (
    <SafeAreaView style={styles.container} testID="trip-complete-screen">
      <ScrollView contentContainerStyle={{ paddingBottom: space.xxl }}>
        <View style={styles.titleBlock}>
          <Eyebrow>SAFELY HOME — {new Date(trip.ended_at || Date.now()).toDateString().toUpperCase()}</Eyebrow>
          <Text style={[type.display, { color: colors.light.ink, marginTop: space.xs }]}>Ride complete.</Text>
          <Text style={[type.h3, { color: colors.light.inkMuted, marginTop: space.xs }]}>{trip.name}</Text>
        </View>
        <Rule />

        <View style={{ alignItems: 'center', backgroundColor: colors.light.surface, paddingVertical: space.md }}>
          <MapView points={allPoints} width={360} height={200} />
        </View>

        <View style={styles.section}>
          <Eyebrow>SUMMARY</Eyebrow>
          <Card style={{ marginTop: space.sm }}>
            <SpecRow label="DISTANCE COVERED" value={`${trip.actual_distance_km || trip.distance_km} KM`} />
            <SpecRow label="TOP SPEED" value={`${trip.top_speed_kmh || 0} KM/H`} />
            <SpecRow label="DURATION" value={`${Math.floor((trip.duration_min || 0) / 60)}H ${(trip.duration_min || 0) % 60}M`} />
            <SpecRow label="ELEVATION" value={`${trip.elevation_m} M`} />
            <SpecRow label="STOPS" value={`${(trip.waypoints?.length || 0) + 2}`} last />
          </Card>
        </View>

        <View style={styles.section}>
          <Eyebrow>FIELD NOTE</Eyebrow>
          <Card style={{ marginTop: space.sm }}>
            {(() => {
              const note = pickFromSeed(COMPLETE_NOTES, trip.id);
              return <>
                <Text style={[type.bodyLg, { color: colors.light.ink, fontFamily: 'Fraunces_500Medium' }]}>
                  {note.text}
                </Text>
                <Text style={[type.meta, { color: colors.light.inkMuted, marginTop: space.sm }]}>
                  {trip.actual_distance_km || trip.distance_km} KM · {Math.floor((trip.duration_min || 0) / 60)}H {(trip.duration_min || 0) % 60}M · TOP {trip.top_speed_kmh || 0} KM/H
                </Text>
              </>;
            })()}
          </Card>
        </View>

        <View style={[styles.section, { marginTop: space.xl }]}>
          <Button label="BACK TO TRIPS" onPress={() => router.replace('/(tabs)/trips')} testID="complete-done-btn" />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.light.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  titleBlock: { padding: space.lg },
  section: { paddingHorizontal: space.lg, paddingTop: space.xl },
});
