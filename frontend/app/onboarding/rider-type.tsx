import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { api } from '../../src/lib/api';
import { useAuth, type RiderType } from '../../src/contexts/AuthContext';
import { queryClient } from '../../src/lib/queryClient';
import { colors, type, space, radius } from '../../src/theme/tokens';
import { Eyebrow, Button, Rule, Meta } from '../../src/components/ui';

type Option = {
  key: RiderType;
  title: string;
  subtitle: string;
  icon: keyof typeof Feather.glyphMap;
};

// Four archetypes covering ~95% of motorcycle users in India. Mixed is the
// safety net for "I don't fit one of these / I'll figure it out later."
const OPTIONS: Option[] = [
  {
    key: 'solo',
    title: 'Solo Explorer',
    subtitle: 'Long touring. Quiet roads. The horizon does the talking.',
    icon: 'compass',
  },
  {
    key: 'crew',
    title: 'Weekend Crew',
    subtitle: '2–8 riders. Familiar faces. Coffee at 6 AM.',
    icon: 'users',
  },
  {
    key: 'commuter',
    title: 'Daily Commuter',
    subtitle: 'City miles. Same route, fresh eyes. Safety net for the everyday.',
    icon: 'navigation',
  },
  {
    key: 'mixed',
    title: 'All of the above',
    subtitle: 'Just here for the road.',
    icon: 'circle',
  },
];

export default function RiderTypeScreen() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [selected, setSelected] = useState<RiderType | null>(null);
  const [busy, setBusy] = useState(false);

  // Persist + advance. We do NOT block the user if the backend write fails —
  // rider_type is a UX hint, not a hard requirement, and falling out of the
  // onboarding flow because the network blinked would be a worse experience
  // than a silently-empty rider_type field. We log via Alert only on save
  // continuation so the user can see something went wrong if they care.
  const submit = async () => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      await api.patch('/users/me', { rider_type: selected });
      await refresh();
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    } catch {
      // Soft-fail — let the user continue. Backend `rider_type` stays null;
      // they can re-pick from settings later.
    } finally {
      setBusy(false);
      router.push('/onboarding/rider-name');
    }
  };

  const skip = () => {
    // Skip writes nothing to the server — `rider_type` stays null on the
    // user record and the home feed falls back to its generic ranking.
    router.push('/onboarding/rider-name');
  };

  return (
    <SafeAreaView style={styles.container} testID="rider-type-screen">
      <View style={styles.header}>
        <Eyebrow>STEP 1 OF 4</Eyebrow>
        <Text style={[type.h1, styles.title]}>What kind of rider are you?</Text>
        <Text style={[type.body, styles.subtitle]}>
          One tap helps us tune your home feed. You can change this later in Settings.
        </Text>
      </View>
      <Rule />

      <ScrollView contentContainerStyle={{ paddingBottom: 180 }}>
        <View style={styles.list}>
          {OPTIONS.map((o) => {
            const active = selected === o.key;
            return (
              <TouchableOpacity
                key={o.key}
                testID={`rider-type-${o.key}`}
                activeOpacity={0.85}
                onPress={() => setSelected(o.key)}
                style={[styles.card, active && styles.cardActive]}
              >
                <View style={styles.cardHead}>
                  <View style={[styles.iconCircle, active && styles.iconCircleActive]}>
                    <Feather
                      name={o.icon}
                      size={18}
                      color={active ? colors.light.amber : colors.light.ink}
                    />
                  </View>
                  {active && (
                    <View style={styles.checkBadge} testID={`rider-type-${o.key}-check`}>
                      <Feather name="check" size={12} color="#FFFFFF" />
                    </View>
                  )}
                </View>
                <Text style={[type.h3, styles.cardTitle]}>{o.title}</Text>
                <Text style={[type.body, styles.cardSubtitle]}>{o.subtitle}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.cta}>
        <Button
          label={busy ? 'SAVING…' : 'CONTINUE'}
          onPress={submit}
          loading={busy}
          disabled={!selected}
          testID="rider-type-continue-btn"
        />
        <TouchableOpacity
          onPress={skip}
          style={styles.skipBtn}
          testID="rider-type-skip-btn"
        >
          <Meta>SKIP FOR NOW</Meta>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.light.bg },
  header: { padding: space.lg },
  title: { color: colors.light.ink, marginTop: space.xs },
  subtitle: { color: colors.light.inkMuted, marginTop: space.xs, lineHeight: 22 },

  list: { paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.md },
  card: {
    borderWidth: 1, borderColor: colors.light.rule, borderRadius: radius.tiny,
    padding: space.lg, backgroundColor: colors.light.surface,
    position: 'relative', overflow: 'hidden',
  },
  cardActive: {
    borderColor: colors.light.amber, borderWidth: 1.5,
    backgroundColor: '#FDF6EC',
  },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  iconCircle: {
    width: 36, height: 36, borderRadius: 18,
    borderWidth: 1, borderColor: colors.light.rule,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.light.bg,
  },
  iconCircleActive: { borderColor: colors.light.amber },
  checkBadge: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: colors.light.amber,
    alignItems: 'center', justifyContent: 'center',
  },
  cardTitle: { color: colors.light.ink, marginTop: space.md },
  cardSubtitle: { color: colors.light.inkMuted, marginTop: 4, lineHeight: 20 },

  cta: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    padding: space.lg,
    borderTopWidth: 1, borderTopColor: colors.light.rule,
    backgroundColor: colors.light.bg,
  },
  skipBtn: { alignItems: 'center', marginTop: space.md, paddingVertical: 4 },
});
