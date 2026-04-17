import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import { api } from '../../src/lib/api';
import { colors, type, space } from '../../src/theme/tokens';
import { Eyebrow, Rule, SpecRow, Card, Meta, Button } from '../../src/components/ui';

export default function Profile() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [badges, setBadges] = useState<any[]>([]);

  useFocusEffect(
    React.useCallback(() => {
      (async () => {
        try { const { data } = await api.get('/users/me/achievements'); setBadges(data.badges || []); } catch {}
      })();
    }, [])
  );

  if (!user) return null;

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="profile-screen">
      <ScrollView contentContainerStyle={{ paddingBottom: space.xxl }}>
        <View style={styles.header}>
          <Eyebrow>RIDER PROFILE</Eyebrow>
          <View style={styles.headRow}>
            <Text style={[type.h1, { color: colors.light.ink }]}>{user.name}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity testID="profile-edit-btn" onPress={() => router.push('/profile/edit')} style={styles.iconBtn}>
                <Feather name="edit-2" size={18} color={colors.light.ink} />
              </TouchableOpacity>
              <TouchableOpacity testID="profile-settings-btn" onPress={() => router.push('/settings')} style={styles.iconBtn}>
                <Feather name="settings" size={20} color={colors.light.ink} />
              </TouchableOpacity>
            </View>
          </View>
          <Meta style={{ marginTop: 4 }}>{user.email.toUpperCase()}</Meta>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Meta>TOTAL KM</Meta>
            <Text style={[type.h1, { color: colors.light.ink, marginTop: 4 }]}>{Math.round(user.stats.total_km).toLocaleString()}</Text>
          </View>
          <View style={[styles.statBox, styles.statBoxMid]}>
            <Meta>TRIPS</Meta>
            <Text style={[type.h1, { color: colors.light.ink, marginTop: 4 }]}>{user.stats.trips_completed}</Text>
          </View>
          <View style={styles.statBox}>
            <Meta>HIGH PT</Meta>
            <Text style={[type.h1, { color: colors.light.ink, marginTop: 4 }]}>{user.stats.highest_point_m.toLocaleString()}<Text style={type.meta}> M</Text></Text>
          </View>
        </View>
        <Rule />

        <View style={styles.section}>
          <Eyebrow>ACHIEVEMENTS — {badges.length}</Eyebrow>
          {badges.length === 0 ? (
            <Card style={{ marginTop: space.sm }}>
              <Text style={[type.body, { color: colors.light.inkMuted }]}>None yet. Complete a ride to earn your first badge.</Text>
            </Card>
          ) : (
            <View style={{ marginTop: space.sm, gap: space.sm }}>
              {badges.map((b) => (
                <View key={b.code} style={styles.badgeRow} testID={`badge-${b.code}`}>
                  <View style={styles.badgeDot}><Feather name="award" size={14} color={colors.light.amber} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={[type.body, { color: colors.light.ink, fontFamily: 'Fraunces_500Medium' }]}>{b.title}</Text>
                    <Meta style={{ marginTop: 2 }}>{b.meta.toUpperCase()}</Meta>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Eyebrow>THE BIKE</Eyebrow>
          <Card style={{ marginTop: space.sm }}>
            <SpecRow label="MAKE" value={(user.bike.make || '—').toUpperCase()} />
            <SpecRow label="MODEL" value={(user.bike.model || '—').toUpperCase()} />
            <SpecRow label="REGISTRATION" value={(user.bike.registration || '—').toUpperCase()} />
            <SpecRow label="ODOMETER" value={`${user.bike.odometer_km?.toLocaleString() || 0} KM`} last />
          </Card>
        </View>

        <View style={styles.section}>
          <Eyebrow>EMERGENCY CONTACTS — {user.emergency_contacts.length}</Eyebrow>
          <Card style={{ marginTop: space.sm }}>
            {user.emergency_contacts.length === 0 ? (
              <Text style={[type.body, { color: colors.light.inkMuted }]}>None yet. Add one — for the bad day.</Text>
            ) : user.emergency_contacts.map((c, i) => (
              <View key={i} style={[styles.contactRow, i === user.emergency_contacts.length - 1 ? null : styles.contactRowDivider]}>
                <View>
                  <Text style={[type.body, { color: colors.light.ink, fontFamily: 'Fraunces_500Medium' }]}>{c.name}</Text>
                  <Meta style={{ marginTop: 2 }}>{(c.relation || 'CONTACT').toUpperCase()}</Meta>
                </View>
                <Meta style={{ color: colors.light.ink }}>{c.phone}</Meta>
              </View>
            ))}
          </Card>
        </View>

        <View style={styles.section}>
          <Button label="SIGN OUT" variant="ghost" testID="profile-signout-btn" onPress={async () => { await signOut(); router.replace('/(auth)/login'); }} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.light.bg },
  header: { padding: space.lg, paddingBottom: space.md },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: space.xs },
  iconBtn: { borderWidth: 1, borderColor: colors.light.rule, padding: 10, borderRadius: 2 },
  statsRow: { flexDirection: 'row', paddingHorizontal: space.lg, paddingBottom: space.lg },
  statBox: { flex: 1, paddingVertical: space.sm },
  statBoxMid: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.light.rule, paddingHorizontal: space.md },
  section: { paddingHorizontal: space.lg, marginTop: space.xl },
  contactRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: space.md },
  contactRowDivider: { borderBottomWidth: 1, borderBottomColor: colors.light.rule },
  badgeRow: { flexDirection: 'row', alignItems: 'center', padding: space.md, borderWidth: 1, borderColor: colors.light.rule, backgroundColor: colors.light.surface, gap: 12 },
  badgeDot: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: colors.light.amber, alignItems: 'center', justifyContent: 'center' },
});
