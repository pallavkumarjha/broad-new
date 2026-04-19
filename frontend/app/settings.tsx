import React from 'react';
import { View, Text, StyleSheet, ScrollView, Switch, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius } from '../src/theme/tokens';
import { Eyebrow, Rule, Card, Meta } from '../src/components/ui';
import { useSettings } from '../src/contexts/SettingsContext';

export default function Settings() {
  const router = useRouter();
  const { settings, update } = useSettings();

  const Row = ({ label, sublabel, value, onChange, testID }: any) => (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={[type.body, { color: colors.light.ink }]}>{label}</Text>
        {sublabel && <Text style={[type.meta, { color: colors.light.inkMuted, marginTop: 4 }]}>{sublabel}</Text>}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.light.ink, false: colors.light.rule }} thumbColor="#FFFFFF" testID={testID} />
    </View>
  );

  return (
    <SafeAreaView style={styles.container} testID="settings-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="settings-back-btn"><Feather name="arrow-left" size={22} color={colors.light.ink} /></TouchableOpacity>
        <Eyebrow>PREFERENCES & CONTROL</Eyebrow>
        <View style={{ width: 22 }} />
      </View>
      <Rule />
      <ScrollView contentContainerStyle={{ paddingBottom: space.xxl }}>
        <View style={styles.section}>
          <Eyebrow>RIDE</Eyebrow>
          <Card style={{ marginTop: space.sm }}>
            <Row label="Background location" sublabel="REQUIRED FOR LIVE RIDE & CONVOY" value={settings.bgLocation} onChange={(v: boolean) => update({ bgLocation: v })} testID="setting-bg-location" />
            <Rule />
            <Row label="Crash detection" sublabel="AUTO-TRIGGER SOS ON IMPACT" value={settings.crashDetect} onChange={(v: boolean) => update({ crashDetect: v })} testID="setting-crash" />
            <Rule />
            <Row label="Share live location" sublabel="VISIBLE TO YOUR CREW" value={settings.shareLiveLocation} onChange={(v: boolean) => update({ shareLiveLocation: v })} testID="setting-share-loc" />
          </Card>
        </View>

        <View style={styles.section}>
          <Eyebrow>FEEL</Eyebrow>
          <Card style={{ marginTop: space.sm }}>
            <Row label="Haptic feedback" sublabel="LIGHT TAPS ON ACTIONS" value={settings.haptics} onChange={(v: boolean) => update({ haptics: v })} testID="setting-haptics" />
            <Rule />
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={[type.body, { color: colors.light.ink }]}>Units</Text>
                <Text style={[type.meta, { color: colors.light.inkMuted, marginTop: 4 }]}>HOW SPEED, DISTANCE & ELEVATION READ</Text>
              </View>
              <View style={styles.segment}>
                <TouchableOpacity
                  testID="setting-units-metric"
                  onPress={() => update({ units: 'metric' })}
                  style={[styles.segmentBtn, settings.units === 'metric' && styles.segmentBtnOn]}
                  activeOpacity={0.85}
                >
                  <Meta style={{ color: settings.units === 'metric' ? '#FFFFFF' : colors.light.ink }}>KM</Meta>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="setting-units-imperial"
                  onPress={() => update({ units: 'imperial' })}
                  style={[styles.segmentBtn, settings.units === 'imperial' && styles.segmentBtnOn]}
                  activeOpacity={0.85}
                >
                  <Meta style={{ color: settings.units === 'imperial' ? '#FFFFFF' : colors.light.ink }}>MI</Meta>
                </TouchableOpacity>
              </View>
            </View>
          </Card>
        </View>

        <View style={styles.section}>
          <Eyebrow>ABOUT</Eyebrow>
          <Card style={{ marginTop: space.sm }}>
            <Text style={[type.body, { color: colors.light.ink }]}>Broad — The Rider's Companion</Text>
            <Text style={[type.meta, { color: colors.light.inkMuted, marginTop: 6 }]}>VERSION 1.0 BETA · MADE IN INDIA</Text>
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.light.bg },
  header: { paddingHorizontal: space.lg, paddingVertical: space.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  section: { paddingHorizontal: space.lg, paddingTop: space.xl },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.md, gap: space.md },
  segment: {
    flexDirection: 'row', borderWidth: 1, borderColor: colors.light.ink,
    borderRadius: radius.tiny, overflow: 'hidden',
  },
  segmentBtn: { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: 'transparent' },
  segmentBtnOn: { backgroundColor: colors.light.ink },
});
