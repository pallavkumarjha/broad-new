import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, useWindowDimensions, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../src/contexts/AuthContext';
import { api } from '../../src/lib/api';
import { colors, type, space, radius, fonts } from '../../src/theme/tokens';
import { Eyebrow, Card, Rule, Meta } from '../../src/components/ui';
import { FIELD_NOTES, pickFromSeed } from '../../src/lib/content';
import { EmptyRoadIllus, SunriseRideIllus, SummitIllus, TripIllus } from '../../src/components/illustrations';
import { SkeletonTripRow } from '../../src/components/Skeleton';

type Trip = any;

// ── helpers ──────────────────────────────────────────────────────────────────

function greet() {
  const h = new Date().getHours();
  if (h < 12) return 'GOOD MORNING';
  if (h < 17) return 'GOOD AFTERNOON';
  return 'GOOD EVENING';
}

function daysUntil(dateStr: string | undefined | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0);
  const d = Math.round(diff / 86400000);
  return d >= 0 ? d : null;
}

function fmtKm(km: number) {
  if (km >= 1000) return `${(km / 1000).toFixed(1)}K`;
  return String(Math.round(km));
}

function fmtDate(dateStr: string | undefined | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }).toUpperCase();
}

// ── component ─────────────────────────────────────────────────────────────────

export default function Home() {
  const { user } = useAuth();
  const router = useRouter();
  const { width } = useWindowDimensions();

  const tripsQuery = useQuery<Trip[]>({
    queryKey: ['trips', 'mine'],
    queryFn: async () => (await api.get('/trips')).data,
    placeholderData: (prev) => prev,
  });

  // Join requests — to detect approved ones not yet in an active ride
  const reqsQuery = useQuery<any[]>({
    queryKey: ['users', 'me', 'trip-requests'],
    queryFn: async () => (await api.get('/users/me/trip-requests')).data,
    placeholderData: (prev) => prev,
  });

  const trips = tripsQuery.data ?? [];
  const active = trips.find((t: Trip) => t.status === 'active') || null;
  const planned = trips.filter((t: Trip) => t.status === 'planned');
  const completed = trips.filter((t: Trip) => t.status === 'completed');
  const lastRide = completed[0] || null;

  const isInitialLoading = tripsQuery.isLoading && !tripsQuery.data;

  // Next upcoming trip with a date set
  const nextTrip = planned
    .filter((t: Trip) => !!t.date)
    .sort((a: Trip, b: Trip) => new Date(a.date).getTime() - new Date(b.date).getTime())[0] || null;
  const daysToNext = nextTrip ? daysUntil(nextTrip.date) : null;

  // Approved join requests for planned/active trips that the user is a crew member of
  const approvedReqs = (reqsQuery.data ?? []).filter(
    (r: any) => r.status === 'approved' && (r.trip_status === 'planned' || r.trip_status === 'active')
  );

  // Unread notification badge — polled lightly; refetched on focus by RQ defaults.
  const unreadQuery = useQuery<{ count: number }>({
    queryKey: ['notifications', 'unread-count'],
    queryFn: async () => (await api.get('/notifications/unread-count')).data,
    refetchInterval: 30000,
    placeholderData: (prev) => prev,
  });
  const unreadCount = unreadQuery.data?.count ?? 0;

  const upcoming = planned.slice(0, 3);

  // Live dot pulse
  const dotBlink = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(dotBlink, { toValue: 0.2, duration: 600, useNativeDriver: true }),
        Animated.timing(dotBlink, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [active, dotBlink]);

  const onRefresh = async () => {
    await Promise.all([tripsQuery.refetch(), reqsQuery.refetch()]);
  };

  const isRefreshing = (tripsQuery.isRefetching || reqsQuery.isRefetching) && !isInitialLoading;

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="home-screen">
      <ScrollView
        contentContainerStyle={{ paddingBottom: space.xxl }}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.light.ink} />
        }
      >
        {/* ── Hero illustration ──────────────────────────────────── */}
        <SunriseRideIllus width={width} height={160} />

        {/* ── Header ────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Eyebrow>{greet()} · {new Date().toDateString().toUpperCase()}</Eyebrow>
            <Text style={[type.h1, { color: colors.light.ink, marginTop: space.xs }]}>
              {user?.name?.split(' ')[0] || 'Rider'}.
            </Text>
          </View>
          <TouchableOpacity
            testID="home-notifications-btn"
            accessibilityLabel="Notifications"
            onPress={() => router.push('/notifications' as any)}
            style={styles.bellBtn}
            activeOpacity={0.7}
          >
            <Feather name="bell" size={22} color={colors.light.ink} />
            {unreadCount > 0 && (
              <View style={styles.bellBadge} testID="home-notifications-badge">
                <Text style={styles.bellBadgeText}>
                  {unreadCount > 9 ? '9+' : String(unreadCount)}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* ── Stats strip ───────────────────────────────────────── */}
        {user?.stats && (
          <>
            <Rule style={{ marginHorizontal: space.lg }} />
            <View style={styles.statsRow}>
              <View style={styles.statCell}>
                <Text style={[type.h2, { color: colors.light.ink }]}>{fmtKm(user.stats.total_km)}</Text>
                <Meta style={{ marginTop: 2 }}>KM RIDDEN</Meta>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statCell}>
                <Text style={[type.h2, { color: colors.light.ink }]}>{user.stats.trips_completed}</Text>
                <Meta style={{ marginTop: 2 }}>RIDES</Meta>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statCell}>
                <Text style={[type.h2, { color: colors.light.ink }]}>{fmtKm(user.stats.highest_point_m)}</Text>
                <Meta style={{ marginTop: 2 }}>PEAK (M)</Meta>
              </View>
            </View>
            <Rule style={{ marginHorizontal: space.lg }} />
          </>
        )}

        {/* ── Active trip card ──────────────────────────────────── */}
        {active && (
          <TouchableOpacity
            testID="active-trip-card"
            activeOpacity={0.9}
            onPress={() => router.push(`/ride/${active.id}`)}
            style={styles.activeWrap}
          >
            <View style={styles.activeCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Animated.View style={[styles.liveDot, { opacity: dotBlink }]} testID="active-trip-dot" />
                <Eyebrow color={colors.dark.amber}>TRIP IN PROGRESS</Eyebrow>
              </View>
              <Text style={[type.h2, { color: colors.dark.ink, marginTop: space.xs }]}>{active.name}</Text>
              <Text style={[type.meta, { color: colors.dark.inkMuted, marginTop: space.sm }]}>
                {active.distance_km} KM · {active.crew?.length || 0} CREW · TAP TO OPEN INSTRUMENT PANEL
              </Text>
            </View>
          </TouchableOpacity>
        )}

        {/* ── Next ride countdown ───────────────────────────────── */}
        {!active && nextTrip && daysToNext !== null && (
          <TouchableOpacity
            testID="next-ride-banner"
            activeOpacity={0.88}
            onPress={() => router.push(`/trip/${nextTrip.id}`)}
            style={[styles.banner, styles.bannerAmber]}
          >
            <View style={{ flex: 1 }}>
              <Eyebrow color={colors.light.amber}>NEXT RIDE</Eyebrow>
              <Text style={[type.h3, { color: colors.light.ink, marginTop: 2 }]}>{nextTrip.name}</Text>
              <Meta style={{ marginTop: 4 }}>{fmtDate(nextTrip.date)} · {nextTrip.distance_km} KM</Meta>
            </View>
            <View style={styles.countdownBadge}>
              <Text style={[type.h2, { color: colors.light.ink, lineHeight: 28 }]}>
                {daysToNext === 0 ? 'TODAY' : `${daysToNext}`}
              </Text>
              {daysToNext > 0 && <Meta>DAYS</Meta>}
            </View>
          </TouchableOpacity>
        )}

        {/* ── Approved join request banner ──────────────────────── */}
        {approvedReqs.length > 0 && (
          <TouchableOpacity
            testID="approved-req-banner"
            activeOpacity={0.88}
            onPress={() => router.push(`/trip/${approvedReqs[0].trip_id}`)}
            style={[styles.banner, styles.bannerGreen]}
          >
            <Feather name="check-circle" size={18} color="#2D6A4F" style={{ marginTop: 1 }} />
            <View style={{ flex: 1, marginLeft: space.sm }}>
              <Eyebrow color="#2D6A4F">YOU'RE IN</Eyebrow>
              <Text style={[type.h3, { color: colors.light.ink, marginTop: 2 }]}>
                {approvedReqs[0].trip_name || 'Your request was approved'}
              </Text>
              {approvedReqs.length > 1 && (
                <Meta style={{ marginTop: 4 }}>+{approvedReqs.length - 1} more</Meta>
              )}
            </View>
            <Feather name="chevron-right" size={18} color={colors.light.inkMuted} />
          </TouchableOpacity>
        )}

        {/* ── Quick actions ─────────────────────────────────────── */}
        <View style={styles.section}>
          <Eyebrow>QUICK ACTIONS</Eyebrow>
          <View style={styles.actionsRow}>
            <TouchableOpacity
              testID="quick-action-plan"
              onPress={() => router.push('/plan')}
              style={styles.actionBox}
              activeOpacity={0.85}
            >
              <Feather name="map" size={20} color={colors.light.ink} />
              <Text style={[type.h3, { color: colors.light.ink, marginTop: space.md }]}>Plan a route</Text>
              <Meta style={{ marginTop: space.xs }}>PLOT — INVITE — RIDE</Meta>
            </TouchableOpacity>
            <TouchableOpacity
              testID="quick-action-discover"
              onPress={() => router.push('/(tabs)/discover')}
              style={styles.actionBox}
              activeOpacity={0.85}
            >
              <Feather name="globe" size={20} color={colors.light.ink} />
              <Text style={[type.h3, { color: colors.light.ink, marginTop: space.md }]}>Find a ride</Text>
              <Meta style={{ marginTop: space.xs }}>JOIN OPEN CONVOYS</Meta>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Upcoming trips ────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Eyebrow>UPCOMING — {upcoming.length}</Eyebrow>
            <TouchableOpacity onPress={() => router.push('/(tabs)/trips')}>
              <Meta>VIEW ALL →</Meta>
            </TouchableOpacity>
          </View>
          <Rule style={{ marginTop: space.sm }} />
          {isInitialLoading ? (
            <View>
              <SkeletonTripRow testID="home-skel-row-1" />
              <SkeletonTripRow testID="home-skel-row-2" />
            </View>
          ) : upcoming.length === 0 ? (
            <View style={styles.emptyUpcoming}>
              <EmptyRoadIllus width={width - space.lg * 2} height={130} />
              <Text style={[type.body, { color: colors.light.inkMuted, marginTop: space.md }]}>
                No trips on the horizon. Plot one.
              </Text>
            </View>
          ) : (
            upcoming.map((t: Trip, i: number) => {
              const crew = t.crew?.length || 0;
              return (
                <TouchableOpacity
                  key={t.id}
                  testID={`upcoming-trip-${i}`}
                  onPress={() => router.push(`/trip/${t.id}`)}
                  style={styles.tripRow}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={[type.h3, { color: colors.light.ink }]}>{t.name}</Text>
                      {t.date && (
                        <View style={styles.datePill}>
                          <Text style={[type.meta, { color: colors.light.amber, fontSize: 9, letterSpacing: 1 }]}>
                            {fmtDate(t.date)}
                          </Text>
                        </View>
                      )}
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                      <Meta>{t.start?.name?.toUpperCase()} → {t.end?.name?.toUpperCase()} · {t.distance_km} KM</Meta>
                      {crew > 0 && (
                        <View style={styles.crewPill}>
                          <Feather name="users" size={9} color={colors.light.inkMuted} />
                          <Text style={[type.meta, { fontSize: 9, color: colors.light.inkMuted, marginLeft: 3 }]}>
                            {crew}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <Feather name="chevron-right" size={20} color={colors.light.inkMuted} />
                </TouchableOpacity>
              );
            })
          )}
        </View>

        {/* ── Last ride recap ───────────────────────────────────── */}
        {lastRide && (
          <View style={styles.section}>
            <Eyebrow>LAST RIDE</Eyebrow>
            <TouchableOpacity
              testID="last-ride-card"
              activeOpacity={0.88}
              onPress={() => router.push(`/trip/${lastRide.id}`)}
              style={styles.lastRideCard}
            >
              <TripIllus trip={lastRide} width={width - space.lg * 2} height={140} />
              <View style={styles.lastRideBody}>
                <Text style={[type.h3, { color: colors.light.ink }]}>{lastRide.name}</Text>
                <Meta style={{ marginTop: 4 }}>
                  {lastRide.start?.name?.toUpperCase()} → {lastRide.end?.name?.toUpperCase()}
                </Meta>
                <View style={styles.lastRideStats}>
                  <View style={styles.lastStat}>
                    <Text style={[type.h3, { color: colors.light.ink }]}>{lastRide.distance_km}</Text>
                    <Meta>KM</Meta>
                  </View>
                  <View style={styles.lastStat}>
                    <Text style={[type.h3, { color: colors.light.ink }]}>{lastRide.crew?.length || 0}</Text>
                    <Meta>CREW</Meta>
                  </View>
                  {lastRide.date && (
                    <View style={styles.lastStat}>
                      <Text style={[type.h3, { color: colors.light.ink }]}>{fmtDate(lastRide.date)}</Text>
                      <Meta>DATE</Meta>
                    </View>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Summit illustration (no completed rides) ──────────── */}
        {!lastRide && !isInitialLoading && trips.length === 0 && (
          <View style={[styles.section, { alignItems: 'center' }]}>
            <SummitIllus width={width - space.lg * 2} height={180} />
            <Text style={[type.body, { color: colors.light.inkMuted, marginTop: space.md, textAlign: 'center' }]}>
              Your first summit awaits.
            </Text>
          </View>
        )}

        {/* ── Field note ────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Eyebrow>FIELD NOTE</Eyebrow>
            <Meta>CHANGES DAILY</Meta>
          </View>
          <Card style={{ marginTop: space.sm }}>
            {(() => {
              const note = pickFromSeed(FIELD_NOTES, new Date().toDateString() + (user?.id || ''));
              return (
                <>
                  <Text style={[type.bodyLg, { color: colors.light.ink, fontFamily: fonts.serifMed }]}>
                    {note.text}
                  </Text>
                  <Text style={[type.meta, { color: colors.light.inkMuted, marginTop: space.md }]}>{note.by}</Text>
                </>
              );
            })()}
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.light.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.md,
  },
  bellBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  bellBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: colors.light.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  statCell: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, backgroundColor: colors.light.rule },

  section: { paddingHorizontal: space.lg, marginTop: space.xl },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

  actionsRow: { flexDirection: 'row', gap: 12, marginTop: space.md },
  actionBox: {
    flex: 1, padding: space.md,
    borderWidth: 1, borderColor: colors.light.rule, borderRadius: radius.tiny,
    backgroundColor: colors.light.surface,
    minHeight: 120, justifyContent: 'space-between',
  },

  activeWrap: { paddingHorizontal: space.lg, marginTop: space.lg },
  activeCard: {
    backgroundColor: colors.dark.bg, padding: space.lg,
    borderRadius: radius.tiny, borderWidth: 1, borderColor: colors.dark.rule,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.dark.amber },

  banner: {
    marginHorizontal: space.lg, marginTop: space.lg,
    flexDirection: 'row', alignItems: 'center',
    padding: space.md,
    borderRadius: radius.tiny, borderWidth: 1,
  },
  bannerAmber: { borderColor: colors.light.amber, backgroundColor: '#FDF6EC' },
  bannerGreen: { borderColor: '#52B788', backgroundColor: '#F0FFF4' },
  countdownBadge: { alignItems: 'center', minWidth: 44 },

  tripRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: space.md,
    borderBottomWidth: 1, borderBottomColor: colors.light.rule,
  },
  datePill: {
    borderWidth: 1, borderColor: colors.light.amber,
    borderRadius: 3, paddingHorizontal: 5, paddingVertical: 2,
  },
  crewPill: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: colors.light.rule,
    borderRadius: 3, paddingHorizontal: 5, paddingVertical: 2,
  },

  emptyUpcoming: { paddingVertical: space.md, alignItems: 'flex-start' },

  lastRideCard: {
    marginTop: space.md,
    borderWidth: 1, borderColor: colors.light.rule, borderRadius: radius.tiny,
    overflow: 'hidden',
    backgroundColor: colors.light.surface,
  },
  lastRideBody: { padding: space.md },
  lastRideStats: {
    flexDirection: 'row', gap: space.lg, marginTop: space.md,
    paddingTop: space.md, borderTopWidth: 1, borderTopColor: colors.light.rule,
  },
  lastStat: { alignItems: 'center' },
});
