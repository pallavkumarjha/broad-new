import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, useWindowDimensions, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../src/lib/api';
import { colors, type, space, radius } from '../../src/theme/tokens';
import { Eyebrow, Rule, Meta } from '../../src/components/ui';
import { TripIllus, EmptyRoadIllus } from '../../src/components/illustrations';
import { SkeletonTripCard } from '../../src/components/Skeleton';

/** "2025-05-01" → "Thu, 1 May 2025" */
function formatTripDate(raw: string | undefined | null): string {
  if (!raw) return 'TBD';
  const d = new Date(raw + 'T00:00:00');
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export default function Discover() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const qc = useQueryClient();
  const [showAll, setShowAll] = useState(false);

  // Three queries, all cached independently. showAll is part of the queryKey
  // so toggling it shows cached results if we've already seen that variant.
  const ridesQuery = useQuery<any[]>({
    queryKey: ['trips', 'discover', { showAll }],
    queryFn: async () => (await api.get('/trips/discover', { params: { show_all: showAll } })).data,
    placeholderData: (prev) => prev,
  });
  const myReqsQuery = useQuery<any[]>({
    queryKey: ['users', 'me', 'trip-requests'],
    queryFn: async () => (await api.get('/users/me/trip-requests')).data,
    // Soft-fail: on error we treat it as empty rather than block the screen
  });
  const meQuery = useQuery<any>({
    queryKey: ['auth', 'me'],
    queryFn: async () => (await api.get('/auth/me')).data,
    staleTime: 5 * 60_000, // /auth/me barely changes; 5min is plenty
  });

  const rides = ridesQuery.data ?? [];
  const userHomeCity: string | null = meQuery.data?.home_city || null;
  const isInitialLoading = ridesQuery.isLoading && !ridesQuery.data;

  // Latest request per trip wins (list comes back newest-first)
  const requestState = useMemo<Record<string, 'pending' | 'approved' | 'declined' | 'cancelled'>>(() => {
    const map: Record<string, any> = {};
    for (const r of myReqsQuery.data || []) {
      if (!map[r.trip_id]) map[r.trip_id] = r.status;
    }
    return map;
  }, [myReqsQuery.data]);

  const onRefresh = async () => {
    // Refetch all three in parallel so pull-to-refresh feels snappy.
    await Promise.all([ridesQuery.refetch(), myReqsQuery.refetch(), meQuery.refetch()]);
  };

  const onToggleShowAll = (toggle: boolean) => setShowAll(toggle);

  // Optimistic "request to join": flip the CTA to PENDING the instant the
  // user taps, then rollback if the server rejects. This is the single biggest
  // perceived-latency improvement — the previous flow had the user staring at
  // a spinning "SENDING…" button for 800ms+ each tap.
  const joinMutation = useMutation<any, any, { tripId: string }, { prev: any[] | undefined }>({
    mutationFn: async ({ tripId }) => (await api.post(`/trips/${tripId}/request-join`, { note: '' })).data,
    onMutate: async ({ tripId }) => {
      await qc.cancelQueries({ queryKey: ['users', 'me', 'trip-requests'] });
      const prev = qc.getQueryData<any[]>(['users', 'me', 'trip-requests']);
      // Prepend an in-flight request record so the requestState memo picks it
      // up as "pending" without waiting for the network.
      qc.setQueryData<any[]>(['users', 'me', 'trip-requests'], (old) => [
        { trip_id: tripId, status: 'pending', _optimistic: true },
        ...(old || []),
      ]);
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      if (ctx) qc.setQueryData(['users', 'me', 'trip-requests'], ctx.prev);
      Alert.alert('Could not send request', err?.response?.data?.detail || err?.message || 'Please try again.');
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['users', 'me', 'trip-requests'] });
    },
  });
  const joining = joinMutation.isPending ? joinMutation.variables?.tripId : null;
  const requestJoin = (trip: any) => joinMutation.mutate({ tripId: trip.id });

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="discover-screen">
      <View style={styles.header}>
        <Eyebrow>OPEN INVITES — INDIA</Eyebrow>
        <Text style={[type.h1, { color: colors.light.ink, marginTop: space.xs }]}>Rides near you.</Text>
        <Text style={[type.body, { color: colors.light.inkMuted, marginTop: space.xs }]}>
          Public convoys looking for company. Quiet ones, mostly.
        </Text>
      </View>
      <Rule />
      {userHomeCity && (
        <View style={styles.filterStrip} testID="discover-filter-banner">
          <View style={{ flex: 1 }}>
            <Meta style={{ color: colors.light.inkMuted }}>SHOWING TRIPS FROM</Meta>
            <Text style={[type.h3, { color: colors.light.ink, marginTop: 2 }]}>{userHomeCity.toUpperCase()}</Text>
          </View>
          <TouchableOpacity
            testID="discover-show-all-toggle"
            onPress={() => onToggleShowAll(!showAll)}
            style={[styles.toggle, showAll && styles.toggleOn]}
            activeOpacity={0.85}
          >
            <View style={[styles.toggleKnob, showAll && styles.toggleKnobOn]} />
          </TouchableOpacity>
          <Meta style={{ marginLeft: space.sm, color: colors.light.inkMuted, fontSize: 10 }}>ALL</Meta>
        </View>
      )}
      <ScrollView contentContainerStyle={{ paddingBottom: space.xxl }} refreshControl={<RefreshControl refreshing={ridesQuery.isRefetching && !isInitialLoading} onRefresh={onRefresh} />}>
        {isInitialLoading ? (
          <View>
            <SkeletonTripCard testID="discover-skel-1" />
            <SkeletonTripCard testID="discover-skel-2" />
          </View>
        ) : rides.length === 0 ? (
          <View style={styles.empty}>
            <EmptyRoadIllus width={width - space.lg * 2} height={150} />
            <Text style={[type.body, { color: colors.light.inkMuted, textAlign: 'center', marginTop: space.lg }]}>
              The frequencies are quiet.{'\n'}Pull to scan again.
            </Text>
            <TouchableOpacity
              testID="discover-empty-cta"
              onPress={() => router.push('/plan')}
              style={styles.emptyCta}
              activeOpacity={0.85}
            >
              <Feather name="plus" size={14} color={colors.light.ink} />
              <Meta style={{ marginLeft: 8, color: colors.light.ink }}>HOST AN OPEN RIDE</Meta>
            </TouchableOpacity>
          </View>
        ) : rides.map((r, i) => {
          const max = r.max_riders || 8;
          const taken = 1 + (r.crew_ids?.length || 0); // organiser + confirmed crew
          const seatsLeft = Math.max(0, max - taken);
          const reqStatus = requestState[r.id];
          const isOwnTrip = meQuery.data?.id && r.user_id === meQuery.data.id;
          const isFull = seatsLeft <= 0;
          const ctaLabel =
            joining === r.id ? 'SENDING…' :
            reqStatus === 'pending' ? '✓ REQUEST PENDING' :
            reqStatus === 'approved' ? 'OPEN RIDE →' :
            reqStatus === 'declined' ? 'REQUEST DECLINED' :
            isFull ? 'FULL — NO SEATS LEFT' :
            'REQUEST TO JOIN →';
          const ctaDisabled =
            joining === r.id || reqStatus === 'pending' || reqStatus === 'declined' || isFull;
          const onCtaPress = () => {
            if (reqStatus === 'approved') { router.push(`/trip/${r.id}`); return; }
            if (ctaDisabled) return;
            requestJoin(r);
          };
          return (
            <TouchableOpacity key={r.id} testID={`discover-card-${i}`} activeOpacity={0.85} onPress={() => router.push(`/trip/${r.id}`)} style={styles.card}>
              <View style={styles.illusWrap}>
                <TripIllus trip={r} width={360} height={180} />
                {/* M8 — region tag overlay */}
                <View style={styles.regionTag} testID={`discover-region-tag-${i}`}>
                  <Feather name="map-pin" size={9} color={colors.light.bg} />
                  <Text style={[type.meta, { color: colors.light.bg, marginLeft: 4, letterSpacing: 0.8 }]}>
                    {(r.city || r.start?.name || 'INDIA').split(' ')[0].toUpperCase()}
                  </Text>
                </View>
                {/* Seats-left chip — top right, mirrors region tag */}
                <View style={[styles.regionTag, styles.seatsTag, isFull && styles.seatsTagFull]} testID={`discover-seats-tag-${i}`}>
                  <Feather name="users" size={9} color={colors.light.bg} />
                  <Text style={[type.meta, { color: colors.light.bg, marginLeft: 4, letterSpacing: 0.8 }]}>
                    {isFull ? 'FULL' : `${seatsLeft} SEAT${seatsLeft === 1 ? '' : 'S'} LEFT`}
                  </Text>
                </View>
                {/* "Your ride" badge — bottom left, only shown to the organiser */}
                {isOwnTrip ? (
                  <View style={styles.ownBadge} testID={`discover-own-badge-${i}`}>
                    <Feather name="star" size={9} color={colors.light.amber} />
                    <Text style={[type.meta, { color: colors.light.amber, marginLeft: 4, letterSpacing: 0.8 }]}>
                      YOUR RIDE
                    </Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.cardBody}>
                <Eyebrow>{formatTripDate(r.planned_date).toUpperCase()}</Eyebrow>
                <Text style={[type.h2, { color: colors.light.ink, marginTop: 4 }]}>{r.name}</Text>
                <Meta style={{ marginTop: space.sm }}>
                  {(r.start?.name || '').toUpperCase()} → {(r.end?.name || '').toUpperCase()}
                </Meta>
                {r.description ? (
                  <Text numberOfLines={2} style={[type.body, { color: colors.light.inkMuted, marginTop: space.sm }]}>
                    {r.description}
                  </Text>
                ) : null}
                <View style={styles.metricsRow}>
                  <View style={styles.metric}><Meta>DIST</Meta><Text style={[type.h3, { color: colors.light.ink }]}>{r.distance_km}<Text style={type.meta}> KM</Text></Text></View>
                  <View style={styles.metric}><Meta>ELEV</Meta><Text style={[type.h3, { color: colors.light.ink }]}>{r.elevation_m}<Text style={type.meta}> M</Text></Text></View>
                  <View style={styles.metric}><Meta>CREW</Meta><Text style={[type.h3, { color: colors.light.ink }]}>{taken}<Text style={type.meta}> / {max}</Text></Text></View>
                </View>
                <TouchableOpacity
                  testID={`discover-join-${i}`}
                  style={[styles.joinBtn, ctaDisabled && reqStatus !== 'approved' && styles.joinBtnDisabled, reqStatus === 'pending' && styles.joinBtnPending]}
                  onPress={(e) => { e.stopPropagation?.(); onCtaPress(); }}
                  disabled={ctaDisabled && reqStatus !== 'approved'}
                  activeOpacity={0.85}
                >
                  <Meta style={{ color: reqStatus === 'pending' ? colors.light.ink : '#FFFFFF' }}>{ctaLabel}</Meta>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.light.bg },
  header: { padding: space.lg },
  card: { marginHorizontal: space.lg, marginTop: space.lg, borderWidth: 1, borderColor: colors.light.rule, borderRadius: radius.tiny, overflow: 'hidden', backgroundColor: colors.light.surface },
  image: { width: '100%', height: 180 },
  illusWrap: { width: '100%', height: 180, borderBottomWidth: 1, borderBottomColor: colors.light.rule, position: 'relative' },
  regionTag: {
    position: 'absolute', top: space.sm, left: space.sm,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(28,27,26,0.72)',
    paddingVertical: 4, paddingHorizontal: 8, borderRadius: 2,
  },
  cardBody: { padding: space.lg },
  metricsRow: { flexDirection: 'row', marginTop: space.md, gap: 32 },
  metric: { },
  joinBtn: { marginTop: space.lg, backgroundColor: colors.light.ink, paddingVertical: 12, alignItems: 'center', borderRadius: radius.tiny },
  joinBtnDisabled: { backgroundColor: colors.light.inkMuted },
  joinBtnPending: { backgroundColor: colors.light.surface, borderWidth: 1, borderColor: colors.light.amber },
  seatsTag: { left: undefined, right: space.sm },
  seatsTagFull: { backgroundColor: 'rgba(178,42,42,0.85)' },
  ownBadge: {
    position: 'absolute', bottom: space.sm, left: space.sm,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(28,27,26,0.82)',
    paddingVertical: 4, paddingHorizontal: 8, borderRadius: 2,
    borderWidth: 1, borderColor: colors.light.amber,
  },
  filterStrip: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: space.lg, marginVertical: space.sm,
    paddingHorizontal: space.md, paddingVertical: space.sm,
    borderWidth: 1, borderColor: colors.light.rule,
    backgroundColor: colors.light.surface, borderRadius: 2,
    gap: space.sm,
  },
  toggle: {
    width: 36, height: 20, borderRadius: 10,
    borderWidth: 1, borderColor: colors.light.rule,
    backgroundColor: colors.light.surface,
    justifyContent: 'center', paddingHorizontal: 2,
  },
  toggleOn: { backgroundColor: colors.light.amber, borderColor: colors.light.amber },
  toggleKnob: {
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: colors.light.ink,
  },
  toggleKnobOn: { backgroundColor: '#FFFFFF', alignSelf: 'flex-end' },
  empty: { padding: space.xl, alignItems: 'center' },
  emptyCta: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: colors.light.ink,
    paddingVertical: 10, paddingHorizontal: 16,
    borderRadius: 2, marginTop: space.lg,
  },
});
