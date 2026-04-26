import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../src/lib/api';
import { colors, type, space } from '../../src/theme/tokens';
import { Eyebrow, Rule, Meta } from '../../src/components/ui';
import { EmptyRoadIllus } from '../../src/components/illustrations';
import { SkeletonTripRow } from '../../src/components/Skeleton';

/** "2025-05-01" → "Thu, 1 May 2025" */
function formatTripDate(raw: string | undefined | null): string {
  if (!raw) return '';
  const d = new Date(raw + 'T00:00:00');
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

const TABS: { key: string; label: string }[] = [
  { key: 'active', label: 'ACTIVE' },
  { key: 'planned', label: 'UPCOMING' },
  { key: 'completed', label: 'LOGGED' },
];

export default function Trips() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState<'active' | 'planned' | 'completed'>('planned');

  // Shared cache key with Home — one fetch powers both screens.
  const tripsQuery = useQuery<any[]>({
    queryKey: ['trips', 'mine'],
    queryFn: async () => (await api.get('/trips')).data,
    placeholderData: (prev) => prev,
  });
  const myReqsQuery = useQuery<any[]>({
    queryKey: ['users', 'me', 'trip-requests'],
    queryFn: async () => (await api.get('/users/me/trip-requests')).data,
  });

  const trips = tripsQuery.data ?? [];
  const pendingRequests = (myReqsQuery.data || []).filter((r: any) => r.status === 'pending');
  const isInitialLoading = tripsQuery.isLoading && !tripsQuery.data;

  const onRefresh = async () => {
    await Promise.all([tripsQuery.refetch(), myReqsQuery.refetch()]);
  };
  const filtered = trips.filter(t => t.status === tab);
  // Map trip_id -> bool for quick lookup in the row
  const pendingByTrip = React.useMemo(() => {
    const m: Record<string, boolean> = {};
    pendingRequests.forEach(r => { m[r.trip_id] = true; });
    return m;
  }, [pendingRequests]);

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

      {pendingRequests.length > 0 && (
        <TouchableOpacity
          testID="trips-pending-strip"
          activeOpacity={0.85}
          onPress={() => router.push(`/trip/${pendingRequests[0].trip_id}`)}
          style={styles.pendingStrip}
        >
          <Feather name="clock" size={14} color={colors.light.amber} />
          <Meta style={{ marginLeft: 8, color: colors.light.ink, flex: 1 }}>
            {pendingRequests.length} JOIN REQUEST{pendingRequests.length === 1 ? '' : 'S'} PENDING — TAP TO REVIEW
          </Meta>
          <Feather name="chevron-right" size={16} color={colors.light.inkMuted} />
        </TouchableOpacity>
      )}

      <View style={styles.tabs}>
        {TABS.map(t => (
          <TouchableOpacity key={t.key} testID={`trips-tab-${t.key}`} onPress={() => setTab(t.key as any)} style={styles.tabBtn}>
            <Text style={[type.eyebrow, { color: tab === t.key ? colors.light.ink : colors.light.inkMuted }]}>{t.label}</Text>
            <View style={[styles.tabUnderline, { backgroundColor: tab === t.key ? colors.light.ink : 'transparent' }]} />
          </TouchableOpacity>
        ))}
      </View>
      <Rule />

      <ScrollView contentContainerStyle={{ paddingBottom: space.xxl }} refreshControl={<RefreshControl refreshing={tripsQuery.isRefetching && !isInitialLoading} onRefresh={onRefresh} />}>
        {isInitialLoading ? (
          <View>
            <SkeletonTripRow testID="trips-skel-1" />
            <SkeletonTripRow testID="trips-skel-2" />
            <SkeletonTripRow testID="trips-skel-3" />
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.empty}>
            <EmptyRoadIllus width={width - space.lg * 2} height={150} />
            <Text style={[type.body, { color: colors.light.inkMuted, textAlign: 'center', marginTop: space.lg }]}>
              {tab === 'active' && 'No trip in progress.'}
              {tab === 'planned' && 'No upcoming trips.\nThe road is waiting.'}
              {tab === 'completed' && 'No trips logged yet.\nThe road is patient.'}
            </Text>
            {tab !== 'active' && (
              <TouchableOpacity
                testID={`trips-empty-cta-${tab}`}
                onPress={() => router.push('/plan')}
                style={styles.emptyCta}
                activeOpacity={0.85}
              >
                <Feather name="plus" size={14} color={colors.light.ink} />
                <Meta style={{ marginLeft: 8, color: colors.light.ink }}>PLOT A NEW ROUTE</Meta>
              </TouchableOpacity>
            )}
            {tab === 'active' && (
              <TouchableOpacity
                testID="trips-empty-cta-active"
                onPress={() => setTab('planned')}
                style={styles.emptyCta}
                activeOpacity={0.85}
              >
                <Feather name="arrow-right" size={14} color={colors.light.ink} />
                <Meta style={{ marginLeft: 8, color: colors.light.ink }}>SEE UPCOMING</Meta>
              </TouchableOpacity>
            )}
          </View>
        ) : filtered.map((t) => {
          const hasPending = pendingByTrip[t.id];
          return (
            <TouchableOpacity key={t.id} testID={`trip-row-${t.id}`} activeOpacity={0.7} onPress={() => router.push(t.status === 'active' ? `/ride/${t.id}` : `/trip/${t.id}`)} style={styles.row}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Eyebrow>{formatTripDate(t.planned_date).toUpperCase() || ''}</Eyebrow>
                  {hasPending && (
                    <View style={styles.rowBadge} testID={`trip-row-pending-${t.id}`}>
                      <Meta style={{ color: colors.light.bg }}>PENDING</Meta>
                    </View>
                  )}
                  {t.is_public && (
                    <View style={styles.rowPublicBadge}>
                      <Meta style={{ color: colors.light.amber }}>PUBLIC</Meta>
                    </View>
                  )}
                </View>
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
          );
        })}
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
  empty: { paddingHorizontal: space.lg, paddingVertical: space.xl, alignItems: 'center' },
  emptyCta: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: colors.light.ink,
    paddingVertical: 10, paddingHorizontal: 16,
    borderRadius: 2, marginTop: space.lg,
  },
  pendingStrip: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: space.lg, marginBottom: space.sm,
    paddingHorizontal: space.md, paddingVertical: space.sm,
    borderWidth: 1, borderColor: colors.light.amber,
    backgroundColor: colors.light.surface, borderRadius: 2,
  },
  rowBadge: {
    paddingHorizontal: 6, paddingVertical: 2,
    backgroundColor: colors.light.amber, borderRadius: 2,
  },
  rowPublicBadge: {
    paddingHorizontal: 6, paddingVertical: 2,
    borderWidth: 1, borderColor: colors.light.amber, borderRadius: 2,
  },
});
