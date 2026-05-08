import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, useWindowDimensions, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../src/contexts/AuthContext';
import { api } from '../../src/lib/api';
import { colors, type, space, radius, fonts } from '../../src/theme/tokens';
import { Eyebrow, Meta } from '../../src/components/ui';
import { FIELD_NOTES, pickFromSeed } from '../../src/lib/content';
import { HorizonStrip, MountainIllus, SummitIllus, EmptyRoadIllus } from '../../src/components/illustrations';
import { SkeletonTripRow } from '../../src/components/Skeleton';

type Trip = any;

// ── helpers ────────────────────────────────────────────────────────────────

const NUMBER_WORDS = ['Zero','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten'];
function spellSmall(n: number): string {
  if (n >= 0 && n <= 10) return NUMBER_WORDS[n];
  return String(n);
}

function greet() {
  const h = new Date().getHours();
  if (h < 12) return 'GOOD MORNING';
  if (h < 17) return 'GOOD AFTERNOON';
  return 'GOOD EVENING';
}

function todayStrip(homeCity?: string | null): string {
  const d = new Date();
  const day = d.toLocaleDateString('en-IN', { weekday: 'short' }).toUpperCase();
  const dom = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }).toUpperCase();
  const place = homeCity ? ` · ${homeCity.toUpperCase()}` : '';
  return `${day} · ${dom}${place}`;
}

function daysUntil(dateStr: string | undefined | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0);
  const d = Math.round(diff / 86400000);
  return d >= 0 ? d : null;
}

function dayOfTrip(started?: string | null): number {
  if (!started) return 1;
  const ms = Date.now() - new Date(started).getTime();
  return Math.max(1, Math.floor(ms / 86400000) + 1);
}

function fmtDate(dateStr: string | undefined | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }).toUpperCase();
}

function fmtDow(dateStr: string | undefined | null): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-IN', { weekday: 'short' }).toUpperCase();
}

function startOfMonth(): number {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

// ── component ──────────────────────────────────────────────────────────────

export default function Home() {
  const { user } = useAuth();
  const router = useRouter();
  const { width } = useWindowDimensions();

  const tripsQuery = useQuery<Trip[]>({
    queryKey: ['trips', 'mine'],
    queryFn: async () => (await api.get('/trips')).data,
    placeholderData: (prev) => prev,
  });

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

  // Approved join requests for planned/active trips
  const approvedReqs = (reqsQuery.data ?? []).filter(
    (r: any) => r.status === 'approved' && (r.trip_status === 'planned' || r.trip_status === 'active')
  );

  // Inbox indicator — single dot, no number
  const unreadQuery = useQuery<{ count: number }>({
    queryKey: ['notifications', 'unread-count'],
    queryFn: async () => (await api.get('/notifications/unread-count')).data,
    refetchInterval: 30000,
    placeholderData: (prev) => prev,
  });
  const hasUnread = (unreadQuery.data?.count ?? 0) > 0;

  // Upcoming docket — top 3 (excluding the active trip if any)
  const upcoming = planned.slice(0, 3);

  // Monthly micro-stat — completed rides in the current calendar month
  const monthStart = startOfMonth();
  const monthly = completed.filter((t: Trip) => {
    const ts = new Date(t.ended_at || t.date || 0).getTime();
    return Number.isFinite(ts) && ts >= monthStart;
  });
  const monthlyKm = Math.round(
    monthly.reduce((s: number, t: Trip) => s + (t.actual_distance_km || t.distance_km || 0), 0)
  );

  // Live dot pulse for active state
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

  const fieldNote = pickFromSeed(FIELD_NOTES, new Date().toDateString() + (user?.id || ''));

  // ── render ───────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="home-screen">
      <ScrollView
        contentContainerStyle={{ paddingBottom: space.xxl }}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.light.ink} />}
      >
        {/* TOP STRIP — minimal */}
        <View style={styles.top}>
          <View style={{ flex: 1 }}>
            <Text style={styles.todayMeta}>{todayStrip(user?.home_city)}</Text>
            <Text style={styles.greetName}>{user?.name || 'Rider'}</Text>
          </View>
          <TouchableOpacity
            testID="home-notifications-btn"
            accessibilityLabel="Notifications"
            onPress={() => router.push('/notifications' as any)}
            style={styles.inbox}
            activeOpacity={0.7}
          >
            <Text style={styles.inboxLabel}>INBOX</Text>
            {hasUnread && <View style={styles.inboxDot} testID="home-notifications-badge" />}
          </TouchableOpacity>
        </View>

        {/* HORIZON STRIP */}
        <HorizonStrip width={width} height={56} />

        {/* HERO — active OR brief OR empty */}
        {active ? (
          <ActiveHero trip={active} day={dayOfTrip(active.started_at)} dotBlink={dotBlink} onPress={() => router.push(`/ride/${active.id}`)} />
        ) : nextTrip ? (
          <BriefPoster
            trip={nextTrip}
            days={daysToNext ?? 0}
            onPress={() => router.push(`/trip/${nextTrip.id}`)}
          />
        ) : !isInitialLoading && trips.length === 0 ? (
          <View style={styles.emptyHero}>
            <SummitIllus width={width - space.lg * 2} height={170} />
            <Text style={[type.body, { color: colors.light.inkMuted, marginTop: space.md, textAlign: 'center' }]}>
              Your first summit awaits.
            </Text>
          </View>
        ) : null}

        {/* APPROVED JOIN — small inline tag, only when present */}
        {approvedReqs.length > 0 && (
          <TouchableOpacity
            testID="approved-req-banner"
            activeOpacity={0.85}
            onPress={() => router.push(`/trip/${approvedReqs[0].trip_id}`)}
            style={styles.approvedTag}
          >
            <Feather name="check-circle" size={14} color="#2D6A4F" />
            <Text style={styles.approvedText}>
              YOU'RE IN · {(approvedReqs[0].trip_name || 'JOIN APPROVED').toUpperCase()}
              {approvedReqs.length > 1 ? ` · +${approvedReqs.length - 1} MORE` : ''}
            </Text>
            <Feather name="chevron-right" size={14} color={colors.light.inkMuted} />
          </TouchableOpacity>
        )}

        {/* MICRO STAT RIBBON — only when there's something to say */}
        {monthlyKm > 0 && (
          <View style={styles.ribbon}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, flex: 1 }}>
              <Text style={styles.ribbonNum}>{monthlyKm.toLocaleString()}</Text>
              <Text style={styles.ribbonBody}>
                km this month, {monthly.length === 1 ? 'one trip' : `${monthly.length} trips`}.
              </Text>
            </View>
          </View>
        )}

        {/* DOCKET */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Eyebrow>{active ? 'AFTER THIS RIDE' : 'THE DOCKET · UPCOMING'}</Eyebrow>
            <TouchableOpacity onPress={() => router.push('/(tabs)/trips')}>
              <Text style={[type.meta, { color: colors.light.ink }]}>VIEW ALL →</Text>
            </TouchableOpacity>
          </View>
          {isInitialLoading ? (
            <View style={{ marginTop: space.md }}>
              <SkeletonTripRow testID="home-skel-row-1" />
              <SkeletonTripRow testID="home-skel-row-2" />
            </View>
          ) : upcoming.length === 0 ? (
            <View style={styles.emptyDocket}>
              <EmptyRoadIllus width={width - space.lg * 2} height={120} />
              <Text style={[type.body, { color: colors.light.inkMuted, marginTop: space.md }]}>
                No trips on the horizon. Plot one.
              </Text>
            </View>
          ) : (
            <View style={styles.docketList}>
              {upcoming.map((t: Trip, i: number) => {
                const idx = String(i + 1).padStart(2, '0');
                const crew = t.crew?.length || 0;
                const startName = t.start?.name?.toUpperCase() || '';
                const endName = t.end?.name?.toUpperCase() || '';
                const route = startName && endName ? `${startName} → ${endName}` : startName;
                const sub = [route, crew ? `${crew} CREW` : null].filter(Boolean).join(' · ');
                return (
                  <TouchableOpacity
                    key={t.id}
                    testID={`upcoming-trip-${i}`}
                    onPress={() => router.push(`/trip/${t.id}`)}
                    style={[styles.docketRow, i === 0 ? styles.docketRowFirst : null]}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.docketIdx}>{idx}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.docketTitle}>{t.name}</Text>
                      {sub ? <Text style={styles.docketSub}>{sub}</Text> : null}
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.docketDate}>{fmtDate(t.date)}</Text>
                      <Text style={styles.docketDow}>{fmtDow(t.date)}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* PAGE-BREAK QUOTE — field note */}
        <View style={styles.pq}>
          <Text style={styles.pqQuote}>"{fieldNote.text}"</Text>
          <Text style={styles.pqBy}>— {fieldNote.by.toUpperCase()}</Text>
        </View>

        {/* POSTCARD — last ride */}
        {lastRide && (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Eyebrow>LAST RIDE · ARCHIVED</Eyebrow>
              {lastRide.date ? <Meta>{fmtDate(lastRide.date)}</Meta> : null}
            </View>
            <TouchableOpacity
              testID="last-ride-card"
              activeOpacity={0.88}
              onPress={() => router.push(`/trip/${lastRide.id}`)}
              style={styles.postcard}
            >
              <View style={styles.postcardArt}>
                <MountainIllus width={width - space.lg * 2} height={150} />
                {lastRide.elevation_m ? (
                  <View style={styles.stamp}>
                    <Text style={styles.stampLbl}>PEAK</Text>
                    <Text style={styles.stampNum}>{Number(lastRide.elevation_m).toLocaleString()}</Text>
                    <Text style={styles.stampLbl}>METRES</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.postcardBody}>
                <View style={styles.postcardTitleRow}>
                  <Text style={styles.postcardTitle}>{lastRide.name}</Text>
                  {lastRide.date ? <Text style={styles.postcardDate}>{fmtDate(lastRide.date)}</Text> : null}
                </View>
                <Text style={styles.postcardRoute}>
                  {(lastRide.start?.name || '').toUpperCase()}
                  {lastRide.end?.name ? ` → ${lastRide.end.name.toUpperCase()}` : ''}
                </Text>
                <View style={styles.postcardSpecs}>
                  <Stat num={Math.round(lastRide.actual_distance_km || lastRide.distance_km || 0).toLocaleString()} lbl="KM" />
                  {lastRide.duration_min ? (
                    <>
                      <View style={styles.statDivider} />
                      <Stat num={Math.round((lastRide.duration_min || 0) / 60).toString()} lbl="HRS · MOVING" />
                    </>
                  ) : null}
                  {lastRide.crew?.length ? (
                    <>
                      <View style={styles.statDivider} />
                      <Stat num={String(lastRide.crew.length)} lbl="CREW" />
                    </>
                  ) : null}
                </View>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* ACTIONS — demoted */}
        <View style={styles.actions}>
          <Text style={styles.actionsHead}>— PLOT YOUR NEXT</Text>
          <ActionRow
            testID="quick-action-plan"
            label="Plan a route"
            meta="PLOT · INVITE"
            onPress={() => router.push('/plan')}
            first
          />
          <ActionRow
            testID="quick-action-discover"
            label="Find a ride"
            meta="JOIN CONVOY"
            onPress={() => router.push('/(tabs)/discover')}
          />
        </View>

        {/* COLOPHON */}
        <View style={styles.colophon}>
          <View style={styles.colophonRule} />
          <Text style={styles.colophonText}>BROAD · MADE IN INDIA</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── sub-components ─────────────────────────────────────────────────────────

function Stat({ num, lbl }: { num: string; lbl: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.statNum}>{num}</Text>
      <Text style={styles.statLbl}>{lbl}</Text>
    </View>
  );
}

function ActionRow({ label, meta, onPress, first, testID }: { label: string; meta: string; onPress: () => void; first?: boolean; testID?: string }) {
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      activeOpacity={0.7}
      style={[styles.actionRow, first ? styles.actionRowFirst : null]}
    >
      <Text style={styles.actionLabel}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text style={styles.actionMeta}>{meta}</Text>
        <Feather name="arrow-right" size={14} color={colors.light.ink} />
      </View>
    </TouchableOpacity>
  );
}

function BriefPoster({ trip, days, onPress }: { trip: Trip; days: number; onPress: () => void }) {
  const startName = trip.start?.name?.toUpperCase() || '';
  const endName = trip.end?.name?.toUpperCase() || '';
  const dateStr = trip.date ? `${fmtDow(trip.date)} ${fmtDate(trip.date)}` : '';
  const word = spellSmall(days);
  // Use spelled-out word for ≤10 days, big numeral after.
  const usingWord = days <= 10;

  return (
    <TouchableOpacity activeOpacity={0.92} onPress={onPress} style={styles.brief} testID="brief-poster">
      <View style={styles.briefLabelRow}>
        <Eyebrow>TODAY'S BRIEF</Eyebrow>
        <Text style={[type.meta, { color: colors.light.amber }]}>NEXT RIDE</Text>
      </View>
      <View style={styles.poster}>
        <View style={styles.posterLeft}>
          <Text style={styles.posterPre}>In</Text>
          <Text style={usingWord ? styles.posterWordL : styles.posterNum}>
            {usingWord ? word : String(days)}
          </Text>
          <Text style={styles.posterWordS}>
            {days === 1 ? 'day.' : 'days.'}
          </Text>
        </View>
        <View style={styles.posterSpecs}>
          {trip.distance_km ? (
            <View>
              <Text style={styles.posterSpecNum}>{Math.round(trip.distance_km).toLocaleString()}</Text>
              <Text style={styles.posterSpecLbl}>KM</Text>
            </View>
          ) : null}
          {trip.crew?.length ? (
            <View style={{ marginTop: space.md, paddingTop: space.md, borderTopWidth: 1, borderTopColor: colors.light.rule }}>
              <Text style={styles.posterSpecNum}>{trip.crew.length}</Text>
              <Text style={styles.posterSpecLbl}>CREW</Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={styles.briefRideLine}>
        <View style={{ flex: 1 }}>
          <Text style={styles.briefRideName}>{trip.name}</Text>
          {(startName || dateStr) ? (
            <Text style={styles.briefRouteMeta}>
              {startName}
              {endName ? <Text style={{ color: colors.light.inkMuted }}> → </Text> : null}
              {endName}
              {dateStr ? ` · ${dateStr}` : ''}
            </Text>
          ) : null}
        </View>
        <Text style={styles.briefOpen}>OPEN →</Text>
      </View>
    </TouchableOpacity>
  );
}

function ActiveHero({ trip, day, dotBlink, onPress }: { trip: Trip; day: number; dotBlink: Animated.Value; onPress: () => void }) {
  const done = Math.round(trip.actual_distance_km || 0);
  const planned = Math.round(trip.distance_km || 0);
  const left = Math.max(0, planned - done);
  const pct = planned > 0 ? Math.min(100, (done / planned) * 100) : 0;
  const dayWord = spellSmall(day).toUpperCase();
  return (
    <TouchableOpacity testID="active-trip-card" activeOpacity={0.9} onPress={onPress} style={styles.active}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Animated.View style={[styles.liveDot, { opacity: dotBlink }]} testID="active-trip-dot" />
        <Text style={styles.activePulse}>LIVE · DAY {dayWord}</Text>
      </View>
      <Text style={styles.activeTitle}>{trip.name}</Text>
      <View style={styles.activeProgressBar}>
        <View style={[styles.activeProgressFill, { width: `${pct}%` }]} />
      </View>
      <View style={styles.activeStats}>
        <View style={{ flex: 1 }}>
          <Text style={styles.activeStatNum}>{done.toLocaleString()}</Text>
          <Text style={styles.activeStatLbl}>KM DONE</Text>
        </View>
        <View style={styles.activeStatDivider} />
        <View style={{ flex: 1 }}>
          <Text style={styles.activeStatNum}>{left.toLocaleString()}</Text>
          <Text style={styles.activeStatLbl}>KM LEFT</Text>
        </View>
        {trip.crew?.length ? (
          <>
            <View style={styles.activeStatDivider} />
            <View style={{ flex: 1 }}>
              <Text style={styles.activeStatNum}>{trip.crew.length}</Text>
              <Text style={styles.activeStatLbl}>CREW</Text>
            </View>
          </>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

// ── styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.light.bg },

  top: {
    paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.md,
    flexDirection: 'row', alignItems: 'center',
  },
  todayMeta: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.4, color: colors.light.inkMuted, textTransform: 'uppercase' },
  greetName: { fontFamily: fonts.serifMed, fontSize: 15, color: colors.light.ink, marginTop: 4 },
  inbox: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingHorizontal: 6 },
  inboxLabel: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 1.2, color: colors.light.ink, textTransform: 'uppercase' },
  inboxDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.light.amber },

  // BRIEF (poster)
  brief: {
    marginHorizontal: space.lg,
    paddingTop: space.lg, paddingBottom: space.lg,
    borderBottomWidth: 1, borderBottomColor: colors.light.rule,
  },
  briefLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: space.md },
  poster: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  posterLeft: { flex: 1 },
  posterPre: { fontFamily: 'Fraunces_400Regular', fontSize: 22, lineHeight: 24, fontStyle: 'italic', color: colors.light.inkMuted },
  posterWordL: { fontFamily: fonts.serifBold, fontSize: 76, lineHeight: 70, letterSpacing: -3.5, color: colors.light.ink },
  posterNum: { fontFamily: fonts.serifBold, fontSize: 84, lineHeight: 76, letterSpacing: -4, color: colors.light.ink },
  posterWordS: { fontFamily: fonts.serifMed, fontSize: 28, lineHeight: 30, letterSpacing: -0.6, color: colors.light.ink, marginTop: 4 },
  posterSpecs: { paddingBottom: 10, alignItems: 'flex-end' },
  posterSpecNum: { fontFamily: fonts.serifSemi, fontSize: 22, lineHeight: 24, color: colors.light.ink },
  posterSpecLbl: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1, color: colors.light.inkMuted, textTransform: 'uppercase', marginTop: 2 },
  briefRideLine: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: space.lg },
  briefRideName: { fontFamily: fonts.serifSemi, fontSize: 22, lineHeight: 24, color: colors.light.ink },
  briefRouteMeta: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1, color: colors.light.ink, textTransform: 'uppercase', marginTop: 4 },
  briefOpen: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 1, color: colors.light.amber, textTransform: 'uppercase' },

  // ACTIVE
  active: {
    marginHorizontal: space.lg, marginTop: space.md,
    backgroundColor: colors.dark.bg,
    padding: space.lg, paddingBottom: space.md,
    borderRadius: radius.tiny,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.dark.amber },
  activePulse: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.8, color: colors.dark.amber, textTransform: 'uppercase' },
  activeTitle: { fontFamily: fonts.serifSemi, fontSize: 30, lineHeight: 32, letterSpacing: -0.5, color: colors.dark.ink, marginTop: space.sm },
  activeProgressBar: { height: 2, backgroundColor: colors.dark.rule, marginTop: space.md, position: 'relative' },
  activeProgressFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: colors.dark.amber },
  activeStats: { flexDirection: 'row', marginTop: space.md },
  activeStatDivider: { width: 1, backgroundColor: colors.dark.rule, marginHorizontal: space.md },
  activeStatNum: { fontFamily: fonts.serifSemi, fontSize: 24, lineHeight: 26, letterSpacing: -0.3, color: colors.dark.ink },
  activeStatLbl: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 1.4, color: colors.dark.inkMuted, textTransform: 'uppercase', marginTop: 4 },

  // APPROVED
  approvedTag: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: space.lg, marginTop: space.md,
    paddingVertical: space.sm, paddingHorizontal: space.md,
    borderWidth: 1, borderColor: '#52B788',
    backgroundColor: '#F0FFF4',
    borderRadius: radius.tiny,
  },
  approvedText: { flex: 1, fontFamily: fonts.mono, fontSize: 11, letterSpacing: 0.8, color: '#1C1B1A' },

  // RIBBON
  ribbon: {
    marginHorizontal: space.lg, marginTop: space.lg,
    paddingHorizontal: space.md, paddingVertical: space.md,
    borderWidth: 1, borderColor: colors.light.rule,
    backgroundColor: colors.light.surface,
    borderRadius: radius.tiny,
    flexDirection: 'row', alignItems: 'center',
  },
  ribbonNum: { fontFamily: fonts.serifSemi, fontSize: 22, color: colors.light.ink, letterSpacing: -0.3 },
  ribbonBody: { fontFamily: 'Fraunces_400Regular', fontStyle: 'italic', fontSize: 14, color: colors.light.inkMuted },

  // SECTIONS
  section: { paddingHorizontal: space.lg, marginTop: space.xl },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },

  // DOCKET
  docketList: { marginTop: space.md },
  docketRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    paddingVertical: space.md,
    borderBottomWidth: 1, borderBottomColor: colors.light.rule,
  },
  docketRowFirst: { borderTopWidth: 1, borderTopColor: colors.light.ink },
  docketIdx: { width: 24, fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1, color: '#8A8784', marginTop: 4 },
  docketTitle: { fontFamily: fonts.serifMed, fontSize: 18, lineHeight: 22, color: colors.light.ink },
  docketSub: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 0.8, color: colors.light.inkMuted, textTransform: 'uppercase', marginTop: 4 },
  docketDate: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 1, color: colors.light.ink, textTransform: 'uppercase' },
  docketDow: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 1, color: '#8A8784', textTransform: 'uppercase', marginTop: 3 },

  // PAGE-BREAK QUOTE
  pq: {
    marginHorizontal: space.lg, marginTop: space.xl,
    paddingVertical: space.lg,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.light.rule,
    alignItems: 'center',
  },
  pqQuote: {
    fontFamily: 'Fraunces_400Regular', fontSize: 18, lineHeight: 26, fontStyle: 'italic',
    color: colors.light.ink, textAlign: 'center', paddingHorizontal: space.md,
  },
  pqBy: {
    fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.4, color: colors.light.inkMuted,
    textTransform: 'uppercase', marginTop: space.sm,
  },

  // POSTCARD
  postcard: {
    marginTop: space.md,
    borderWidth: 1, borderColor: colors.light.rule, borderRadius: radius.tiny,
    backgroundColor: colors.light.surface,
    overflow: 'hidden',
  },
  postcardArt: { position: 'relative' },
  stamp: {
    position: 'absolute', top: 12, right: 12,
    backgroundColor: colors.light.bg,
    borderWidth: 1, borderColor: colors.light.ink,
    paddingVertical: 4, paddingHorizontal: 8,
    alignItems: 'center', minWidth: 64,
  },
  stampLbl: { fontFamily: fonts.mono, fontSize: 8, letterSpacing: 1.2, color: colors.light.ink, textTransform: 'uppercase' },
  stampNum: { fontFamily: fonts.serifSemi, fontSize: 16, color: colors.light.ink, letterSpacing: -0.5, marginVertical: 1 },
  postcardBody: { padding: space.md },
  postcardTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  postcardTitle: { fontFamily: fonts.serifSemi, fontSize: 22, lineHeight: 24, color: colors.light.ink, flex: 1 },
  postcardDate: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 1, color: colors.light.ink, textTransform: 'uppercase' },
  postcardRoute: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1, color: colors.light.inkMuted, textTransform: 'uppercase', marginTop: 4 },
  postcardSpecs: {
    flexDirection: 'row', marginTop: space.md, paddingTop: space.md,
    borderTopWidth: 1, borderTopColor: colors.light.rule, borderStyle: 'dashed',
  },
  statDivider: { width: 1, backgroundColor: colors.light.rule, marginHorizontal: space.md },
  statNum: { fontFamily: fonts.serifSemi, fontSize: 20, lineHeight: 22, color: colors.light.ink },
  statLbl: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 1.4, color: colors.light.inkMuted, textTransform: 'uppercase', marginTop: 4 },

  // EMPTY STATES
  emptyHero: { paddingHorizontal: space.lg, paddingTop: space.lg, alignItems: 'center' },
  emptyDocket: { paddingTop: space.md, alignItems: 'flex-start' },

  // ACTIONS
  actions: { paddingHorizontal: space.lg, marginTop: space.xl },
  actionsHead: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 2, color: colors.light.inkMuted, textTransform: 'uppercase', marginBottom: space.sm },
  actionRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: space.md,
    borderBottomWidth: 1, borderBottomColor: colors.light.rule,
  },
  actionRowFirst: { borderTopWidth: 1, borderTopColor: colors.light.rule },
  actionLabel: { fontFamily: fonts.serifMed, fontSize: 17, color: colors.light.ink },
  actionMeta: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 0.6, color: colors.light.inkMuted, textTransform: 'uppercase' },

  // COLOPHON
  colophon: { marginTop: space.xl, alignItems: 'center' },
  colophonRule: { width: 24, height: 1, backgroundColor: '#8A8784', marginBottom: space.sm },
  colophonText: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 2, color: '#8A8784', textTransform: 'uppercase' },
});
