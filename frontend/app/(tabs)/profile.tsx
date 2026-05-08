import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import { api } from '../../src/lib/api';
import { queryClient } from '../../src/lib/queryClient';
import { colors, type, space, fonts } from '../../src/theme/tokens';
import { Eyebrow, Rule, SpecRow, Card, Meta, Button } from '../../src/components/ui';

// Top 20 most-populated Indian cities (city proper, 2024 estimates) + Other.
const CITIES = [
  'Mumbai', 'Delhi', 'Bengaluru', 'Hyderabad', 'Ahmedabad',
  'Chennai', 'Kolkata', 'Surat', 'Pune', 'Jaipur',
  'Lucknow', 'Kanpur', 'Nagpur', 'Indore', 'Thane',
  'Bhopal', 'Visakhapatnam', 'Pimpri-Chinchwad', 'Patna', 'Vadodara',
  'Other',
];

function formatMemberSince(iso?: string): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-US', { month: 'short', year: 'numeric' }).toUpperCase();
  } catch { return '—'; }
}

// Deterministic dummy avatar — no upload, no PII to a third party beyond the
// user's display name. ui-avatars renders a clean type-on-color tile.
function avatarUrl(name?: string): string {
  const seed = encodeURIComponent((name || 'Rider').trim() || 'Rider');
  return `https://ui-avatars.com/api/?name=${seed}&size=160&background=1C1B1A&color=F7F5F0&font-size=0.42&bold=true&format=png`;
}

export default function Profile() {
  const { user, signOut, refresh } = useAuth();
  const router = useRouter();
  const [badges, setBadges] = useState<any[]>([]);
  const [cityPickerOpen, setCityPickerOpen] = useState(false);
  const [savingCity, setSavingCity] = useState(false);
  const [optimisticCity, setOptimisticCity] = useState<string | null | undefined>(undefined);

  useFocusEffect(
    React.useCallback(() => {
      (async () => {
        try { const { data } = await api.get('/users/me/achievements'); setBadges(data.badges || []); } catch {}
      })();
    }, [])
  );

  const displayCity = optimisticCity !== undefined ? optimisticCity : user?.home_city;

  const setHomeCity = async (city: string | null) => {
    setCityPickerOpen(false);
    setOptimisticCity(city);
    setSavingCity(true);
    try {
      await api.patch('/users/me', { home_city: city });
      await refresh();
      setOptimisticCity(undefined);
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      queryClient.invalidateQueries({ queryKey: ['trips', 'discover'] });
    } catch (e: any) {
      setOptimisticCity(undefined);
      Alert.alert('Could not save home city', e?.response?.data?.detail || e?.message || 'Please try again.');
    } finally { setSavingCity(false); }
  };

  if (!user) return null;

  const totalKm = Math.round(user.stats.total_km).toLocaleString();
  const trips = user.stats.trips_completed;
  const highPt = user.stats.highest_point_m.toLocaleString();
  const memberSince = formatMemberSince(user.created_at);
  const contactCount = user.emergency_contacts.length;

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="profile-screen">
      <ScrollView contentContainerStyle={{ paddingBottom: space.xxl }}>

        {/* MASTHEAD --------------------------------------------------------- */}
        <View style={styles.masthead}>
          <View style={styles.mastheadTopRow}>
            <Eyebrow>RIDER № {user.id.slice(0, 6).toUpperCase()}</Eyebrow>
            <View style={{ flexDirection: 'row', gap: space.md }}>
              <TouchableOpacity testID="profile-edit-btn" onPress={() => router.push('/profile/edit')} hitSlop={8}>
                <Text style={[type.meta, { color: colors.light.ink }]}>EDIT</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="profile-settings-btn" onPress={() => router.push('/settings')} hitSlop={8}>
                <Text style={[type.meta, { color: colors.light.ink }]}>SETTINGS</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.identityRow}>
            <Image
              testID="profile-avatar"
              source={{ uri: avatarUrl(user.name) }}
              style={styles.avatar}
            />
            <View style={{ flex: 1, marginLeft: space.md }}>
              <Text style={[type.h1, { color: colors.light.ink }]} numberOfLines={1}>{user.name}</Text>
              <Meta style={{ marginTop: 4 }}>MEMBER SINCE {memberSince}</Meta>
            </View>
          </View>
        </View>

        <Rule />

        {/* HERO STAT — instrument numeral ---------------------------------- */}
        <View style={styles.heroStat}>
          <Eyebrow>LIFETIME DISTANCE</Eyebrow>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: space.xs }}>
            <Text style={[type.instrument, { color: colors.light.ink }]} testID="profile-total-km">{totalKm}</Text>
            <Text style={[type.h3, { color: colors.light.inkMuted, marginLeft: space.sm }]}>KM</Text>
          </View>
          <View style={styles.miniStatsRow}>
            <View style={styles.miniStat}>
              <Text style={[type.h2, { color: colors.light.ink }]}>{trips}</Text>
              <Meta style={{ marginTop: 2 }}>TRIPS</Meta>
            </View>
            <View style={styles.miniStatDivider} />
            <View style={styles.miniStat}>
              <Text style={[type.h2, { color: colors.light.ink }]}>{highPt}<Text style={[type.meta, { color: colors.light.inkMuted }]}> M</Text></Text>
              <Meta style={{ marginTop: 2 }}>HIGHEST POINT</Meta>
            </View>
            <View style={styles.miniStatDivider} />
            <View style={styles.miniStat}>
              <Text style={[type.h2, { color: colors.light.ink }]}>{badges.length}</Text>
              <Meta style={{ marginTop: 2 }}>BADGES</Meta>
            </View>
          </View>
        </View>

        <Rule />

        {/* ACHIEVEMENTS — horizontal strip --------------------------------- */}
        <View style={styles.section}>
          <Eyebrow>ACHIEVEMENTS</Eyebrow>
          {badges.length === 0 ? (
            <View style={styles.emptyTile}>
              <Feather name="award" size={20} color={colors.light.inkMuted} />
              <Text style={[type.body, { color: colors.light.inkMuted, marginTop: space.sm }]}>
                None yet. Complete a ride to earn your first badge.
              </Text>
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: space.sm, paddingTop: space.sm, paddingRight: space.lg }}
              style={{ marginHorizontal: -space.lg, paddingLeft: space.lg }}
            >
              {badges.map((b) => (
                <View key={b.code} style={styles.badgeTile} testID={`badge-${b.code}`}>
                  <View style={styles.badgeDot}>
                    <Feather name="award" size={16} color={colors.light.amber} />
                  </View>
                  <Text style={[type.body, { color: colors.light.ink, fontFamily: fonts.serifMed, marginTop: space.sm }]} numberOfLines={2}>
                    {b.title}
                  </Text>
                  <Meta style={{ marginTop: 4 }}>{(b.meta || '').toUpperCase()}</Meta>
                </View>
              ))}
            </ScrollView>
          )}
        </View>

        {/* GEAR ------------------------------------------------------------ */}
        <View style={styles.section}>
          <Eyebrow>THE BIKE</Eyebrow>
          <Card style={{ marginTop: space.sm }}>
            <SpecRow label="MAKE" value={(user.bike.make || '—').toUpperCase()} />
            <SpecRow label="MODEL" value={(user.bike.model || '—').toUpperCase()} />
            <SpecRow label="REGISTRATION" value={(user.bike.registration || '—').toUpperCase()} />
            <SpecRow label="ODOMETER" value={`${user.bike.odometer_km?.toLocaleString() || 0} KM`} last />
          </Card>
        </View>

        {/* PREFERENCES ----------------------------------------------------- */}
        <View style={styles.section}>
          <Eyebrow>PREFERENCES</Eyebrow>
          <TouchableOpacity
            testID="profile-home-city-btn"
            onPress={() => setCityPickerOpen(true)}
            style={styles.prefRow}
            activeOpacity={0.85}
          >
            <View style={{ flex: 1 }}>
              <Meta>HOME CITY · DISCOVER FILTER</Meta>
              <Text style={[type.h3, { color: colors.light.ink, marginTop: 4 }]}>
                {displayCity || 'Not set'}
              </Text>
            </View>
            {savingCity
              ? <ActivityIndicator size="small" color={colors.light.inkMuted} />
              : <Feather name="chevron-right" size={20} color={colors.light.inkMuted} />}
          </TouchableOpacity>
        </View>

        {/* SAFETY ---------------------------------------------------------- */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Eyebrow>EMERGENCY CONTACTS · {contactCount || '—'}</Eyebrow>
            <TouchableOpacity
              testID="profile-add-contact-btn"
              onPress={() => router.push('/profile/edit')}
              hitSlop={8}
            >
              <Text style={[type.meta, { color: colors.light.amber }]}>+ ADD</Text>
            </TouchableOpacity>
          </View>
          <Card style={{ marginTop: space.sm }}>
            {contactCount === 0 ? (
              <Text style={[type.body, { color: colors.light.inkMuted }]}>None yet. Add one — for the bad day.</Text>
            ) : user.emergency_contacts.map((c, i) => (
              <View key={i} style={[styles.contactRow, i === contactCount - 1 ? null : styles.contactRowDivider]}>
                <View style={{ flex: 1 }}>
                  <Text style={[type.body, { color: colors.light.ink, fontFamily: fonts.serifMed }]}>{c.name}</Text>
                  <Meta style={{ marginTop: 2 }}>{(c.relation || 'CONTACT').toUpperCase()}</Meta>
                </View>
                <Text style={[type.meta, { color: colors.light.ink }]}>{c.phone}</Text>
              </View>
            ))}
          </Card>
        </View>

        {/* DOCUMENTS ------------------------------------------------------- */}
        <View style={styles.section}>
          <Eyebrow>DOCUMENTS</Eyebrow>
          <TouchableOpacity
            testID="profile-glovebox-btn"
            onPress={() => router.push('/glovebox' as any)}
            style={styles.gloveboxRow}
            activeOpacity={0.85}
          >
            <View style={styles.gloveboxIcon}>
              <Feather name="lock" size={16} color={colors.light.ink} />
            </View>
            <View style={{ flex: 1, marginLeft: space.md }}>
              <Text style={[type.h3, { color: colors.light.ink }]}>Glovebox</Text>
              <Meta style={{ marginTop: 2 }}>DEVICE-ONLY · NEVER UPLOADED</Meta>
            </View>
            <Feather name="chevron-right" size={20} color={colors.light.inkMuted} />
          </TouchableOpacity>
        </View>

        {/* FOOTER ---------------------------------------------------------- */}
        <View style={styles.footer}>
          <Meta>{user.email.toUpperCase()}</Meta>
          <TouchableOpacity
            testID="profile-signout-btn"
            onPress={async () => { await signOut(); router.replace('/(auth)/login'); }}
            hitSlop={8}
          >
            <Text style={[type.meta, { color: colors.light.danger }]}>SIGN OUT</Text>
          </TouchableOpacity>
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
                    <Text style={[type.body, { color: user.home_city === city ? colors.light.ink : colors.light.inkMuted, fontFamily: user.home_city === city ? fonts.serifMed : undefined }]}>
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

  // Masthead
  masthead: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.lg },
  mastheadTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  identityRow: { flexDirection: 'row', alignItems: 'center', marginTop: space.lg },
  avatar: {
    width: 56, height: 56, borderRadius: 28,
    borderWidth: 1, borderColor: colors.light.rule,
    backgroundColor: colors.light.surface,
  },

  // Hero stat
  heroStat: { paddingHorizontal: space.lg, paddingVertical: space.lg },
  miniStatsRow: { flexDirection: 'row', alignItems: 'stretch', marginTop: space.lg },
  miniStat: { flex: 1 },
  miniStatDivider: { width: 1, backgroundColor: colors.light.rule, marginHorizontal: space.md },

  // Sections
  section: { paddingHorizontal: space.lg, marginTop: space.xl },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

  // Achievements
  emptyTile: {
    marginTop: space.sm, padding: space.lg,
    borderWidth: 1, borderColor: colors.light.rule, borderRadius: 2,
    backgroundColor: colors.light.surface,
    alignItems: 'flex-start',
  },
  badgeTile: {
    width: 160, padding: space.md,
    borderWidth: 1, borderColor: colors.light.rule, borderRadius: 2,
    backgroundColor: colors.light.surface,
  },
  badgeDot: {
    width: 32, height: 32, borderRadius: 16,
    borderWidth: 1, borderColor: colors.light.amber,
    alignItems: 'center', justifyContent: 'center',
  },

  // Preferences
  prefRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: space.md, marginTop: space.xs,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.light.rule,
  },

  // Safety
  contactRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: space.md },
  contactRowDivider: { borderBottomWidth: 1, borderBottomColor: colors.light.rule },

  // Documents
  gloveboxRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: space.md, marginTop: space.sm,
    borderWidth: 1, borderColor: colors.light.rule, borderRadius: 2,
    backgroundColor: colors.light.surface,
  },
  gloveboxIcon: {
    width: 36, height: 36,
    borderWidth: 1, borderColor: colors.light.rule,
    alignItems: 'center', justifyContent: 'center',
  },

  // Footer
  footer: {
    paddingHorizontal: space.lg, marginTop: space.xxl,
    paddingTop: space.lg,
    borderTopWidth: 1, borderTopColor: colors.light.rule,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },

  // City picker
  pickerOverlay: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end',
  },
  pickerModal: {
    backgroundColor: colors.light.bg, borderTopWidth: 1, borderTopColor: colors.light.ink,
    maxHeight: '70%', borderTopLeftRadius: 8, borderTopRightRadius: 8,
  },
  pickerHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: space.lg },
  cityOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: space.lg, paddingVertical: space.md,
    borderBottomWidth: 1, borderBottomColor: colors.light.rule,
  },
});
