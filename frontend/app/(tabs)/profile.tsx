import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import { api } from '../../src/lib/api';
import { queryClient } from '../../src/lib/queryClient';
import { colors, type, space } from '../../src/theme/tokens';
import { Eyebrow, Rule, SpecRow, Card, Meta, Button } from '../../src/components/ui';

// Top 20 most-populated Indian cities (city proper, 2024 estimates) + Other.
const CITIES = [
  'Mumbai', 'Delhi', 'Bengaluru', 'Hyderabad', 'Ahmedabad',
  'Chennai', 'Kolkata', 'Surat', 'Pune', 'Jaipur',
  'Lucknow', 'Kanpur', 'Nagpur', 'Indore', 'Thane',
  'Bhopal', 'Visakhapatnam', 'Pimpri-Chinchwad', 'Patna', 'Vadodara',
  'Other',
];

export default function Profile() {
  const { user, signOut, refresh } = useAuth();
  const router = useRouter();
  const [badges, setBadges] = useState<any[]>([]);
  const [cityPickerOpen, setCityPickerOpen] = useState(false);
  // savingCity tracks which city is being persisted so the card shows a spinner.
  // optimisticCity drives the display while refresh() is still in-flight.
  const [savingCity, setSavingCity] = useState(false);
  const [optimisticCity, setOptimisticCity] = useState<string | null | undefined>(undefined);

  useFocusEffect(
    React.useCallback(() => {
      (async () => {
        try { const { data } = await api.get('/users/me/achievements'); setBadges(data.badges || []); } catch {}
      })();
    }, [])
  );

  // Derived display value — shows the optimistic city while the network call
  // is in-flight, then falls back to the confirmed value from AuthContext.
  const displayCity = optimisticCity !== undefined ? optimisticCity : user?.home_city;

  const setHomeCity = async (city: string | null) => {
    // Close immediately so the tap feels instant, then save in background.
    setCityPickerOpen(false);
    setOptimisticCity(city);
    setSavingCity(true);
    try {
      await api.patch('/users/me', { home_city: city });
      await refresh(); // updates user.home_city in AuthContext
      setOptimisticCity(undefined); // hand off to real value now that refresh is done
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      queryClient.invalidateQueries({ queryKey: ['trips', 'discover'] });
    } catch (e: any) {
      setOptimisticCity(undefined); // revert display to last confirmed value
      Alert.alert('Could not save home city', e?.response?.data?.detail || e?.message || 'Please try again.');
    } finally { setSavingCity(false); }
  };

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
          <Eyebrow>HOME CITY — FOR DISCOVER FILTER</Eyebrow>
          <TouchableOpacity
            testID="profile-home-city-btn"
            onPress={() => setCityPickerOpen(true)}
            style={styles.cityCard}
            activeOpacity={0.85}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={styles.cityIcon}>
                <Feather name="map-pin" size={18} color={colors.light.ink} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[type.h3, { color: colors.light.ink }]}>
                  {displayCity || 'Not set'}
                </Text>
                <Meta style={{ marginTop: 2 }}>
                  {displayCity
                    ? "TAP TO CHANGE — You'll see rides from here in Discover"
                    : 'SET YOUR CITY — See only trips starting near you'}
                </Meta>
              </View>
              {savingCity
                ? <ActivityIndicator size="small" color={colors.light.inkMuted} />
                : <Feather name="chevron-right" size={18} color={colors.light.inkMuted} />}
            </View>
          </TouchableOpacity>
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
          <Eyebrow>GLOVEBOX</Eyebrow>
          <TouchableOpacity
            testID="profile-glovebox-btn"
            onPress={() => router.push('/glovebox' as any)}
            style={styles.gloveboxCard}
          >
            <View style={styles.gloveboxInner}>
              <View style={styles.gloveboxIcon}>
                <Feather name="lock" size={18} color={colors.light.ink} />
              </View>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={[type.h3, { color: colors.light.ink }]}>Your documents.</Text>
                <Meta style={{ marginTop: 2 }}>DEVICE-ONLY · NEVER UPLOADED</Meta>
              </View>
              <Feather name="chevron-right" size={18} color={colors.light.inkMuted} />
            </View>
            {/* M7 — ghost doc label chips so the card feels like a real glovebox */}
            <View style={styles.gloveboxChips} testID="glovebox-ghost-chips">
              {['RC BOOK', 'INSURANCE', 'LICENCE', 'MEDICAL'].map((label) => (
                <View key={label} style={styles.ghostChip}>
                  <Feather name="file-text" size={10} color={colors.light.inkMuted} />
                  <Text style={[type.meta, { color: colors.light.inkMuted, marginLeft: 5 }]}>{label}</Text>
                </View>
              ))}
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Button label="SIGN OUT" variant="ghost" testID="profile-signout-btn" onPress={async () => { await signOut(); router.replace('/(auth)/login'); }} />
        </View>
      </ScrollView>

      {cityPickerOpen && (
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerModal}>
            <View style={styles.pickerHead}>
              <Eyebrow>SET HOME CITY</Eyebrow>
              <TouchableOpacity onPress={() => setCityPickerOpen(false)} testID="profile-city-picker-close">
                <Feather name="x" size={20} color={colors.light.ink} />
              </TouchableOpacity>
            </View>
            <Rule />
            <ScrollView contentContainerStyle={{ paddingBottom: space.lg }}>
              {/* Clear selection option */}
              <TouchableOpacity
                testID="profile-city-clear"
                style={styles.cityOption}
                onPress={() => setHomeCity(null)}
                activeOpacity={0.85}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[type.body, { color: user.home_city ? colors.light.inkMuted : colors.light.ink }]}>
                    Don't filter (show all trips)
                  </Text>
                </View>
                {!user.home_city && <Feather name="check" size={18} color={colors.light.amber} />}
              </TouchableOpacity>

              {/* City options */}
              {CITIES.map((city) => (
                <TouchableOpacity
                  key={city}
                  testID={`profile-city-option-${city.toLowerCase()}`}
                  style={styles.cityOption}
                  onPress={() => setHomeCity(city)}
                  activeOpacity={0.85}
                  disabled={savingCity}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[type.body, { color: user.home_city === city ? colors.light.ink : colors.light.inkMuted, fontFamily: user.home_city === city ? 'Fraunces_500Medium' : undefined }]}>
                      {city}
                    </Text>
                  </View>
                  {user.home_city === city && <Feather name="check" size={18} color={colors.light.amber} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      )}
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
  gloveboxCard: { marginTop: space.sm, borderWidth: 1, borderColor: colors.light.rule, borderRadius: 2, backgroundColor: colors.light.surface },
  gloveboxInner: { flexDirection: 'row', alignItems: 'center', padding: space.lg, paddingBottom: space.sm },
  gloveboxIcon: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.light.rule, alignItems: 'center', justifyContent: 'center' },
  gloveboxChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: space.lg, paddingBottom: space.lg },
  ghostChip: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: colors.light.rule,
    borderRadius: 2, paddingVertical: 4, paddingHorizontal: 8,
    backgroundColor: colors.light.bg,
  },
  // Home city picker
  pickerOverlay: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end',
  },
  pickerModal: {
    backgroundColor: colors.light.bg, borderTopWidth: 1, borderTopColor: colors.light.ink,
    maxHeight: '70%', borderTopLeftRadius: 8, borderTopRightRadius: 8,
  },
  pickerHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: space.lg },
  cityCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderColor: colors.light.rule, borderRadius: 2,
    padding: space.lg, backgroundColor: colors.light.surface, marginTop: space.sm,
  },
  cityIcon: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.light.rule, alignItems: 'center', justifyContent: 'center' },
  cityOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: space.lg, paddingVertical: space.md,
    borderBottomWidth: 1, borderBottomColor: colors.light.rule,
  },
});
