import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, useWindowDimensions, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { api } from '../../src/lib/api';
import { colors, type, space, radius } from '../../src/theme/tokens';
import { Eyebrow, Rule, Meta } from '../../src/components/ui';
import { TripIllus, EmptyRoadIllus } from '../../src/components/illustrations';

export default function Discover() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [rides, setRides] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);
  // Map of trip_id -> latest request status so the card can render the right CTA
  const [requestState, setRequestState] = useState<Record<string, 'pending' | 'approved' | 'declined' | 'cancelled'>>({});
  const [showAll, setShowAll] = useState(false);
  const [userHomeCity, setUserHomeCity] = useState<string | null>(null);

  const load = useCallback(async (showAllParam: boolean = false) => {
    try {
      const [discoverRes, mineRes, meRes] = await Promise.all([
        api.get('/trips/discover', { params: { show_all: showAllParam } }),
        api.get('/users/me/trip-requests').catch(() => ({ data: [] })),
        api.get('/auth/me').catch(() => ({ data: {} })),
      ]);
      setRides(discoverRes.data);
      setUserHomeCity(meRes.data?.home_city || null);
      // Latest request per trip wins (list comes back newest-first)
      const map: Record<string, any> = {};
      for (const r of mineRes.data || []) {
        if (!map[r.trip_id]) map[r.trip_id] = r.status;
      }
      setRequestState(map);
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => { load(showAll); }, [load, showAll]));

  const onRefresh = async () => { setRefreshing(true); await load(showAll); setRefreshing(false); };

  const onToggleShowAll = async (toggle: boolean) => {
    setShowAll(toggle);
    setRefreshing(true);
    await load(toggle);
    setRefreshing(false);
  };

  const requestJoin = async (trip: any) => {
    setJoining(trip.id);
    try {
      await api.post(`/trips/${trip.id}/request-join`, { note: '' });
      setRequestState(s => ({ ...s, [trip.id]: 'pending' }));
    } catch (e: any) {
      Alert.alert('Could not send request', e?.response?.data?.detail || e?.message || 'Please try again.');
    } finally { setJoining(null); }
  };

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
      <ScrollView contentContainerStyle={{ paddingBottom: space.xxl }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {rides.length === 0 ? (
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
              </View>
              <View style={styles.cardBody}>
                <Eyebrow>{(r.planned_date || 'TBD').toUpperCase()}</Eyebrow>
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
