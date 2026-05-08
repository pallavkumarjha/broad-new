import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch, TouchableOpacity, Alert, Linking, Image, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { colors, type as t, space, radius, fonts } from '../src/theme/tokens';
import { Eyebrow, Rule } from '../src/components/ui';
import { useSettings } from '../src/contexts/SettingsContext';
import { useAuth } from '../src/contexts/AuthContext';
import { api } from '../src/lib/api';
import Constants from 'expo-constants';

const APP_VERSION =
  (Constants.expoConfig?.version as string | undefined) ||
  (Constants.manifest as any)?.version ||
  '1.0';

function avatarUrl(name?: string): string {
  const seed = encodeURIComponent((name || 'Rider').trim() || 'Rider');
  return `https://ui-avatars.com/api/?name=${seed}&size=160&background=1C1B1A&color=F7F5F0&font-size=0.42&bold=true&format=png`;
}

// ---------- Row primitives -----------------------------------------------

function NavRow({ label, sub, badge, onPress, danger, testID }: {
  label: string; sub?: string; badge?: string; onPress?: () => void; danger?: boolean; testID?: string;
}) {
  const ink = danger ? colors.light.danger : colors.light.ink;
  return (
    <TouchableOpacity testID={testID} onPress={onPress} activeOpacity={0.7} style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={[t.body, { color: ink }]}>{label}</Text>
        {sub ? <Text style={styles.sub}>{sub}</Text> : null}
      </View>
      {badge ? <Text style={styles.badge}>{badge}</Text> : null}
      <Feather name="chevron-right" size={18} color={danger ? colors.light.danger : colors.light.inkMuted} style={{ marginLeft: 8 }} />
    </TouchableOpacity>
  );
}

function ToggleRow({ label, sub, value, onChange, testID }: {
  label: string; sub?: string; value: boolean; onChange: (v: boolean) => void; testID?: string;
}) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={[t.body, { color: colors.light.ink }]}>{label}</Text>
        {sub ? <Text style={styles.sub}>{sub}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.light.ink, false: colors.light.rule }}
        thumbColor="#FFFFFF"
        testID={testID}
      />
    </View>
  );
}

function SegmentRow({ label, sub, options, value, onChange, testID }: {
  label: string;
  sub?: string;
  options: { value: string; label: string; disabled?: boolean }[];
  value: string;
  onChange: (v: string) => void;
  testID?: string;
}) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={[t.body, { color: colors.light.ink }]}>{label}</Text>
        {sub ? <Text style={styles.sub}>{sub}</Text> : null}
      </View>
      <View style={styles.segment} testID={testID}>
        {options.map((opt, i) => {
          const on = value === opt.value;
          const isLast = i === options.length - 1;
          return (
            <TouchableOpacity
              key={opt.value}
              testID={`${testID}-${opt.value}`}
              disabled={opt.disabled}
              onPress={() => onChange(opt.value)}
              style={[
                styles.segmentBtn,
                on && styles.segmentBtnOn,
                !isLast && { borderRightWidth: 1, borderRightColor: colors.light.ink },
              ]}
              activeOpacity={0.85}
            >
              <Text style={[t.meta, {
                color: on ? colors.light.bg : opt.disabled ? colors.light.inkMuted : colors.light.ink,
                opacity: opt.disabled ? 0.5 : 1,
              }]}>{opt.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function SectionRows({ children, eyebrow, eyebrowColor }: { children: React.ReactNode; eyebrow: string; eyebrowColor?: string }) {
  return (
    <View style={styles.section}>
      <Eyebrow color={eyebrowColor}>{eyebrow}</Eyebrow>
      <View style={styles.sectionRows}>{children}</View>
    </View>
  );
}

// ---------- Screen --------------------------------------------------------

export default function Settings() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { settings, update } = useSettings();
  const [busyDelete, setBusyDelete] = useState(false);

  const togglePush = async (next: boolean) => {
    update({ pushEnabled: next });
    try {
      if (!next) await api.delete('/users/me/push-token');
      // Re-enable: the next app launch will re-register via AuthContext.
    } catch {
      // Don't block the toggle on a network failure — local state is still updated.
    }
  };

  const confirmSignOut = () => {
    Alert.alert('Sign out?', 'You will need to sign in again to use the app.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => { await signOut(); router.replace('/(auth)/login'); },
      },
    ]);
  };

  const confirmDelete = () => {
    Alert.alert(
      'Delete account?',
      'This permanently removes your profile, contacts, and trip requests. Trips you organised will be preserved for crew. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setBusyDelete(true);
            try {
              await api.delete('/users/me');
              await signOut();
              router.replace('/(auth)/login');
            } catch (e: any) {
              setBusyDelete(false);
              Alert.alert('Could not delete account', e?.response?.data?.detail || e?.message || 'Please try again.');
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} testID="settings-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="settings-back-btn" hitSlop={10}>
          <Feather name="arrow-left" size={22} color={colors.light.ink} />
        </TouchableOpacity>
        <Eyebrow>SETTINGS</Eyebrow>
        <View style={{ width: 22 }} />
      </View>
      <Rule />

      <ScrollView contentContainerStyle={{ paddingBottom: space.xxl }}>

        {/* Identity card */}
        {user ? (
          <TouchableOpacity
            testID="settings-identity"
            onPress={() => router.push('/profile/edit')}
            activeOpacity={0.85}
            style={styles.identity}
          >
            <Image source={{ uri: avatarUrl(user.name) }} style={styles.avatar} />
            <View style={{ flex: 1, marginLeft: space.md }}>
              <Text style={[t.h3, { color: colors.light.ink }]} numberOfLines={1}>{user.name}</Text>
              <Text style={styles.subTight}>{user.email.toUpperCase()}</Text>
            </View>
            <Feather name="chevron-right" size={20} color={colors.light.inkMuted} />
          </TouchableOpacity>
        ) : null}

        {/* ACCOUNT */}
        <SectionRows eyebrow="ACCOUNT">
          <NavRow
            testID="settings-edit-profile"
            label="Edit profile"
            sub="Name, bike, contacts"
            onPress={() => router.push('/profile/edit')}
          />
          <ToggleRow
            testID="setting-push"
            label="Push notifications"
            sub="Ride alerts, SOS, crew updates"
            value={settings.pushEnabled}
            onChange={togglePush}
          />
        </SectionRows>

        {/* RIDE */}
        <SectionRows eyebrow="RIDE">
          <ToggleRow
            testID="setting-bg-location"
            label="Background location"
            sub="Required for live ride & convoy"
            value={settings.bgLocation}
            onChange={(v) => update({ bgLocation: v })}
          />
          <ToggleRow
            testID="setting-crash"
            label="Crash detection"
            sub="Auto-trigger SOS on impact"
            value={settings.crashDetect}
            onChange={(v) => update({ crashDetect: v })}
          />
          <ToggleRow
            testID="setting-share-loc"
            label="Share live location"
            sub="Visible to your crew"
            value={settings.shareLiveLocation}
            onChange={(v) => update({ shareLiveLocation: v })}
          />
        </SectionRows>

        {/* FEEL */}
        <SectionRows eyebrow="FEEL">
          <ToggleRow
            testID="setting-haptics"
            label="Haptic feedback"
            sub="Light taps on actions"
            value={settings.haptics}
            onChange={(v) => update({ haptics: v })}
          />
          <SegmentRow
            testID="setting-units"
            label="Units"
            sub="Speed, distance, elevation"
            options={[{ value: 'metric', label: 'KM' }, { value: 'imperial', label: 'MI' }]}
            value={settings.units}
            onChange={(v) => update({ units: v as any })}
          />
          <SegmentRow
            testID="setting-theme"
            label="Theme"
            sub="Dark mode coming soon"
            options={[
              { value: 'light', label: 'LIGHT' },
              { value: 'dark', label: 'DARK', disabled: true },
            ]}
            value={'light'}
            onChange={() => {}}
          />
        </SectionRows>

        {/* DATA */}
        <SectionRows eyebrow="DATA">
          <NavRow
            testID="settings-export"
            label="Export ride history"
            sub="GPX + CSV bundle (coming soon)"
            onPress={() => Alert.alert('Coming soon', 'Bulk export will land in the next release.')}
          />
        </SectionRows>

        {/* ABOUT */}
        <SectionRows eyebrow="ABOUT">
          <NavRow
            testID="settings-version"
            label="Version"
            badge={`${APP_VERSION} BETA`}
          />
          <NavRow
            testID="settings-terms"
            label="Terms of service"
            onPress={() => Linking.openURL('https://broadrider.app/terms').catch(() => {})}
          />
          <NavRow
            testID="settings-privacy"
            label="Privacy policy"
            onPress={() => Linking.openURL('https://broadrider.app/privacy').catch(() => {})}
          />
          <NavRow
            testID="settings-help"
            label="Help & support"
            onPress={() => Linking.openURL('mailto:hello@broadrider.app?subject=Broad%20support').catch(() => {})}
          />
        </SectionRows>

        {/* DANGER */}
        <SectionRows eyebrow="DANGER ZONE" eyebrowColor={colors.light.danger}>
          <NavRow
            testID="settings-signout"
            label="Sign out"
            danger
            onPress={confirmSignOut}
          />
          <NavRow
            testID="settings-delete"
            label={busyDelete ? 'Deleting…' : 'Delete account'}
            sub="Permanent. Wipes profile, contacts, requests."
            danger
            onPress={busyDelete ? undefined : confirmDelete}
          />
        </SectionRows>

        {busyDelete ? (
          <View style={{ padding: space.lg, alignItems: 'center' }}>
            <ActivityIndicator color={colors.light.danger} />
          </View>
        ) : null}

        <View style={styles.madeIn}>
          <Text style={styles.madeInText}>MADE IN INDIA</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.light.bg },
  header: { paddingHorizontal: space.lg, paddingVertical: space.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  identity: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: space.lg, paddingVertical: space.lg,
    marginTop: space.md,
  },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    borderWidth: 1, borderColor: colors.light.rule,
    backgroundColor: colors.light.surface,
  },

  section: { paddingHorizontal: space.lg, paddingTop: space.xl },
  sectionRows: {
    marginTop: space.sm,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.light.rule,
  },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: space.md,
    paddingVertical: space.md,
    borderBottomWidth: 1, borderBottomColor: colors.light.rule,
  },
  // Last row in a sectionRows wrapper relies on the wrapper's bottom border;
  // we hide its own to avoid a double rule.
  sub: {
    fontFamily: fonts.mono, fontSize: 11, color: colors.light.inkMuted,
    marginTop: 4, letterSpacing: 0.4,
  },
  subTight: {
    fontFamily: fonts.mono, fontSize: 11, color: colors.light.inkMuted,
    marginTop: 2, letterSpacing: 0.4,
  },
  badge: {
    fontFamily: fonts.mono, fontSize: 11, color: colors.light.inkMuted,
    letterSpacing: 0.4,
  },

  segment: {
    flexDirection: 'row',
    borderWidth: 1, borderColor: colors.light.ink,
    borderRadius: radius.tiny, overflow: 'hidden',
  },
  segmentBtn: { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: 'transparent' },
  segmentBtnOn: { backgroundColor: colors.light.ink },

  madeIn: { paddingTop: space.xxl, alignItems: 'center' },
  madeInText: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.5, color: colors.light.inkMuted },
});
