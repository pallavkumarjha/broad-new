import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { api } from '../../src/lib/api';
import { colors, type, space, radius } from '../../src/theme/tokens';
import { Eyebrow, Rule, Meta } from '../../src/components/ui';

const HEROES = [
  'https://images.unsplash.com/photo-1764205821282-f28dd0e36c3c?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2OTF8MHwxfHNlYXJjaHwzfHxIaW1hbGF5YW4lMjBtb3RvcmN5Y2xlJTIwcm9hZHxlbnwwfHx8fDE3NzY0MDYwODJ8MA&ixlib=rb-4.1.0&q=85',
  'https://images.unsplash.com/photo-1768410318390-c27c9170207f?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2ODh8MHwxfHNlYXJjaHwyfHxtb3RvcmN5Y2xlJTIwZ3JvdXAlMjByaWRlfGVufDB8fHx8MTc3NjQwNjA4Mnww&ixlib=rb-4.1.0&q=85',
  'https://images.unsplash.com/photo-1767273133482-c1312aaf9f8e?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2OTF8MHwxfHNlYXJjaHwxfHxIaW1hbGF5YW4lMjBtb3RvcmN5Y2xlJTIwcm9hZHxlbnwwfHx8fDE3NzY0MDYwODJ8MA&ixlib=rb-4.1.0&q=85',
];

export default function Discover() {
  const router = useRouter();
  const [rides, setRides] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { const { data } = await api.get('/trips/discover'); setRides(data); } catch {}
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

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
      <ScrollView contentContainerStyle={{ paddingBottom: space.xxl }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {rides.length === 0 ? (
          <View style={styles.empty}>
            <Text style={[type.body, { color: colors.light.inkMuted, textAlign: 'center' }]}>The frequencies are quiet.{'\n'}Pull to scan again.</Text>
          </View>
        ) : rides.map((r, i) => (
          <TouchableOpacity key={r.id} testID={`discover-card-${i}`} activeOpacity={0.85} onPress={() => router.push(`/trip/${r.id}`)} style={styles.card}>
            <Image source={{ uri: HEROES[i % HEROES.length] }} style={styles.image} />
            <View style={styles.cardBody}>
              <Eyebrow>{(r.planned_date || 'TBD').toUpperCase()}</Eyebrow>
              <Text style={[type.h2, { color: colors.light.ink, marginTop: 4 }]}>{r.name}</Text>
              <Meta style={{ marginTop: space.sm }}>
                {(r.start?.name || '').toUpperCase()} → {(r.end?.name || '').toUpperCase()}
              </Meta>
              <View style={styles.metricsRow}>
                <View style={styles.metric}><Meta>DIST</Meta><Text style={[type.h3, { color: colors.light.ink }]}>{r.distance_km}<Text style={type.meta}> KM</Text></Text></View>
                <View style={styles.metric}><Meta>ELEV</Meta><Text style={[type.h3, { color: colors.light.ink }]}>{r.elevation_m}<Text style={type.meta}> M</Text></Text></View>
                <View style={styles.metric}><Meta>SEATS</Meta><Text style={[type.h3, { color: colors.light.ink }]}>{r.crew?.length || 0}</Text></View>
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.light.bg },
  header: { padding: space.lg },
  card: { marginHorizontal: space.lg, marginTop: space.lg, borderWidth: 1, borderColor: colors.light.rule, borderRadius: radius.tiny, overflow: 'hidden', backgroundColor: colors.light.surface },
  image: { width: '100%', height: 180 },
  cardBody: { padding: space.lg },
  metricsRow: { flexDirection: 'row', marginTop: space.md, gap: 32 },
  metric: { },
  empty: { padding: space.xxl, alignItems: 'center' },
});
