import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { api } from '../../src/lib/api';
import { colors, type, space } from '../../src/theme/tokens';
import { Eyebrow, Rule, Meta } from '../../src/components/ui';

const TABS: { key: string; label: string }[] = [
  { key: 'active', label: 'ACTIVE' },
  { key: 'planned', label: 'UPCOMING' },
  { key: 'completed', label: 'PAST' },
];

export default function Trips() {
  const router = useRouter();
  const [trips, setTrips] = useState<any[]>([]);
  const [tab, setTab] = useState<'active' | 'planned' | 'completed'>('planned');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/trips');
      setTrips(data);
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };
  const filtered = trips.filter(t => t.status === tab);

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="trips-screen">
      <View style={styles.header}>
        <Eyebrow>EVERY ROAD</Eyebrow>
        <View style={styles.headRow}>
          <Text style={[type.h1, { color: colors.light.ink }]}>Trips</Text>
          <TouchableOpacity testID="trips-new-button" onPress={() => router.push('/plan')} style={styles.newBtn}>
            <Feather name="plus" size={16} color={colors.light.ink} />
            <Meta style={{ marginLeft: 6, color: colors.light.ink }}>NEW</Meta>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.tabs}>
        {TABS.map(t => (
          <TouchableOpacity key={t.key} testID={`trips-tab-${t.key}`} onPress={() => setTab(t.key as any)} style={styles.tabBtn}>
            <Text style={[type.eyebrow, { color: tab === t.key ? colors.light.ink : colors.light.inkMuted }]}>{t.label}</Text>
            <View style={[styles.tabUnderline, { backgroundColor: tab === t.key ? colors.light.ink : 'transparent' }]} />
          </TouchableOpacity>
        ))}
      </View>
      <Rule />

      <ScrollView contentContainerStyle={{ paddingBottom: space.xxl }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {filtered.length === 0 ? (
          <View style={styles.empty}>
            <Text style={[type.body, { color: colors.light.inkMuted, textAlign: 'center' }]}>
              {tab === 'active' && 'No trip in progress.'}
              {tab === 'planned' && 'No upcoming trips. Tap NEW to plot one.'}
              {tab === 'completed' && 'No completed trips yet. The road is patient.'}
            </Text>
          </View>
        ) : filtered.map((t) => (
          <TouchableOpacity key={t.id} testID={`trip-row-${t.id}`} activeOpacity={0.7} onPress={() => router.push(t.status === 'active' ? `/ride/${t.id}` : `/trip/${t.id}`)} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Eyebrow>{(t.planned_date || '').toUpperCase()}</Eyebrow>
              <Text style={[type.h2, { color: colors.light.ink, marginTop: 4 }]}>{t.name}</Text>
              <Meta style={{ marginTop: space.sm }}>
                {(t.start?.name || '').toUpperCase()} → {(t.end?.name || '').toUpperCase()}
              </Meta>
              <Meta style={{ marginTop: 4, color: colors.light.amber }}>
                {t.status === 'completed' ? `${t.actual_distance_km || t.distance_km} KM · ${t.top_speed_kmh || 0} KM/H TOP` : `${t.distance_km} KM · ${t.elevation_m} M`}
              </Meta>
            </View>
            <Feather name="chevron-right" size={20} color={colors.light.inkMuted} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.light.bg },
  header: { paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.md },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.xs },
  newBtn: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.light.rule, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 2 },
  tabs: { flexDirection: 'row', paddingHorizontal: space.lg, gap: 24, paddingBottom: space.sm },
  tabBtn: { paddingVertical: space.sm },
  tabUnderline: { height: 2, marginTop: 6 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: space.lg, paddingVertical: space.lg,
    borderBottomWidth: 1, borderBottomColor: colors.light.rule,
  },
  empty: { padding: space.xxl, alignItems: 'center' },
});
