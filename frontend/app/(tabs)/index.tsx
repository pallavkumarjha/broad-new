import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, useWindowDimensions, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import { api } from '../../src/lib/api';
import { colors, type, space, radius, fonts } from '../../src/theme/tokens';
import { Eyebrow, Card, Rule, Meta } from '../../src/components/ui';
import { FIELD_NOTES, pickFromSeed } from '../../src/lib/content';
import { EmptyRoadIllus } from '../../src/components/illustrations';

type Trip = any;

export default function Home() {
  const { user } = useAuth();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [active, setActive] = useState<Trip | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/trips');
      setTrips(data);
      setActive(data.find((t: Trip) => t.status === 'active') || null);
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true); await load(); setRefreshing(false);
  };

  const greet = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const upcoming = trips.filter(t => t.status === 'planned').slice(0, 3);

  // M6 — pulse the live dot on the active trip card
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

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="home-screen">
      <ScrollView contentContainerStyle={{ paddingBottom: space.xxl }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.light.ink} />}>
        <View style={styles.header}>
          <Eyebrow>TODAY — {greet().toUpperCase()} · {new Date().toDateString().toUpperCase()}</Eyebrow>
          <Text style={[type.h1, { color: colors.light.ink, marginTop: space.xs }]}>{user?.name || 'Rider'}.</Text>
        </View>

        {active && (
          <TouchableOpacity testID="active-trip-card" activeOpacity={0.9} onPress={() => router.push(`/ride/${active.id}`)} style={styles.activeWrap}>
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

        <View style={styles.section}>
          <Eyebrow>QUICK ACTIONS</Eyebrow>
          <View style={styles.actionsRow}>
            <TouchableOpacity testID="quick-action-plan" onPress={() => router.push('/plan')} style={styles.actionBox} activeOpacity={0.85}>
              <Feather name="map" size={20} color={colors.light.ink} />
              <Text style={[type.h3, { color: colors.light.ink, marginTop: space.md }]}>Plan a route</Text>
              <Meta style={{ marginTop: space.xs }}>PLOT — INVITE — RIDE</Meta>
            </TouchableOpacity>
            <TouchableOpacity testID="quick-action-discover" onPress={() => router.push('/(tabs)/discover')} style={styles.actionBox} activeOpacity={0.85}>
              <Feather name="globe" size={20} color={colors.light.ink} />
              <Text style={[type.h3, { color: colors.light.ink, marginTop: space.md }]}>Find a ride</Text>
              <Meta style={{ marginTop: space.xs }}>JOIN OPEN CONVOYS</Meta>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Eyebrow>UPCOMING — {upcoming.length}</Eyebrow>
            <TouchableOpacity onPress={() => router.push('/(tabs)/trips')}><Meta>VIEW ALL →</Meta></TouchableOpacity>
          </View>
          <Rule style={{ marginTop: space.sm }} />
          {upcoming.length === 0 ? (
            <View style={styles.emptyUpcoming}>
              <EmptyRoadIllus width={width - space.lg * 2} height={130} />
              <Text style={[type.body, { color: colors.light.inkMuted, marginTop: space.md }]}>
                No trips on the horizon. Plot one.
              </Text>
            </View>
          ) : upcoming.map((t, i) => (
            <TouchableOpacity key={t.id} testID={`upcoming-trip-${i}`} onPress={() => router.push(`/trip/${t.id}`)} style={styles.tripRow} activeOpacity={0.7}>
              <View style={{ flex: 1 }}>
                <Text style={[type.h3, { color: colors.light.ink }]}>{t.name}</Text>
                <Meta style={{ marginTop: 4 }}>
                  {t.start?.name?.toUpperCase()} → {t.end?.name?.toUpperCase()} · {t.distance_km} KM
                </Meta>
              </View>
              <Feather name="chevron-right" size={20} color={colors.light.inkMuted} />
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Eyebrow>FIELD NOTE</Eyebrow>
            <Meta>TODAY'S NOTE · CHANGES DAILY</Meta>
          </View>
          <Card style={{ marginTop: space.sm }}>
            {(() => {
              const note = pickFromSeed(FIELD_NOTES, new Date().toDateString() + (user?.id || ''));
              return <>
                <Text style={[type.bodyLg, { color: colors.light.ink, fontFamily: fonts.serifMed }]}>
                  {note.text}
                </Text>
                <Text style={[type.meta, { color: colors.light.inkMuted, marginTop: space.md }]}>{note.by}</Text>
              </>;
            })()}
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.light.bg },
  header: { paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.md },
  section: { paddingHorizontal: space.lg, marginTop: space.xl },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  actionsRow: { flexDirection: 'row', gap: 12, marginTop: space.md },
  actionBox: {
    flex: 1, padding: space.md,
    borderWidth: 1, borderColor: colors.light.rule, borderRadius: radius.tiny,
    backgroundColor: colors.light.surface,
    minHeight: 120, justifyContent: 'space-between',
  },
  tripRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: space.md,
    borderBottomWidth: 1, borderBottomColor: colors.light.rule,
  },
  activeWrap: { paddingHorizontal: space.lg, marginTop: space.md },
  activeCard: {
    backgroundColor: colors.dark.bg, padding: space.lg,
    borderRadius: radius.tiny, borderWidth: 1, borderColor: colors.dark.rule,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.dark.amber },
  emptyUpcoming: { paddingVertical: space.md, alignItems: 'flex-start' },
});
